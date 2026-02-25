import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal';

interface QRCodeModalProps {
  open: boolean;
  tableName: string;
  tableNumber: string;
  /** Full URL the QR encodes (never expires) */
  url: string;
  onClose: () => void;
}

export default function QRCodeModal({
  open,
  tableName,
  tableNumber,
  url,
  onClose,
}: QRCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const lastUrlRef = useRef<string>('');

  // Render QR code to canvas when modal opens
  useEffect(() => {
    if (!open || !canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, url, {
      width: 280,
      margin: 2,
      color: { dark: '#1F3D36', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });

    // Only regenerate the high-res download URL when the URL actually changes
    if (url !== lastUrlRef.current) {
      lastUrlRef.current = url;
      QRCode.toDataURL(url, {
        width: 1024,
        margin: 3,
        color: { dark: '#1F3D36', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      }).then(setDataUrl);
    }
  }, [open, url]);

  const handleDownload = () => {
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.download = `QR-Table-${tableNumber}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal open={open} title="Table QR Code" onClose={onClose}>
      <div className="flex flex-col items-center gap-5 py-2">
        {/* Table info */}
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary">{tableName || tableNumber}</p>
          {tableName && (
            <p className="text-sm text-text-muted">Table {tableNumber}</p>
          )}
        </div>

        {/* QR Code canvas */}
        <div className="bg-white p-4 rounded-2xl border-2 border-gray-100 shadow-sm">
          <canvas ref={canvasRef} />
        </div>

        {/* URL preview */}
        <div className="w-full px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide mb-0.5">
            Scan URL (never expires)
          </p>
          <p className="text-xs text-text-secondary break-all font-mono">{url}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-text-secondary bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
          >
            Close
          </button>
          <button
            onClick={handleDownload}
            disabled={!dataUrl}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl shadow-sm transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PNG
          </button>
        </div>
      </div>
    </Modal>
  );
}
