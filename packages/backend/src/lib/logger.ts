import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.isDevelopment ? 'debug' : 'info',
  ...(config.isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  // In production, pino outputs newline-delimited JSON by default
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  // Redact sensitive fields
  redact: {
    paths: ['password', 'passwordHash', 'token', 'refreshToken', 'accessToken', 'authorization'],
    censor: '[REDACTED]',
  },
});
