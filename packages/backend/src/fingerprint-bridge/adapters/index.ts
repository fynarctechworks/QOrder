/**
 * Scanner Adapter Registry
 *
 * Each adapter wraps a specific scanner SDK and exposes a uniform interface:
 *   - name: string
 *   - capture(opts?): Promise<CaptureResult>
 *   - match(t1, t2, threshold?): Promise<MatchResult>
 *   - deviceInfo?(): Promise<DeviceInfo>
 *   - dispose?(): void
 */

import { SimulateAdapter } from './simulate.js';
import { MantraAdapter } from './mantra.js';
import { SecuGenAdapter } from './secugen.js';
import { DigitalPersonaAdapter } from './digitalpersona.js';
import type { ScannerAdapter } from './types.js';

export type { ScannerAdapter, CaptureResult, MatchResult, DeviceInfo } from './types.js';

function tryLoadAdapter(name: string): ScannerAdapter | null {
  try {
    switch (name) {
      case 'mantra':
        return new MantraAdapter();
      case 'secugen':
        return new SecuGenAdapter();
      case 'digitalpersona':
        return new DigitalPersonaAdapter();
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function autoDetect(): Promise<ScannerAdapter> {
  const order = ['mantra', 'secugen', 'digitalpersona'] as const;

  for (const name of order) {
    const adapter = tryLoadAdapter(name);
    if (adapter) {
      try {
        if (adapter.deviceInfo) {
          const info = await adapter.deviceInfo();
          if (info.connected) {
            console.log(`[FingerprintBridge] Auto-detected: ${adapter.name}`);
            return adapter;
          }
        }
        return adapter;
      } catch {
        continue;
      }
    }
  }

  console.log('[FingerprintBridge] No hardware scanner found — falling back to simulator');
  return new SimulateAdapter();
}

export async function getAdapter(name: string): Promise<ScannerAdapter> {
  if (name === 'simulate' || name === 'sim') {
    return new SimulateAdapter();
  }

  if (name === 'auto') {
    return autoDetect();
  }

  const adapter = tryLoadAdapter(name);
  if (!adapter) {
    throw new Error(`Scanner adapter "${name}" not found. Available: mantra, secugen, digitalpersona, simulate`);
  }

  return adapter;
}
