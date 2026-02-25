import { z } from 'zod';

// ==================== AUTH ====================

// Reusable password validation schema
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: passwordSchema,
  name: z.string().min(2, 'Name must be at least 2 characters'),
  restaurantName: z.string().min(2, 'Restaurant name must be at least 2 characters'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(), // Can be from cookie
});

export const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Verification code must be 6 characters'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// ==================== RESTAURANT ====================

export const updateRestaurantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  logo: z.string().url().optional().nullable(),
  coverImage: z.string().url().optional().nullable(),
  address: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const updateRestaurantSettingsSchema = z.object({
  primaryColor: z.string().max(20).optional(),
  minimumOrderAmount: z.number().min(0).optional(),
  estimatedPrepTime: z.number().int().min(0).optional(),
  acceptingOrders: z.boolean().optional(),
  acceptsOrders: z.boolean().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  orderNotificationSound: z.boolean().optional(),
  autoConfirmOrders: z.boolean().optional(),
  /** Required when acceptsOrders is set to false */
  password: z.string().optional(),
}).strict();

// ==================== MENU ====================

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
  image: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createMenuItemSchema = z.object({
  name: z.string().min(2, 'Item name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().default(''),
  price: z.number().nonnegative('Price must be 0 or more'),
  discountPrice: z.number().nonnegative().optional().nullable(),
  image: z.string().optional().nullable(),
  categoryId: z.string().uuid('Invalid category ID'),
  isAvailable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  prepTime: z.number().int().nonnegative().optional().nullable(),
  calories: z.number().int().nonnegative().optional().nullable(),
  tags: z.array(z.string()).default([]),
  ingredients: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  badge: z.string().max(50).optional().nullable(),
  dietType: z.enum(['VEG', 'NON_VEG', 'EGG']).optional().nullable(),
  modifierGroupIds: z.array(z.string().uuid()).optional(),
  // Inline customization groups (from admin form)
  customizationGroups: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(100),
    required: z.boolean().default(false),
    minSelections: z.number().int().min(0).default(0),
    maxSelections: z.number().int().min(1).default(1),
    options: z.array(z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(100),
      priceModifier: z.number().min(0).default(0),
      isDefault: z.boolean().default(false),
      isAvailable: z.boolean().default(true),
    })).default([]),
  })).optional(),
});

export const updateMenuItemSchema = createMenuItemSchema.partial();

export const updateAvailabilitySchema = z.object({
  itemIds: z.array(z.string().uuid()),
  isAvailable: z.boolean(),
});

export const createModifierGroupSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  modifiers: z.array(z.object({
    name: z.string().min(1).max(100),
    price: z.number().min(0).default(0),
    isDefault: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
  })).min(1, 'At least one modifier is required'),
});

export const updateModifierGroupSchema = createModifierGroupSchema.partial();

// ==================== TABLES ====================

export const createTableSchema = z.object({
  number: z.string().min(1, 'Table number is required').max(20),
  name: z.string().max(100).optional(),
  capacity: z.number().int().min(1).max(50).default(4),
});

export const updateTableSchema = z.object({
  number: z.string().min(1).max(20).optional(),
  name: z.string().max(100).optional().nullable(),
  capacity: z.number().int().min(1).max(50).optional(),
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'INACTIVE']).optional(),
});

export const bulkCreateTablesSchema = z.object({
  count: z.number().int().min(1).max(100),
  startNumber: z.number().int().min(1).default(1),
  capacity: z.number().int().min(1).max(50).default(4),
});

// ==================== ORDERS ====================

export const createOrderSchema = z.object({
  tableId: z.string().uuid().optional(),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
    notes: z.string().max(200).optional(),
    modifiers: z.array(z.object({
      modifierId: z.string().uuid(),
    })).optional(),
  })).min(1, 'Order must have at least one item'),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'PREPARING', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED']),
  estimatedTime: z.number().int().positive().optional(),
});

export const orderQuerySchema = z.object({
  status: z.enum(['PENDING', 'PREPARING', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  tableId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  sortBy: z.enum(['createdAt', 'total', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ==================== USER ====================

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).default('STAFF'),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: passwordSchema,
});

// ==================== MENU QUERIES ====================

export const menuItemQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().max(100).optional(),
});

// ==================== COMMON ====================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// ==================== SESSIONS ====================

export const addPaymentSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'UPI', 'WALLET']),
  amount: z.number().positive('Payment amount must be positive'),
  reference: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export const transferSessionSchema = z.object({
  targetTableId: z.string().uuid('Invalid table ID'),
});

export const mergeSessionsSchema = z.object({
  sourceSessionId: z.string().uuid('Invalid source session ID'),
  targetSessionId: z.string().uuid('Invalid target session ID'),
});

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const restaurantSlugSchema = z.object({
  slug: z.string().min(1),
});

// ==================== PROFILE ====================

export const updateUsernameSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  otp: z.string().min(1, 'Verification code is required'),
});

export const updateEmailSchema = z.object({
  email: z.string().email('A valid email address is required'),
  otp: z.string().min(1, 'Verification code is required'),
});

export const changeProfilePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  otp: z.string().min(1, 'Verification code is required'),
});

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
export type UpdateRestaurantSettingsInput = z.infer<typeof updateRestaurantSettingsSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type OrderQueryInput = z.infer<typeof orderQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type MenuItemQueryInput = z.infer<typeof menuItemQuerySchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type AddPaymentInput = z.infer<typeof addPaymentSchema>;
export type TransferSessionInput = z.infer<typeof transferSessionSchema>;
export type MergeSessionsInput = z.infer<typeof mergeSessionsSchema>;
export type UpdateUsernameInput = z.infer<typeof updateUsernameSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type ChangeProfilePasswordInput = z.infer<typeof changeProfilePasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
