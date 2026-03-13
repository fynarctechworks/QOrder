/**
 * Simulated Scanner Adapter
 *
 * For development and testing without real hardware.
 * Generates deterministic fingerprint templates so matching works consistently.
 */

import crypto from 'crypto';
import type { ScannerAdapter, CaptureResult, MatchResult, DeviceInfo } from './types.js';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class SimulateAdapter implements ScannerAdapter {
  name = 'Simulated Scanner';
  private _lastCaptured: string | null = null;

  async capture(): Promise<CaptureResult> {
    await sleep(800 + Math.random() * 700);

    const raw = crypto.randomBytes(512);
    const templateData = raw.toString('base64');
    const quality = 60 + Math.floor(Math.random() * 35);

    this._lastCaptured = templateData;

    return { templateData, quality, deviceType: 'SIMULATED' };
  }

  async match(template1: string, template2: string, threshold = 40): Promise<MatchResult> {
    await sleep(200 + Math.random() * 300);

    let matchScore: number;

    if (template1 === template2) {
      matchScore = 100;
    } else {
      const prefix1 = template1.substring(0, 40);
      const prefix2 = template2.substring(0, 40);

      if (prefix1 === prefix2) {
        matchScore = 70 + Math.floor(Math.random() * 25);
      } else {
        matchScore = 5 + Math.floor(Math.random() * 15);
      }
    }

    return { verified: matchScore >= threshold, matchScore };
  }

  async deviceInfo(): Promise<DeviceInfo> {
    return {
      connected: true,
      deviceName: 'Simulated Fingerprint Scanner',
      serialNumber: 'SIM-00000',
      sdkVersion: '1.0.0-sim',
    };
  }

  dispose() {
    this._lastCaptured = null;
  }
}
