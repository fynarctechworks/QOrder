/**
 * BiometricBridge — WebSocket client for communicating with the local
 * fingerprint scanner bridge application running on the user's machine.
 *
 * The bridge is a small desktop app (Node.js/Electron) that:
 * 1. Connects to the USB fingerprint scanner via the device SDK
 * 2. Exposes a WebSocket server on localhost
 * 3. Accepts commands: capture, match, info
 * 4. Returns fingerprint templates and match results
 *
 * Protocol:
 *   Client → Bridge: { command: 'capture' | 'match' | 'info', payload?: any, id: string }
 *   Bridge → Client: { id: string, success: boolean, data?: any, error?: string }
 */

type MessageHandler = (msg: BridgeResponse) => void;
type StatusHandler = (status: BridgeStatus) => void;

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface CaptureResult {
  templateData: string;  // Base64-encoded fingerprint template
  quality: number;       // 0-100 quality score
  deviceType: string;    // Device model identifier
}

export interface MatchResult {
  verified: boolean;
  matchScore: number;    // 0-100 match confidence
}

export interface DeviceInfo {
  connected: boolean;
  deviceName: string;
  serialNumber: string;
  sdkVersion: string;
}

const DEFAULT_PORT = 9200;
const RECONNECT_DELAY = 3000;
const REQUEST_TIMEOUT = 30000; // 30s for fingerprint capture

class BiometricBridge {
  private ws: WebSocket | null = null;
  private status: BridgeStatus = 'disconnected';
  private pendingRequests = new Map<string, { resolve: (v: BridgeResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private statusListeners = new Set<StatusHandler>();
  private messageListeners = new Set<MessageHandler>();
  private port = DEFAULT_PORT;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private setStatus(s: BridgeStatus) {
    this.status = s;
    this.statusListeners.forEach(fn => fn(s));
  }

  getStatus(): BridgeStatus { return this.status; }

  onStatus(fn: StatusHandler): () => void {
    this.statusListeners.add(fn);
    return () => { this.statusListeners.delete(fn); };
  }

  onMessage(fn: MessageHandler): () => void {
    this.messageListeners.add(fn);
    return () => { this.messageListeners.delete(fn); };
  }

  connect(port?: number) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.port = port ?? DEFAULT_PORT;
    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect() {
    this.setStatus('connecting');
    try {
      this.ws = new WebSocket(`ws://localhost:${this.port}`);
    } catch {
      this.setStatus('error');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setStatus('connected');
    };

    this.ws.onclose = () => {
      this.setStatus('disconnected');
      this.rejectAllPending('Bridge disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setStatus('error');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: BridgeResponse = JSON.parse(typeof event.data === 'string' ? event.data : '');
        this.messageListeners.forEach(fn => fn(msg));
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.id);
          pending.resolve(msg);
        }
      } catch { /* ignore malformed messages */ }
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.rejectAllPending('Disconnected');
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.setStatus('disconnected');
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) this.doConnect();
    }, RECONNECT_DELAY);
  }

  private rejectAllPending(reason: string) {
    for (const [, p] of this.pendingRequests) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  private send(command: string, payload?: any): Promise<BridgeResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Bridge not connected'));
        return;
      }

      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timed out'));
      }, REQUEST_TIMEOUT);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, command, payload }));
    });
  }

  // ── Public Commands ──

  /** Capture a fingerprint from the scanner. Returns template data. */
  async capture(): Promise<CaptureResult> {
    const res = await this.send('capture');
    if (!res.success) throw new Error(res.error ?? 'Capture failed');
    return res.data as CaptureResult;
  }

  /** Match a captured template against a stored template using the device SDK. */
  async match(capturedTemplate: string, storedTemplate: string): Promise<MatchResult> {
    const res = await this.send('match', { template1: capturedTemplate, template2: storedTemplate });
    if (!res.success) throw new Error(res.error ?? 'Match failed');
    return res.data as MatchResult;
  }

  /** Get device information. */
  async getDeviceInfo(): Promise<DeviceInfo> {
    const res = await this.send('info');
    if (!res.success) throw new Error(res.error ?? 'Failed to get device info');
    return res.data as DeviceInfo;
  }
}

/** Singleton bridge instance */
export const biometricBridge = new BiometricBridge();
