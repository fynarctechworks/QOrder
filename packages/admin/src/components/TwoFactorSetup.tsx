import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { twoFactorService } from '../services/twoFactorService';

export default function TwoFactorSetup() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [otpAuthUrl, setOtpAuthUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const result = await twoFactorService.getStatus();
      setEnabled(result.enabled);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup() {
    setProcessing(true);
    try {
      const result = await twoFactorService.setup();
      setOtpAuthUrl(result.otpAuthUrl);
      setSecret(result.secret);
      setSetupMode(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set up 2FA');
    } finally {
      setProcessing(false);
    }
  }

  async function handleEnable() {
    if (!verifyCode || verifyCode.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }

    setProcessing(true);
    try {
      const result = await twoFactorService.enable(verifyCode);
      setBackupCodes(result.backupCodes);
      setShowBackupCodes(true);
      setEnabled(true);
      setSetupMode(false);
      toast.success('Two-factor authentication enabled!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setProcessing(false);
    }
  }

  async function handleDisable() {
    if (!disablePassword) {
      toast.error('Password is required');
      return;
    }

    setProcessing(true);
    try {
      await twoFactorService.disable(disablePassword);
      setEnabled(false);
      setShowDisable(false);
      setDisablePassword('');
      toast.success('Two-factor authentication disabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setProcessing(false);
    }
  }

  function downloadBackupCodes() {
    const text = `QR Order - 2FA Backup Codes\n${'='.repeat(30)}\n\nSave these codes somewhere safe.\nEach code can only be used once.\n\n${backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nGenerated: ${new Date().toLocaleDateString()}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qrorder-2fa-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="animate-pulse h-20 bg-gray-100 rounded-xl" />;
  }

  // Show backup codes after enabling
  if (showBackupCodes) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Save Your Backup Codes</h3>
        <p className="text-sm text-text-muted mb-4">
          Save these codes somewhere safe. Each code can only be used once if
          you lose access to your authenticator app.
        </p>

        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, i) => (
              <div key={i} className="font-mono text-sm text-text-primary bg-white px-3 py-1.5 rounded-lg text-center">
                {code}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={downloadBackupCodes}
            className="flex-1 py-2.5 bg-gray-100 text-text-primary rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Download Codes
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(backupCodes.join('\n'));
              toast.success('Codes copied!');
            }}
            className="flex-1 py-2.5 bg-gray-100 text-text-primary rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Copy to Clipboard
          </button>
        </div>

        <button
          onClick={() => setShowBackupCodes(false)}
          className="w-full mt-3 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          I've saved my codes
        </button>
      </div>
    );
  }

  // Setup mode — show QR code
  if (setupMode) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Set Up Two-Factor Authentication</h3>
        <p className="text-sm text-text-muted mb-4">
          Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </p>

        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center mb-4">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpAuthUrl)}`}
            alt="2FA QR Code"
            className="mx-auto w-48 h-48"
          />
          <div className="mt-3">
            <p className="text-xs text-text-muted mb-1">Can't scan? Enter this code manually:</p>
            <code className="text-sm font-mono bg-gray-100 px-3 py-1 rounded select-all">{secret}</code>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Enter the 6-digit code from your app
          </label>
          <input
            type="text"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm text-center tracking-widest font-mono text-lg"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setSetupMode(false);
              setVerifyCode('');
            }}
            className="flex-1 py-2.5 border border-gray-200 text-text-primary rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleEnable}
            disabled={processing || verifyCode.length !== 6}
            className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {processing ? 'Verifying...' : 'Enable 2FA'}
          </button>
        </div>
      </div>
    );
  }

  // Disable confirmation
  if (showDisable) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-red-600 mb-2">Disable Two-Factor Authentication</h3>
        <p className="text-sm text-text-muted mb-4">
          Enter your password to confirm disabling 2FA. This will make your account less secure.
        </p>

        <div className="mb-4">
          <input
            type="password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowDisable(false);
              setDisablePassword('');
            }}
            className="flex-1 py-2.5 border border-gray-200 text-text-primary rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDisable}
            disabled={processing || !disablePassword}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {processing ? 'Disabling...' : 'Disable 2FA'}
          </button>
        </div>
      </div>
    );
  }

  // Default: show status + enable/disable button
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Two-Factor Authentication</h3>
          <p className="text-sm text-text-muted mt-0.5">
            {enabled
              ? 'Your account is protected with 2FA'
              : 'Add an extra layer of security to your account'}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {enabled ? 'Enabled' : 'Disabled'}
        </div>
      </div>

      <div className="mt-4">
        {enabled ? (
          <button
            onClick={() => setShowDisable(true)}
            className="px-4 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
          >
            Disable 2FA
          </button>
        ) : (
          <button
            onClick={handleSetup}
            disabled={processing}
            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {processing ? 'Setting up...' : 'Enable 2FA'}
          </button>
        )}
      </div>
    </div>
  );
}
