// Restaurant Types
export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverImageUrl: string;
  currency: string;
  isOpen: boolean;
  openingHours: OpeningHours[];
  taxRate: number;
  settings: RestaurantSettings;
  geoFenceEnabled?: boolean;
}

export interface OpeningHours {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

export interface RestaurantSettings {
  primaryColor: string;
  minimumOrderAmount: number;
  estimatedPrepTime: number;
  acceptsOrders: boolean;
  taxRate?: number;
}

// Menu Types
export interface Category {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  image?: string;
}

export type DietType = 'VEG' | 'NON_VEG' | 'EGG';

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  discountPrice?: number;
  image?: string;
  isAvailable: boolean;
  prepTime?: number;
  calories?: number;
  allergens?: string[];
  ingredients?: string[];
  customizationGroups: CustomizationGroup[];
  tags?: string[];
  badge?: string;
  dietType?: DietType | null;
  allowSpecialInstructions?: boolean;
  category?: {
    id: string;
    name: string;
    image?: string;
  };
}

export interface CustomizationGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: CustomizationOption[];
}

export interface CustomizationOption {
  id: string;
  name: string;
  priceModifier: number;
  isDefault: boolean;
  isAvailable: boolean;
}

// Cart Types
export interface CartItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  selectedCustomizations: SelectedCustomization[];
  specialInstructions?: string;
  totalPrice: number;
}

export interface SelectedCustomization {
  groupId: string;
  groupName: string;
  options: SelectedOption[];
}

export interface SelectedOption {
  id: string;
  name: string;
  priceModifier: number;
}

// Order Types
export interface Order {
  id: string;
  orderNumber?: string;
  restaurantId: string;
  tableId: string;
  tableName?: string;
  sessionId?: string;
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
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  customizations: SelectedCustomization[];
  specialInstructions?: string;
}

export type OrderStatus = 
  | 'pending'
  | 'preparing'
  | 'payment_pending'
  | 'completed'
  | 'cancelled';

export interface OrderStatusUpdate {
  orderId: string;
  status: OrderStatus;
  timestamp: string;
  message?: string;
}

// Table Types
export interface Table {
  id: string;
  restaurantId: string;
  branchId?: string | null;
  number: string;
  name: string;
  capacity: number;
  status: TableStatus;
  qrCode: string;
  sessionToken?: string | null;
}

export type TableStatus = 'available' | 'occupied' | 'cleaning';

// API Response Types
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

// Socket Event Types
export interface SocketEvents {
  'order:new': (order: Order) => void;
  'order:statusUpdate': (update: OrderStatusUpdate) => void;
  'order:join': (data: { orderId: string }) => void;
  'order:leave': (data: { orderId: string }) => void;
  'table:update': (table: Table) => void;
  'table:updated': (data: { tableId: string }) => void;
  'join:table': (tableId: string) => void;
  'leave:table': (tableId: string) => void;
  'payment:request': (data: {
    restaurantId: string;
    tableId: string;
    tableNumber: string;
    total: number;
    orderCount: number;
    requestedAt: string;
  }) => void;
  'payment:acknowledged': (data: { tableId: string }) => void;
  'sync:refresh': () => void;
  // Group order events
  'join:group': (code: string) => void;
  'leave:group': (code: string) => void;
  'group:joined': (data: { code: string; participantId: string; name: string; isHost: boolean }) => void;
  'group:cartUpdated': (data: { code: string; participantId: string; participantName: string; action: string }) => void;
  'group:ready': (data: { participantId: string; name: string }) => void;
  'group:submitted': (data: { code: string; orderId: string }) => void;
  'group:cancelled': (data: { code: string }) => void;
  'group:expired': (data: { code: string }) => void;
}
