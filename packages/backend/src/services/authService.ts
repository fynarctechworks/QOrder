import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { config } from '../config/index.js';
import { prisma, AppError, logger } from '../lib/index.js';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types/index.js';
import type { RegisterInput, LoginInput } from '../validators/index.js';
import { generateOTP, sendVerificationEmail, sendPasswordResetEmail } from './emailService.js';

const SALT_ROUNDS = 12;
const OTP_EXPIRY_MINUTES = 10;

/** SHA-256 hash a token for safe DB storage */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Parse duration strings like "15m", "7d" to milliseconds
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match?.[1] || !match[2]) return 15 * 60 * 1000; // Default 15 minutes

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}

// Generate URL-friendly slug from restaurant name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

export const authService = {
  // Register a new restaurant owner
  async register(input: RegisterInput) {
    const { email, username, password, name, restaurantName } = input;

    // Check if email already exists (but allow re-registration if not yet verified)
    const existingEmail = await prisma.user.findFirst({
      where: { email },
    });

    if (existingEmail && existingEmail.isVerified) {
      throw AppError.conflict('This email already has an account. Try logging in instead.');
    }

    // Check if username already exists (by a different verified user)
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUsername && existingUsername.isVerified && existingUsername.id !== existingEmail?.id) {
      throw AppError.conflict('This username is already taken. Please choose a different one.');
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // If unverified user exists with same email, update their data
    if (existingEmail && !existingEmail.isVerified) {
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      await prisma.user.update({
        where: { id: existingEmail.id },
        data: {
          username,
          passwordHash,
          name,
          verificationCode: otp,
          verificationExpiry: otpExpiry,
        },
      });

      // Send OTP email
      await sendVerificationEmail(email, otp, name);

      return {
        message: 'Verification code sent to your email',
        email,
        requiresVerification: true,
      };
    }

    // Generate unique slug for restaurant
    let slug = generateSlug(restaurantName);
    let slugExists = await prisma.restaurant.findUnique({ where: { slug } });
    let suffix = 1;

    while (slugExists) {
      slug = `${generateSlug(restaurantName)}-${suffix}`;
      slugExists = await prisma.restaurant.findUnique({ where: { slug } });
      suffix++;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create restaurant and owner in transaction (unverified)
    await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          slug,
        },
      });

      await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          name,
          role: 'OWNER',
          restaurantId: restaurant.id,
          isVerified: false,
          verificationCode: otp,
          verificationExpiry: otpExpiry,
        },
      });
    });

    // Send OTP email
    await sendVerificationEmail(email, otp, name);

    return {
      message: 'Verification code sent to your email',
      email,
      requiresVerification: true,
    };
  },

  // Verify email with OTP
  async verifyEmail(email: string, code: string) {
    const user = await prisma.user.findFirst({
      where: { email },
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true, onboardingCompleted: true },
        },
      },
    });

    if (!user) {
      throw AppError.notFound('User');
    }

    if (user.isVerified) {
      throw AppError.conflict('Email is already verified');
    }

    if (!user.verificationCode || !user.verificationExpiry) {
      throw AppError.badRequest('No verification code found. Please register again.');
    }

    if (new Date() > user.verificationExpiry) {
      throw AppError.badRequest('Verification code has expired. Please request a new one.');
    }

    if (user.verificationCode !== code) {
      throw AppError.badRequest('Invalid verification code');
    }

    // Mark as verified and clear code
    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationExpiry: null,
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        roleTitle: true,
        restaurantId: true,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(verifiedUser);

    return {
      user: verifiedUser,
      restaurant: user.restaurant,
      ...tokens,
    };
  },

  // Resend OTP
  async resendVerificationCode(email: string) {
    const user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
      throw AppError.notFound('User');
    }

    if (user.isVerified) {
      throw AppError.conflict('Email is already verified');
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode: otp,
        verificationExpiry: otpExpiry,
      },
    });

    await sendVerificationEmail(email, otp, user.name);

    return { message: 'New verification code sent to your email' };
  },

  // Login with email/username and password
  async login(input: LoginInput) {
    const { identifier, password } = input;

    // Try finding user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            onboardingCompleted: true,
          },
        },
      },
    });

    if (!user) {
      throw AppError.unauthorized('Invalid credentials');
    }

    if (!user.isActive) {
      throw AppError.forbidden('Account is deactivated');
    }

    if (!user.isVerified) {
      throw AppError.forbidden('Email not verified. Please check your email for the verification code.');
    }

    if (!user.restaurant.isActive) {
      throw AppError.forbidden('Restaurant is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw AppError.unauthorized('Invalid credentials');
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      return {
        requires2FA: true,
        userId: user.id,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          role: user.role,
          roleTitle: user.roleTitle,
          restaurantId: user.restaurantId,
        },
        restaurant: user.restaurant,
        accessToken: '',
        refreshToken: '',
        expiresAt: new Date(0),
      };
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const tokens = await this.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
    });

    return {
      requires2FA: false,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        roleTitle: user.roleTitle,
        restaurantId: user.restaurantId,
      },
      restaurant: user.restaurant,
      ...tokens,
    };
  },

  // Verify 2FA code and complete login
  async verifyTwoFactorLogin(userId: string, code: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            onboardingCompleted: true,
          },
        },
      },
    });

    if (!user) throw AppError.notFound('User');
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw AppError.badRequest('2FA is not enabled for this account');
    }

    // Try TOTP code first
    const { verify } = await import('otplib');
    const verifyResult = await verify({ token: code, secret: user.twoFactorSecret });
    let isValid = verifyResult.valid;

    // If not valid, try backup codes
    if (!isValid) {
      const { twoFactorService } = await import('./twoFactorService.js');
      isValid = await twoFactorService.verifyBackupCode(userId, code);
    }

    if (!isValid) {
      throw AppError.unauthorized('Invalid 2FA code');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        roleTitle: user.roleTitle,
        restaurantId: user.restaurantId,
      },
      restaurant: user.restaurant,
      ...tokens,
    };
  },

  // Refresh access token
  async refreshToken(refreshToken: string) {
    try {
      const payload = jwt.verify(
        refreshToken,
        config.jwt.refreshSecret
      ) as RefreshTokenPayload;

      // Hash incoming token and look up by hashed value
      const hashedToken = hashToken(refreshToken);

      const storedToken = await prisma.refreshToken.findFirst({
        where: { id: payload.tokenId, token: hashedToken },
        include: {
          user: {
            include: {
              restaurant: {
                select: { id: true, isActive: true },
              },
            },
          },
        },
      });

      if (!storedToken) {
        throw AppError.unauthorized('Invalid refresh token');
      }

      if (storedToken.expiresAt < new Date()) {
        // Delete expired token
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
        throw AppError.unauthorized('Refresh token expired');
      }

      if (!storedToken.user.isActive || !storedToken.user.restaurant.isActive) {
        throw AppError.forbidden('Account or restaurant is deactivated');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken({
        userId: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
        restaurantId: storedToken.user.restaurantId,
      });

      // Update last login time
      await prisma.user.update({
        where: { id: storedToken.user.id },
        data: { lastLoginAt: new Date() },
      });

      return { accessToken };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.warn('Invalid refresh token attempt');
      throw AppError.unauthorized('Invalid refresh token');
    }
  },

  // Logout (revoke refresh token)
  async logout(refreshToken: string) {
    try {
      const payload = jwt.verify(
        refreshToken,
        config.jwt.refreshSecret
      ) as RefreshTokenPayload;

      // Delete by tokenId (primary key) — no need to hash
      await prisma.refreshToken.delete({
        where: { id: payload.tokenId },
      });

      logger.info({ tokenId: payload.tokenId }, 'Refresh token revoked');
    } catch {
      // Token already invalid or deleted, ignore
    }
  },

  // Logout from all devices
  async logoutAll(userId: string) {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  },

  // Generate access and refresh tokens
  async generateTokens(user: {
    id: string;
    email: string | null;
    role: string;
    restaurantId: string;
  }) {
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role as AccessTokenPayload['role'],
      restaurantId: user.restaurantId,
    });

    const { refreshToken, expiresAt } = await this.generateRefreshToken(user.id);

    return { accessToken, refreshToken, expiresAt };
  },

  // Generate access token
  generateAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn,
    } as SignOptions);
  },

  // Generate refresh token and store in database
  async generateRefreshToken(userId: string) {
    const tokenId = uuidv4();
    const expiresAt = new Date(
      Date.now() + parseDuration(config.jwt.refreshExpiresIn)
    );

    const payload: RefreshTokenPayload = {
      userId,
      tokenId,
    };

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    } as SignOptions);

    // Store SHA-256 hash — never store the raw JWT
    const hashedToken = hashToken(refreshToken);

    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        token: hashedToken,
        userId,
        expiresAt,
      },
    });

    logger.info({ userId, tokenId }, 'Refresh token issued');

    return { refreshToken, expiresAt };
  },

  // Change password
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AppError.notFound('User');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isPasswordValid) {
      throw AppError.unauthorized('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Revoke all refresh tokens (force re-login)
    await this.logoutAll(userId);
  },

  // Request password reset — sends OTP to user's email
  async forgotPassword(email: string) {
    const user = await prisma.user.findFirst({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user || !user.isVerified || !user.isActive) {
      return { message: 'If an account with that email exists, a reset code has been sent.' };
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationCode: otp, verificationExpiry: otpExpiry },
    });

    await sendPasswordResetEmail(email, otp, user.name);

    return { message: 'If an account with that email exists, a reset code has been sent.' };
  },

  // Reset password with OTP
  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
      throw AppError.badRequest('Invalid or expired reset code');
    }

    if (!user.verificationCode || !user.verificationExpiry) {
      throw AppError.badRequest('No reset code found. Please request a new one.');
    }

    if (new Date() > user.verificationExpiry) {
      throw AppError.badRequest('Reset code has expired. Please request a new one.');
    }

    if (user.verificationCode !== code) {
      throw AppError.badRequest('Invalid reset code');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        verificationCode: null,
        verificationExpiry: null,
      },
    });

    // Revoke all refresh tokens (force re-login on all devices)
    await this.logoutAll(user.id);

    return { message: 'Password reset successfully. Please login with your new password.' };
  },

  // Clean up expired refresh tokens
  async cleanupExpiredTokens() {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  },
};
