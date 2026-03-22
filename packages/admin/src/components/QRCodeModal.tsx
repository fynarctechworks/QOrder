import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal';

const API_BASE = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.infynarc.com/api' : 'http://localhost:3000/api')).replace('/api', '');

interface QRCodeModalProps {
  open: boolean;
  tableName: string;
  tableNumber: string;
  /** Full URL the QR encodes (never expires) */
  url: string;
  /** Restaurant logo URL to overlay in the center of the QR */
  logoUrl?: string;
  onClose: () => void;
}

export default function QRCodeModal({
  open,
  tableName,
  tableNumber,
  url,
  logoUrl,
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
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });

    // Only regenerate the high-res download URL when the URL actually changes
    if (url !== lastUrlRef.current) {
      lastUrlRef.current = url;
      QRCode.toDataURL(url, {
        width: 1024,
        margin: 3,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      }).then(setDataUrl);
    }
  }, [open, url]);

  const handleDownload = async () => {
    if (!dataUrl) return;

    const SCALE = 2;
    const SVG_W = 612;
    const SVG_H = 792;
    const QR_X = 114.375;
    const QR_Y = 249.699;
    const QR_SIZE = 381.3125;
    const PAD = 15;

    const canvas = document.createElement('canvas');
    canvas.width = SVG_W * SCALE;
    canvas.height = SVG_H * SCALE;
    const ctx = canvas.getContext('2d')!;

    const svgBlob = await fetch('/QOrder QR layout.svg').then((r) => r.blob());
    const svgUrl = URL.createObjectURL(svgBlob);

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, SVG_W * SCALE, SVG_H * SCALE);
        URL.revokeObjectURL(svgUrl);
        resolve();
      };
      img.onerror = reject;
      img.src = svgUrl;
    });

    const qrX = (QR_X + PAD) * SCALE;
    const qrY = (QR_Y + PAD) * SCALE;
    const qrSize = (QR_SIZE - PAD * 2) * SCALE;

    await new Promise<void>((resolve, reject) => {
      const qr = new Image();
      qr.onload = () => {
        ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
        resolve();
      };
      qr.onerror = reject;
      qr.src = dataUrl;
    });

    // Draw logo in center of QR if provided
    if (logoUrl) {
      const resolvedLogo = logoUrl.startsWith('/uploads') ? `${API_BASE}${logoUrl}` : logoUrl;
      const logoSize = qrSize * 0.22;
      const logoPad = logoSize * 0.15;
      const logoX = qrX + (qrSize - logoSize) / 2;
      const logoY = qrY + (qrSize - logoSize) / 2;

      await new Promise<void>((resolve) => {
        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.onload = () => {
          // White rounded background behind logo
          const r = logoPad;
          const bx = logoX - logoPad;
          const by = logoY - logoPad;
          const bSize = logoSize + logoPad * 2;
          ctx.beginPath();
          ctx.moveTo(bx + r, by);
          ctx.lineTo(bx + bSize - r, by);
          ctx.quadraticCurveTo(bx + bSize, by, bx + bSize, by + r);
          ctx.lineTo(bx + bSize, by + bSize - r);
          ctx.quadraticCurveTo(bx + bSize, by + bSize, bx + bSize - r, by + bSize);
          ctx.lineTo(bx + r, by + bSize);
          ctx.quadraticCurveTo(bx, by + bSize, bx, by + bSize - r);
          ctx.lineTo(bx, by + r);
          ctx.quadraticCurveTo(bx, by, bx + r, by);
          ctx.closePath();
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
          resolve();
        };
        logo.onerror = () => resolve(); // skip logo silently if it fails
        logo.src = resolvedLogo;
      });
    }

    const link = document.createElement('a');
    link.download = `QR-Table-${tableNumber}.png`;
    link.href = canvas.toDataURL('image/png');
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
