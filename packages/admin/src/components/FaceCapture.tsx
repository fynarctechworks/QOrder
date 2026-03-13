import { useState, useRef, useEffect, useCallback } from 'react';
import * as faceapi from 'face-api.js';

/* ────────────────── Types ────────────────────────── */

export interface FaceCaptureResult {
  descriptor: Float32Array;
  photo: Blob;
}

interface FaceCaptureProps {
  /** "register" = multi-capture for enrollment; "verify" = single capture with liveness */
  mode?: 'register' | 'verify';
  /** Register mode: called once with all captured embeddings when user clicks Done */
  onRegisterComplete?: (captures: FaceCaptureResult[]) => void;
  /** Verify mode: called with single descriptor + liveness flag */
  onVerifyComplete?: (descriptor: Float32Array, livenessConfirmed: boolean) => void;
  /** Legacy single-capture callback (backward compat) */
  onCapture?: (descriptor: Float32Array, photo: Blob) => void;
  onClose: () => void;
}

/* ──────── Helpers: Eye Aspect Ratio for blink detection ──────── */

function dist(a: faceapi.Point, b: faceapi.Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Compute Eye Aspect Ratio (EAR) from 68-point face landmarks */
function computeEAR(landmarks: faceapi.FaceLandmarks68): number {
  const pts = landmarks.positions as faceapi.Point[];
  // Left eye: points 36-41
  const leftEAR =
    (dist(pts[37]!, pts[41]!) + dist(pts[38]!, pts[40]!)) / (2 * dist(pts[36]!, pts[39]!));
  // Right eye: points 42-47
  const rightEAR =
    (dist(pts[43]!, pts[47]!) + dist(pts[44]!, pts[46]!)) / (2 * dist(pts[42]!, pts[45]!));
  return (leftEAR + rightEAR) / 2;
}

const EAR_BLINK_THRESHOLD = 0.24; // EAR below this = eyes closed
const MIN_CAPTURES_REGISTER = 3;
const MAX_CAPTURES_REGISTER = 5;

const CAPTURE_LABELS = ['Front', 'Slight Left', 'Slight Right', 'Front (2)', 'Front (3)'];

/* ────────────────── Component ────────────────────── */

export default function FaceCapture({
  mode = 'register',
  onRegisterComplete,
  onVerifyComplete,
  onCapture,
  onClose,
}: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const livenessLoopRef = useRef<number | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'detecting' | 'captured' | 'error'>('loading');
  const [error, setError] = useState('');

  // Liveness state (verify mode)
  const [blinkDetected, setBlinkDetected] = useState(false);
  const blinkCountRef = useRef(0);
  const eyeWasOpenRef = useRef(true);

  // Multi-capture state (register mode)
  const [captures, setCaptures] = useState<FaceCaptureResult[]>([]);
  const [capturePreviewUrls, setCapturePreviewUrls] = useState<string[]>([]);

  // Load models and start camera
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setStatus('loading');
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('ready');
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to start camera');
          setStatus('error');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (livenessLoopRef.current) cancelAnimationFrame(livenessLoopRef.current);
    };
  }, []);

  // Start liveness monitoring loop when in verify mode and camera is ready
  useEffect(() => {
    if (mode !== 'verify' || status !== 'ready') return;

    let active = true;

    async function livenessLoop() {
      if (!active || !videoRef.current) return;

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
          .withFaceLandmarks();

        if (detection && active) {
          const ear = computeEAR(detection.landmarks);

          if (ear < EAR_BLINK_THRESHOLD && eyeWasOpenRef.current) {
            // Eyes just closed — blink start
            eyeWasOpenRef.current = false;
          } else if (ear >= EAR_BLINK_THRESHOLD && !eyeWasOpenRef.current) {
            // Eyes just opened — blink complete
            eyeWasOpenRef.current = true;
            blinkCountRef.current += 1;
            if (blinkCountRef.current >= 1) {
              setBlinkDetected(true);
            }
          }
        }
      } catch {
        // Ignore detection errors in monitoring loop
      }

      if (active) {
        livenessLoopRef.current = requestAnimationFrame(() => {
          setTimeout(livenessLoop, 300); // Check ~3x per second
        });
      }
    }

    livenessLoop();

    return () => {
      active = false;
      if (livenessLoopRef.current) cancelAnimationFrame(livenessLoopRef.current);
    };
  }, [mode, status]);

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setStatus('detecting');

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setError('No face detected. Please face the camera clearly and try again.');
        setStatus('ready');
        return;
      }

      // Draw snapshot to canvas
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(videoRef.current, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Failed to capture photo'))), 'image/jpeg', 0.9);
      });

      if (mode === 'register') {
        // Multi-capture: add to list, keep camera running
        const newCapture: FaceCaptureResult = { descriptor: detection.descriptor, photo: blob };
        setCaptures(prev => [...prev, newCapture]);
        setCapturePreviewUrls(prev => [...prev, URL.createObjectURL(blob)]);
        setError('');
        setStatus('ready');
      } else {
        // Verify mode: single capture
        setStatus('captured');
        streamRef.current?.getTracks().forEach(t => t.stop());
        if (livenessLoopRef.current) cancelAnimationFrame(livenessLoopRef.current);

        if (onVerifyComplete) {
          onVerifyComplete(detection.descriptor, blinkDetected);
        } else if (onCapture) {
          onCapture(detection.descriptor, blob);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Detection failed');
      setStatus('ready');
    }
  }, [mode, blinkDetected, onVerifyComplete, onCapture]);

  const handleDone = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (onRegisterComplete) {
      onRegisterComplete(captures);
    }
    // Clean up preview URLs
    capturePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    onClose();
  }, [captures, capturePreviewUrls, onRegisterComplete, onClose]);

  const removeCapture = useCallback((index: number) => {
    const url = capturePreviewUrls[index];
    if (url) URL.revokeObjectURL(url);
    setCaptures(prev => prev.filter((_, i) => i !== index));
    setCapturePreviewUrls(prev => prev.filter((_, i) => i !== index));
  }, [capturePreviewUrls]);

  const handleClose = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (livenessLoopRef.current) cancelAnimationFrame(livenessLoopRef.current);
    capturePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    onClose();
  };

  const isRegister = mode === 'register';
  const canCapture = isRegister
    ? status === 'ready' && captures.length < MAX_CAPTURES_REGISTER
    : status === 'ready' && blinkDetected;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isRegister ? 'bg-primary/10' : 'bg-blue-50'}`}>
              <svg className={`w-5 h-5 ${isRegister ? 'text-primary' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isRegister ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                )}
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-text-primary">
                {isRegister ? 'Register Face' : 'Face Verification'}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {isRegister
                  ? `Capture ${MIN_CAPTURES_REGISTER}+ photos from different angles`
                  : 'Blink naturally, then capture your face'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video / Status Area */}
        <div className="relative bg-gray-900 aspect-[4/3] flex items-center justify-center">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />

          {/* Face outline guide */}
          {(status === 'ready') && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-48 h-60 border-2 rounded-[50%] transition-colors ${
                isRegister ? 'border-white/40' : blinkDetected ? 'border-green-400' : 'border-amber-400'
              }`} />
            </div>
          )}

          {/* Liveness indicator for verify mode */}
          {mode === 'verify' && status === 'ready' && (
            <div className="absolute top-3 left-3 right-3 flex justify-center">
              <div className={`px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm ${
                blinkDetected
                  ? 'bg-green-500/80 text-white'
                  : 'bg-amber-500/80 text-white animate-pulse'
              }`}>
                {blinkDetected ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Liveness verified — ready to capture
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                    Please blink naturally...
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Register mode: capture count indicator */}
          {isRegister && status === 'ready' && captures.length > 0 && (
            <div className="absolute top-3 left-3 right-3 flex justify-center">
              <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/80 text-white backdrop-blur-sm">
                {captures.length}/{MAX_CAPTURES_REGISTER} captured
                {captures.length < MIN_CAPTURES_REGISTER && ` (need ${MIN_CAPTURES_REGISTER - captures.length} more)`}
              </div>
            </div>
          )}

          {/* Register mode: angle guide */}
          {isRegister && status === 'ready' && captures.length < MAX_CAPTURES_REGISTER && (
            <div className="absolute bottom-3 left-3 right-3 flex justify-center">
              <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-black/50 text-white backdrop-blur-sm">
                {CAPTURE_LABELS[captures.length] || 'Any angle'}
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {status === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 text-white">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
              <p className="text-sm">Loading face detection models...</p>
            </div>
          )}

          {/* Detecting overlay */}
          {status === 'detecting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/60 text-white">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
              <p className="text-sm">Analyzing face...</p>
            </div>
          )}

          {/* Captured overlay (verify mode only) */}
          {status === 'captured' && !isRegister && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/60 text-white">
              <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-medium">Face captured successfully!</p>
            </div>
          )}

          {/* Error overlay */}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 text-white px-6 text-center">
              <svg className="w-10 h-10 text-red-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Register mode: capture preview strip */}
        {isRegister && captures.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {capturePreviewUrls.map((url, i) => (
                <div key={i} className="relative shrink-0 group">
                  <img src={url} alt={`Capture ${i + 1}`} className="w-14 h-14 rounded-lg object-cover border-2 border-green-300" />
                  <button
                    onClick={() => removeCapture(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] text-center rounded-b-lg py-0.5 leading-tight">
                    {CAPTURE_LABELS[i] || `#${i + 1}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between border-t border-gray-100">
          {error && status === 'ready' && (
            <p className="text-xs text-red-500 flex-1 mr-3">{error}</p>
          )}
          {!error && status === 'ready' && !isRegister && !blinkDetected && (
            <p className="text-xs text-amber-600 flex-1 mr-3">Anti-spoofing: blink naturally to prove liveness</p>
          )}
          {!error && status === 'ready' && !isRegister && blinkDetected && (
            <p className="text-xs text-green-600 flex-1 mr-3">Liveness confirmed — you can capture now</p>
          )}
          {!error && status === 'ready' && isRegister && (
            <p className="text-xs text-text-muted flex-1 mr-3">
              {captures.length === 0 ? 'Position face within the oval and click capture' : `${CAPTURE_LABELS[captures.length] || 'Any angle'}: adjust position and capture`}
            </p>
          )}
          {(status !== 'ready' && status !== 'error') && <div className="flex-1" />}

          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-text-secondary hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            {isRegister && captures.length >= MIN_CAPTURES_REGISTER && status === 'ready' && (
              <button
                type="button"
                onClick={handleDone}
                className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors"
              >
                Done ({captures.length} captured)
              </button>
            )}
            {canCapture && (
              <button
                type="button"
                onClick={capture}
                className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors"
              >
                {isRegister ? `Capture (${captures.length + 1}/${MAX_CAPTURES_REGISTER})` : 'Capture'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
