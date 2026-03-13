/**
 * Scanner Adapter Interface Types
 */

export interface CaptureResult {
  templateData: string;
  quality: number;
  deviceType: string;
}

export interface MatchResult {
  verified: boolean;
  matchScore: number;
}

export interface DeviceInfo {
  connected: boolean;
  deviceName: string;
  serialNumber: string;
  sdkVersion: string;
}

export interface ScannerAdapter {
  name: string;
  capture(opts?: unknown): Promise<CaptureResult>;
  match(template1: string, template2: string, threshold?: number): Promise<MatchResult>;
  deviceInfo?(): Promise<DeviceInfo>;
  dispose?(): void;
}
