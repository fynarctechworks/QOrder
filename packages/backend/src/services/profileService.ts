import bcrypt from 'bcryptjs';
import { prisma, AppError } from '../lib/index.js';
import { generateOTP, sendVerificationEmail } from './emailService.js';

const SALT_ROUNDS = 12;
const OTP_EXPIRY_MINUTES = 10;

/** Verify OTP for profile changes */
async function verifyOTP(userId: string, otp: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { verificationCode: true, verificationExpiry: true },
  });

  if (!user) throw AppError.notFound('User');
  if (!user.verificationCode || !user.verificationExpiry) {
    throw AppError.badRequest('No verification code found. Please request a new one.');
  }
  if (new Date() > user.verificationExpiry) {
    throw AppError.badRequest('Verification code has expired. Please request a new one.');
  }
  if (user.verificationCode !== otp) {
    throw AppError.badRequest('Invalid verification code');
  }

  // Clear the OTP after successful verification
  await prisma.user.update({
    where: { id: userId },
    data: { verificationCode: null, verificationExpiry: null },
  });
}

export const profileService = {
  /** Get the current user's profile */
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        roleTitle: true,
        restaurantId: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw AppError.notFound('User');
    }

    return user;
  },

  /** Send OTP for profile changes */
  async sendProfileOTP(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) throw AppError.notFound('User');

    const otp = generateOTP();
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: { verificationCode: otp, verificationExpiry: expiry },
    });

    await sendVerificationEmail(user.email!, otp, user.name || user.email || 'User');

    return { message: 'Verification code sent to your email' };
  },

  /** Update username (requires OTP) */
  async updateUsername(userId: string, newUsername: string, otp: string) {
    await verifyOTP(userId, otp);
    // Check if username is already taken
    const existing = await prisma.user.findFirst({
      where: {
        username: newUsername,
        id: { not: userId },
      },
    });

    if (existing) {
      throw AppError.conflict('This username is already taken. Please choose a different one.');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { username: newUsername },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        restaurantId: true,
        createdAt: true,
      },
    });

    return user;
  },

  /** Update email (requires OTP) */
  async updateEmail(userId: string, newEmail: string, otp: string) {
    await verifyOTP(userId, otp);
    // Check if email is already taken
    const existing = await prisma.user.findFirst({
      where: {
        email: newEmail,
        id: { not: userId },
      },
    });

    if (existing) {
      throw AppError.conflict('This email is already associated with another account.');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { email: newEmail },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        restaurantId: true,
        createdAt: true,
      },
    });

    return user;
  },

  /** Change password (requires OTP + validates current password) */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    otp: string
  ) {
    await verifyOTP(userId, otp);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AppError.notFound('User');
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw AppError.unauthorized('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password changed successfully' };
  },
};
