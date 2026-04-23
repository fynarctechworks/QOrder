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
  coverImage: z.string().url().optional().nullable(),
  address: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  settings: z.record(z.unknown()).optional(),
  // Geo-fence settings (top-level columns)
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  geoFenceRadius: z.number().int().min(0).max(5000).optional(),
});

export const updateRestaurantSettingsSchema = z.object({
  primaryColor: z.string().max(20).optional(),
  minimumOrderAmount: z.coerce.number().min(0).optional(),
  estimatedPrepTime: z.coerce.number().int().min(0).optional(),
  acceptsOrders: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  orderNotificationSound: z.boolean().optional(),
  autoConfirmOrders: z.boolean().optional(),
  /** Required when acceptsOrders is set to false */
  password: z.string().optional(),
  /** Printer settings */
  printerEnabled: z.boolean().optional(),
  printerConnectionType: z.enum(['network', 'bluetooth', 'browser']).optional(),
  printerIp: z.string().max(255).optional(),
  printerPort: z.coerce.number().int().min(1).max(65535).optional(),
  printerType: z.enum(['epson', 'star']).optional(),
  printerWidth: z.coerce.number().int().min(1).max(100).optional(),
  autoPrintOnComplete: z.boolean().optional(),
  /** Role-based page permissions (base roles + custom roleTitle keys) */
  rolePermissions: z.record(
    z.string(),
    z.array(z.string())
  ).optional(),
  /** Auto-lock settings */
  autoLockEnabled: z.boolean().optional(),
  autoLockTimeout: z.coerce.number().int().min(1).max(60).optional(),
  lockPin: z.string().regex(/^\d{6}$/).optional(),
  requirePhoneVerification: z.boolean().optional(),
  /** WhatsApp bill sharing via Meta Business API */
  whatsappBillEnabled: z.boolean().optional(),
  whatsappPhoneNumberId: z.string().max(255).optional(),
  whatsappBusinessAccountId: z.string().max(255).optional(),
  whatsappAccessToken: z.string().max(500).optional(),
  /** Twilio settings */
  twilioEnabled: z.boolean().optional(),
  twilioAccountSid: z.string().max(255).optional(),
  twilioAuthToken: z.string().max(255).optional(),
  twilioPhoneNumber: z.string().max(20).optional(),
  /** WhatsApp alert settings */
  whatsappAlertLowStock: z.boolean().optional(),
  whatsappAlertStaffLate: z.boolean().optional(),
  whatsappAlertEarlyCheckout: z.boolean().optional(),
  whatsappAlertAutoInvoice: z.boolean().optional(),
  adminWhatsAppPhone: z.string().max(20).optional(),
  staffLateThresholdMinutes: z.coerce.number().int().min(1).max(120).optional(),
  earlyCheckoutThresholdMinutes: z.coerce.number().int().min(1).max(120).optional(),
  /** Print layout settings */
  printLogoUrl: z.string().max(500).optional(),
  printHeaderText: z.string().max(500).optional(),
  printFooterText: z.string().max(500).optional(),
  printShowLogo: z.boolean().optional(),
  printShowAddress: z.boolean().optional(),
  printShowCustomerInfo: z.boolean().optional(),
  printShowItemModifiers: z.boolean().optional(),
  printShowSpecialInstructions: z.boolean().optional(),
  printShowSubtotal: z.boolean().optional(),
  printShowTax: z.boolean().optional(),
  /** Daily report email recipients */
  reportEmails: z.array(z.string().email()).optional(),
  /** Smart Inventory: auto-deduct ingredients on order */
  smartInventoryEnabled: z.boolean().optional(),
  /** Menu display settings */
  menuShowItemImages: z.boolean().optional(),
  qrLogoUrl: z.string().max(500).optional(),
  /** Parcel charges */
  kitchenParcelCharge: z.coerce.number().min(0).optional(),
  beverageParcelCharge: z.coerce.number().min(0).optional(),
}).passthrough();

// ==================== MENU ====================

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
  image: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  kotStation: z.enum(['KITCHEN', 'BEVERAGE']).default('KITCHEN'),
  translations: z.record(z.string(), z.record(z.string(), z.string())).optional(),
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
  taxRate: z.number().min(0).max(100).optional().nullable(),
  translations: z.record(z.string(), z.record(z.string(), z.string())).optional(),
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
  sectionId: z.string().uuid().optional().nullable(),
});

export const updateTableSchema = z.object({
  number: z.string().min(1).max(20).optional(),
  name: z.string().max(100).optional().nullable(),
  capacity: z.number().int().min(1).max(50).optional(),
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'INACTIVE']).optional(),
  sectionId: z.string().uuid().optional().nullable(),
});

export const bulkCreateTablesSchema = z.object({
  count: z.number().int().min(1).max(100),
  startNumber: z.number().int().min(1).default(1),
  capacity: z.number().int().min(1).max(50).default(4),
  sectionId: z.string().uuid().optional().nullable(),
});

// ==================== SECTIONS ====================

export const createSectionSchema = z.object({
  name: z.string().min(1, 'Section name is required').max(100),
  floor: z.number().int().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

export const updateSectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  floor: z.number().int().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ==================== BRANCHES ====================

export const createBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required').max(100),
  code: z
    .string()
    .min(1, 'Branch code is required')
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores'),
  address: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores')
    .optional(),
  address: z.string().max(200).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const branchUserAssignSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1, 'At least one user is required'),
});

// ==================== ORDERS ====================

export const createOrderSchema = z.object({
  tableId: z.string().uuid().optional(),
  sessionToken: z.string().uuid().optional(),
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
  couponCode: z.string().max(50).optional(),
  manualDiscount: z.number().nonnegative().optional(),
  manualDiscountType: z.enum(['PERCENTAGE', 'FLAT']).optional(),
  serviceType: z.string().max(20).optional(),
  isPaid: z.boolean().optional(),
  // Geo-fence validation
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'PREPARING', 'READY', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED']),
  estimatedTime: z.number().int().positive().optional(),
  skipAutoInvoice: z.boolean().optional(),
});

const orderTypeEnum = z.enum(['DINE_IN', 'TAKEAWAY', 'QSR', 'QSR_TAKEAWAY', 'QSR_DELIVERY', 'PAN_CORNER']);

export const orderQuerySchema = z.object({
  status: z.enum(['PENDING', 'PREPARING', 'READY', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  orderType: z.union([orderTypeEnum, z.array(orderTypeEnum)]).optional(),
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
  email: z.string().email().optional(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).default('STAFF'),
  roleTitle: z.string().max(50).optional(),
  defaultShiftId: z.string().uuid().nullable().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().nullable().optional(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).optional(),
  roleTitle: z.string().max(50).nullable().optional(),
  isActive: z.boolean().optional(),
  defaultShiftId: z.string().uuid().nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Reset code must be 6 digits'),
  newPassword: passwordSchema,
});

// ==================== MENU QUERIES ====================

export const menuItemQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().max(100).optional(),
});

// ==================== GROUP ORDERS ====================

export const createGroupOrderSchema = z.object({
  restaurantId: z.string().uuid(),
  tableId: z.string().uuid().optional(),
  sessionToken: z.string().uuid().optional(),
  hostName: z.string().min(1, 'Host name is required').max(100),
  hostPhone: z.string().max(20).optional(),
  // Geo-fence validation
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const joinGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  phone: z.string().max(20).optional(),
  // Geo-fence validation
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const addGroupCartItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(200).optional(),
  modifiers: z.array(z.object({
    modifierId: z.string().uuid(),
  })).optional(),
});

export const updateGroupCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(99),
});

export const groupParticipantActionSchema = z.object({
  participantId: z.string().uuid(),
  // Geo-fence validation (for group submit)
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

// ==================== DISCOUNTS & COUPONS ====================

export const createDiscountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['PERCENTAGE', 'FLAT']),
  value: z.coerce.number().positive(),
  minOrderAmount: z.coerce.number().positive().nullable().optional(),
  maxDiscount: z.coerce.number().positive().nullable().optional(),
  isAutoApply: z.boolean().optional(),
  activeFrom: z.string().datetime().nullable().optional(),
  activeTo: z.string().datetime().nullable().optional(),
  activeDays: z.array(z.number().int().min(0).max(6)).optional(),
  activeTimeFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  activeTimeTo: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateDiscountSchema = createDiscountSchema.partial();

export const createCouponSchema = z.object({
  code: z.string().min(1).max(50),
  discountId: z.string().uuid(),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerCustomer: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateCouponSchema = createCouponSchema.partial();

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
  id: z.string().min(1, 'ID is required'),
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

// ==================== CRM ====================

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email('Invalid email format').max(200).optional().nullable(),
  tags: z.array(z.string().min(1).max(30).regex(/^[a-zA-Z0-9 _-]+$/, 'Tags may only contain letters, numbers, spaces, hyphens and underscores')).max(20).optional(),
  notes: z.string().max(2000).optional().nullable(),
}).strict();

// ─── Credit Account Validators ───────────────────

export const createCreditAccountSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(200).optional(),
  creditLimit: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
  customerId: z.string().uuid().optional(),
});

export const updateCreditAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  creditLimit: z.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const creditChargeSchema = z.object({
  amount: z.number().positive(),
  orderId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export const creditRepaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().max(20).optional(),
  reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export const changeProfilePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  otp: z.string().min(1, 'Verification code is required'),
});

// Type exports
// ==================== PAN CORNER ====================

export const createPanCornerCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
  image: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  translations: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

export const updatePanCornerCategorySchema = createPanCornerCategorySchema.partial();

export const createPanCornerItemSchema = z.object({
  panCornerCategoryId: z.string().uuid('Invalid category ID'),
  name: z.string().min(2, 'Item name must be at least 2 characters').max(200),
  description: z.string().max(500).optional(),
  price: z.number().nonnegative('Price must be 0 or more'),
  discountPrice: z.number().nonnegative().optional().nullable(),
  image: z.string().optional().nullable(),
  isAvailable: z.boolean().default(true),
  isAgeRestricted: z.boolean().default(false),
  taxRate: z.number().min(0).max(100).optional().nullable(),
  sortOrder: z.number().int().default(0),
  translations: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

export const updatePanCornerItemSchema = createPanCornerItemSchema.partial();

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
export type CreateGroupOrderInput = z.infer<typeof createGroupOrderSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
export type AddGroupCartItemInput = z.infer<typeof addGroupCartItemSchema>;
export type UpdateGroupCartItemInput = z.infer<typeof updateGroupCartItemSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type BranchUserAssignInput = z.infer<typeof branchUserAssignSchema>;
export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type CreatePanCornerCategoryInput = z.infer<typeof createPanCornerCategorySchema>;
export type UpdatePanCornerCategoryInput = z.infer<typeof updatePanCornerCategorySchema>;
export type CreatePanCornerItemInput = z.infer<typeof createPanCornerItemSchema>;
export type UpdatePanCornerItemInput = z.infer<typeof updatePanCornerItemSchema>;
