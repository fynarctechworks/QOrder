/**
 * Fingerprint Scanner Bridge — WebSocket server that connects
 * the browser-based admin panel to a USB fingerprint scanner.
 *
 * This module is started alongside the backend server. It runs a
 * WebSocket server on localhost:9200 (configurable via FINGERPRINT_BRIDGE_PORT).
 *
 * Environment variables:
 *   FINGERPRINT_BRIDGE_PORT     - WebSocket port (default: 9200)
 *   FINGERPRINT_BRIDGE_ADAPTER  - Force adapter: mantra | secugen | digitalpersona | simulate | auto (default: auto)
 *   FINGERPRINT_BRIDGE_DISABLED - Set to "true" to disable the bridge entirely
 */

import { WebSocketServer, WebSocket } from 'ws';
import { getAdapter, type ScannerAdapter } from './adapters/index.js';
import { logger } from '../lib/index.js';

const BRIDGE_PORT = parseInt(process.env['FINGERPRINT_BRIDGE_PORT'] || '9200', 10);
const BRIDGE_ADAPTER = process.env['FINGERPRINT_BRIDGE_ADAPTER'] || 'auto';
const BRIDGE_DISABLED = process.env['FINGERPRINT_BRIDGE_DISABLED'] === 'true';

interface BridgeMessage {
  id: string;
  command: string;
  payload?: Record<string, unknown>;
}

let wss: WebSocketServer | null = null;
let adapter: ScannerAdapter | null = null;

export async function startFingerprintBridge(): Promise<void> {
  if (BRIDGE_DISABLED) {
    logger.info('Fingerprint bridge disabled via FINGERPRINT_BRIDGE_DISABLED');
    return;
  }

  try {
    adapter = await getAdapter(BRIDGE_ADAPTER);
    logger.info({ adapter: adapter.name, port: BRIDGE_PORT }, 'Fingerprint bridge: adapter loaded');

    if (adapter.deviceInfo) {
      const info = await adapter.deviceInfo();
      logger.info({ device: info.deviceName, serial: info.serialNumber }, 'Fingerprint bridge: device info');
    }
  } catch (err) {
    logger.warn({ err }, 'Fingerprint bridge: failed to load adapter, falling back to simulate');
    adapter = await getAdapter('simulate');
  }

  wss = new WebSocketServer({
    port: BRIDGE_PORT,
    host: '127.0.0.1', // Only accept local connections (security)
  });

  wss.on('listening', () => {
    logger.info({ port: BRIDGE_PORT }, 'Fingerprint bridge: WebSocket server running');
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const origin = req.headers.origin || 'unknown';
    logger.info({ origin }, 'Fingerprint bridge: browser connected');

    ws.on('message', async (raw: Buffer) => {
      let msg: BridgeMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ id: null, success: false, error: 'Invalid JSON' }));
        return;
      }

      const { id, command, payload } = msg;

      try {
        let data: unknown;

        switch (command) {
          case 'capture': {
            data = await adapter!.capture(payload);
            break;
          }

          case 'match': {
            const p = payload as { template1?: string; template2?: string; threshold?: number } | undefined;
            if (!p?.template1 || !p?.template2) {
              throw new Error('match requires template1 and template2 in payload');
            }
            data = await adapter!.match(p.template1, p.template2, p.threshold);
            break;
          }

          case 'info': {
            data = adapter!.deviceInfo ? await adapter!.deviceInfo() : {
              connected: true,
              deviceName: adapter!.name,
              serialNumber: 'N/A',
              sdkVersion: '1.0.0',
            };
            break;
          }

          default:
            throw new Error(`Unknown command: ${command}`);
        }

        ws.send(JSON.stringify({ id, success: true, data }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.warn({ command, error: message }, 'Fingerprint bridge: command error');
        ws.send(JSON.stringify({ id, success: false, error: message }));
      }
    });

    ws.on('close', () => {
      logger.info('Fingerprint bridge: browser disconnected');
    });

    ws.on('error', (err) => {
      logger.warn({ err: err.message }, 'Fingerprint bridge: WebSocket error');
    });
  });

  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn({ port: BRIDGE_PORT }, 'Fingerprint bridge: port already in use, bridge not started');
    } else {
      logger.warn({ err: err.message }, 'Fingerprint bridge: server error');
    }
  });
}

export function stopFingerprintBridge(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
  if (adapter?.dispose) {
    adapter.dispose();
    adapter = null;
  }
}
