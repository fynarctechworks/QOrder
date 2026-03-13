/**
 * SecuGen Adapter — Placeholder
 */

import type { ScannerAdapter, CaptureResult, MatchResult, DeviceInfo } from './types.js';

export class SecuGenAdapter implements ScannerAdapter {
  name = 'SecuGen (Not Configured)';

  async capture(): Promise<CaptureResult> {
    throw new Error(
      'SecuGen adapter not yet configured. Install SecuGen FDx SDK and update the secugen adapter. ' +
      'For testing, set FINGERPRINT_BRIDGE_ADAPTER=simulate in your environment.'
    );
  }

  async match(): Promise<MatchResult> {
    throw new Error('SecuGen adapter not yet configured.');
  }

  async deviceInfo(): Promise<DeviceInfo> {
    return { connected: false, deviceName: 'SecuGen (Not Configured)', serialNumber: 'N/A', sdkVersion: 'N/A' };
  }
}
