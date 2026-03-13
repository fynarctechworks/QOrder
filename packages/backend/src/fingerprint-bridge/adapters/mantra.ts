/**
 * Mantra MFS100 Adapter
 *
 * Connects to Mantra MFS100 USB fingerprint scanner via the native
 * .NET SDK (MANTRA.MFS100.dll) installed at:
 *   C:\Program Files\Mantra\MFS100\Driver\MFS100Test\
 *
 * Uses a PowerShell helper script to call the .NET SDK since
 * Node.js cannot load .NET DLLs directly.
 *
 * Prerequisites:
 *   1. Install Mantra MFS100 driver
 *   2. USB device plugged in
 */

import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { ScannerAdapter, CaptureResult, MatchResult, DeviceInfo } from './types.js';

// Resolve the helper script path - works for both ts (dev) and compiled js (dist)
function resolveHelperScript(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'scripts', 'mantra-helper.ps1'),
    path.resolve(__dirname, '..', '..', 'fingerprint-bridge', 'scripts', 'mantra-helper.ps1'),
    path.resolve(__dirname, '..', '..', '..', 'src', 'fingerprint-bridge', 'scripts', 'mantra-helper.ps1'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`mantra-helper.ps1 not found. Searched: ${candidates.join(', ')}`);
}

interface HelperResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// Use 32-bit PowerShell because MFS100Dll.dll is a 32-bit native DLL
const POWERSHELL_X86 = 'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';

function runHelper(command: Record<string, unknown>): Promise<HelperResponse> {
  return new Promise((resolve, reject) => {
    const cmdJson = JSON.stringify(command);
    
    // Prefer 32-bit PowerShell for the 32-bit native DLL, fall back to default
    const psExe = fs.existsSync(POWERSHELL_X86) ? POWERSHELL_X86 : 'powershell.exe';

    execFile(
      psExe,
      ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-NonInteractive', '-File', resolveHelperScript(), '-Command', cmdJson],
      { timeout: 30000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && !stdout.trim()) {
          reject(new Error(`PowerShell error: ${stderr || error.message}`));
          return;
        }

        try {
          // SDK may print debug lines to stdout; find the JSON line
          const lines = stdout.trim().split('\n');
          const jsonLine = lines.reverse().find(l => l.trim().startsWith('{'));
          if (!jsonLine) throw new Error('No JSON output');
          const result = JSON.parse(jsonLine.trim()) as HelperResponse;
          resolve(result);
        } catch {
          reject(new Error(`Invalid response from helper: ${stdout.trim() || stderr}`));
        }
      }
    );
  });
}

export class MantraAdapter implements ScannerAdapter {
  name = 'Mantra MFS100';

  async capture(): Promise<CaptureResult> {
    const result = await runHelper({ action: 'capture', timeout: 10000 });

    if (!result.success) {
      throw new Error(result.error ?? 'Capture failed');
    }

    return result.data as unknown as CaptureResult;
  }

  async match(template1: string, template2: string, threshold = 40): Promise<MatchResult> {
    const result = await runHelper({ action: 'match', template1, template2, threshold });

    if (!result.success) {
      throw new Error(result.error ?? 'Match failed');
    }

    return result.data as unknown as MatchResult;
  }

  async deviceInfo(): Promise<DeviceInfo> {
    try {
      const result = await runHelper({ action: 'info' });

      if (!result.success) {
        return { connected: false, deviceName: 'Mantra MFS100', serialNumber: 'N/A', sdkVersion: 'N/A' };
      }

      return result.data as unknown as DeviceInfo;
    } catch {
      return { connected: false, deviceName: 'Mantra MFS100', serialNumber: 'N/A', sdkVersion: 'N/A' };
    }
  }

  dispose() {
    // No persistent state to clean up
  }
}
