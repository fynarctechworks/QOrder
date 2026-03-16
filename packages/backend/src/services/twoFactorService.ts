import { generateSecret, generateURI, verify } from 'otplib';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma, AppError } from '../lib/index.js';

const db = prisma as any;

const BACKUP_CODE_COUNT = 8;

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    codes.push(randomBytes(4).toString('hex')); // 8-char hex codes
  }
  return codes;
}

async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
}

export const twoFactorService = {
  /** Generate a new TOTP secret and return QR code URI + secret */
  async generateSecret(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true, twoFactorEnabled: true },
    });
    if (!user) throw AppError.notFound('User');
    if (user.twoFactorEnabled) throw AppError.conflict('2FA is already enabled');

    const secret = generateSecret();
    const label = user.email || user.username;
    const otpAuthUrl = generateURI({
      issuer: 'QROrder',
      label,
      secret,
    });

    // Store secret temporarily (not yet enabled until verified)
    await db.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    return { secret, otpAuthUrl };
  },

  /** Verify TOTP code and enable 2FA, returning backup codes */
  async enable(userId: string, code: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user) throw AppError.notFound('User');
    if (user.twoFactorEnabled) throw AppError.conflict('2FA is already enabled');
    if (!user.twoFactorSecret) throw AppError.badRequest('No 2FA setup in progress. Generate a secret first.');

    const verifyResult = await verify({
      token: code,
      secret: user.twoFactorSecret,
    });
    const isValid = verifyResult.valid;

    if (!isValid) throw AppError.badRequest('Invalid verification code');

    // Generate backup codes
    const backupCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(backupCodes);

    await db.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: hashedCodes,
      },
    });

    return { backupCodes }; // Return plaintext codes ONCE for user to save
  },

  /** Verify TOTP code during login */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) return false;

    const verifyResult = await verify({ token: code, secret: user.twoFactorSecret });
    return verifyResult.valid;
  },

  /** Verify backup code during login (one-time use) */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { twoFactorBackupCodes: true, twoFactorEnabled: true },
    });
    if (!user?.twoFactorEnabled) return false;

    const storedCodes = ((user.twoFactorBackupCodes as unknown as string[]) || []).slice();
    let matchIndex = -1;

    for (let i = 0; i < storedCodes.length; i++) {
      const match = await bcrypt.compare(code, storedCodes[i]!);
      if (match) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex === -1) return false;

    // Remove used backup code
    storedCodes.splice(matchIndex, 1);
    await db.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: storedCodes },
    });

    return true;
  },

  /** Disable 2FA (requires password verification done by caller) */
  async disable(userId: string) {
    await db.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: Prisma.JsonNull,
      },
    });
  },
};
