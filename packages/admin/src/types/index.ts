// User & Auth Types
export interface User {
  id: string;
  email?: string | null;
  username: string;
  name: string;
  role: UserRole;
  roleTitle?: string | null;
  restaurantId: string;
  createdAt: string;
}

export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';

export interface AuthState {
  user: User | null;
}

// Restaurant Types
export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverImageUrl: string;
  currency: string;
  isOpen: boolean;
  settings: RestaurantSettings;
}

export interface RestaurantSettings {
  primaryColor: string;
  minimumOrderAmount: number;
  estimatedPrepTime: number;
  acceptsOrders: boolean;
  taxRate: number;
}

// Menu Types
/** Translations JSON shape: { "hi": { "name": "...", "description": "..." }, "ta": {...}, ... } */
export type TranslationsMap = Record<string, Record<string, string>>;

export interface Category {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  sortOrder: number;
  image?: string;
  isActive: boolean;
  kotStation: 'KITCHEN' | 'BEVERAGE';
  categoryGroup: 'RESTAURANT' | 'PAN_CORNER';
  translations?: TranslationsMap;
}

export type DietType = 'VEG' | 'NON_VEG' | 'EGG';

export interface MenuItem {
  id: string;
  categoryId: string;
  restaurantId: string;
  name: string;
  description: string;
  price: number;
  discountPrice?: number;
  image?: string;
  isAvailable: boolean;
  prepTime: number;
  calories?: number;
  allergens: string[];
  ingredients: string[];
  customizationGroups: CustomizationGroup[];
  tags: string[];
  badge?: string;
  dietType?: DietType | null;
  isAgeRestricted?: boolean;
  taxRate?: number | null;
  allowSpecialInstructions?: boolean;
  translations?: TranslationsMap;
}

export interface CustomizationGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: CustomizationOption[];
  translations?: TranslationsMap;
}

export interface CustomizationOption {
  id: string;
  name: string;
  priceModifier: number;
  isDefault: boolean;
  isAvailable: boolean;
  translations?: TranslationsMap;
}

// Order Types
export interface Order {
  id: string;
  orderNumber: string;
  tokenNumber?: number | null;
  restaurantId: string;
  tableId: string;
  tableName: string;
  orderType?: string;
  sectionName?: string | null;
  items: OrderItem[];
  status: OrderStatus;
  subtotal: number;
  tax: number;
  total: number;
  specialInstructions?: string;
  customerName?: string;
  customerPhone?: string;
  createdAt: string;
  updatedAt: string;
  estimatedReadyTime?: string;
  preparedAt?: string;
  completedAt?: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  menuItemImage?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  customizations: OrderItemCustomization[];
  specialInstructions?: string;
  preparedAt?: string;
}

export interface OrderItemCustomization {
  groupId: string;
  groupName: string;
  options: { id: string; name: string; priceModifier: number }[];
}

export type OrderStatus = 
  | 'pending'
  | 'preparing'
  | 'payment_pending'
  | 'completed'
  | 'cancelled';

// Table Types
export interface Table {
  id: string;
  restaurantId: string;
  number: string;
  name: string;
  capacity: number;
  status: TableStatus;
  qrCode: string;
  sessionToken?: string | null;
  activeOrders: number;
  sectionId?: string | null;
  section?: { id: string; name: string; floor?: number | null; sortOrder: number } | null;
  branchId?: string | null;
  branch?: { id: string; name: string } | null;
}

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

// Section Types
export interface Section {
  id: string;
  restaurantId: string;
  name: string;
  floor?: number | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { tables: number };
}

// Analytics Types
export interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopItem {
  itemId: string;
  itemName: string;
  quantity: number;
  revenue: number;
}

export interface HourlyData {
  hour: number;
  orders: number;
  revenue: number;
}

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  tableConversionRate: number;
  dailyRevenue: DailyRevenue[];
  topItems: TopItem[];
  hourlyData: HourlyData[];
}

// Advanced Analytics Types
export interface CategoryRevenue {
  categoryId: string;
  categoryName: string;
  totalRevenue: number;
  totalQuantity: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  totalAmount: number;
}

export interface WeekdayBreakdown {
  dayOfWeek: number;
  dayName: string;
  totalOrders: number;
  totalRevenue: number;
}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
  revenue: number;
}

export interface AdvancedAnalytics {
  categoryRevenue: CategoryRevenue[];
  paymentMethods: PaymentMethodBreakdown[];
  weekdayBreakdown: WeekdayBreakdown[];
  orderStatusBreakdown: OrderStatusBreakdown[];
}

// Dashboard Extras Types
export interface DashboardExtras {
  tableStatus: {
    total: number;
    available: number;
    occupied: number;
    reserved: number;
    inactive: number;
  };
  customersToday: number;
  qrScansToday: number;
  paymentSummary: { method: string; count: number; total: number }[];
  financials: {
    totalDiscount: number;
    totalTax: number;
    totalSubtotal: number;
  };
  lowStockItems: {
    id: string;
    name: string;
    currentStock: number;
    minStock: number;
    unit: string;
  }[];
  lowPerformingItems: {
    itemName: string;
    quantity: number;
    revenue: number;
  }[];
  pendingServiceRequests: number;
  pendingPayments: number;
}

// API Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Socket Events
export interface AdminSocketEvents {
  'order:new': (order: Order) => void;
  'order:statusUpdate': (data: { orderId: string; status: OrderStatus }) => void;
  'table:update': (table: Table) => void;
}
