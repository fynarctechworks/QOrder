/**
 * DigitalPersona Adapter — Placeholder
 */

import type { ScannerAdapter, CaptureResult, MatchResult, DeviceInfo } from './types.js';

export class DigitalPersonaAdapter implements ScannerAdapter {
  name = 'DigitalPersona (Not Configured)';

  async capture(): Promise<CaptureResult> {
    throw new Error(
      'DigitalPersona adapter not yet configured. Install the One Touch SDK and update the digitalpersona adapter. ' +
      'For testing, set FINGERPRINT_BRIDGE_ADAPTER=simulate in your environment.'
    );
  }

  async match(): Promise<MatchResult> {
    throw new Error('DigitalPersona adapter not yet configured.');
  }

  async deviceInfo(): Promise<DeviceInfo> {
    return { connected: false, deviceName: 'DigitalPersona (Not Configured)', serialNumber: 'N/A', sdkVersion: 'N/A' };
  }
}
