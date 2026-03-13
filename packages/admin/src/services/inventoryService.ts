import { apiClient } from './apiClient';

// ─── Types ──────────────────────────────────────────────────

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  costPerUnit: number;
  isActive: boolean;
  branchId?: string | null;
  createdAt: string;
  updatedAt: string;
  suppliers?: { id: string; costPerUnit: number; isPreferred: boolean; supplier: { id: string; name: string } }[];
  _count?: { stockMovements: number };
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  _count?: { ingredients: number; purchases: number };
}

export interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  previousQty: number;
  newQty: number;
  costPerUnit?: number;
  reference?: string;
  notes?: string;
  performedBy?: string;
  createdAt: string;
  ingredient?: { id: string; name: string; unit: string };
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  notes?: string;
  orderedAt?: string;
  receivedAt?: string;
  createdBy?: string;
  createdAt: string;
  supplier: { id: string; name: string };
  items: PurchaseOrderItem[];
  _count?: { items: number };
}

export interface PurchaseOrderItem {
  id: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  ingredient: { id: string; name: string; unit: string };
}

export interface DailySummary {
  date: string;
  totalUsageValue: number;
  totalPurchaseValue: number;
  totalStockValue: number;
  usageCount: number;
  purchaseCount: number;
  usageByIngredient: {
    ingredientId: string;
    name: string;
    unit: string;
    totalQty: number;
    totalValue: number;
  }[];
  recentUsage: StockMovement[];
}

export interface UsageTrendPoint {
  date: string;
  totalQty: number;
  totalValue: number;
  itemCount: number;
}

export interface InventoryOverview {
  totalIngredients: number;
  lowStockCount: number;
  lowStockAlerts: { id: string; name: string; unit: string; currentStock: number; minStock: number; costPerUnit: number }[];
  totalInventoryValue: number;
  todayUsageValue: number;
  todayPurchaseValue: number;
  todayUsageCount: number;
  recentMovements: StockMovement[];
  pendingPurchaseOrders: number;
}

// ─── Service ────────────────────────────────────────────────

function num(val: unknown): number {
  return Number(val) || 0;
}

function mapIngredient(raw: Record<string, unknown>): Ingredient {
  const r = raw as any;
  return {
    ...r,
    currentStock: num(r.currentStock),
    minStock: num(r.minStock),
    costPerUnit: num(r.costPerUnit),
    suppliers: r.suppliers?.map((s: any) => ({ ...s, costPerUnit: num(s.costPerUnit) })),
  };
}

export const inventoryService = {
  // Ingredients
  async getIngredients(): Promise<Ingredient[]> {
    const raw = await apiClient.get<any[]>('/inventory/ingredients');
    if (!Array.isArray(raw)) return [];
    return raw.map(mapIngredient);
  },

  async getIngredientById(id: string): Promise<Ingredient> {
    const raw = await apiClient.get<any>(`/inventory/ingredients/${id}`);
    return mapIngredient(raw);
  },

  async createIngredient(data: Partial<Ingredient>): Promise<Ingredient> {
    return apiClient.post('/inventory/ingredients', data);
  },

  async updateIngredient(id: string, data: Partial<Ingredient>): Promise<Ingredient> {
    return apiClient.patch(`/inventory/ingredients/${id}`, data);
  },

  async deleteIngredient(id: string): Promise<void> {
    return apiClient.delete(`/inventory/ingredients/${id}`);
  },

  // Stock adjustments
  async adjustStock(ingredientId: string, data: { type: string; quantity: number; notes?: string; costPerUnit?: number }): Promise<Ingredient> {
    return apiClient.post(`/inventory/ingredients/${ingredientId}/adjust`, data);
  },

  // Stock history
  async getStockHistory(filters?: { ingredientId?: string; type?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams();
    if (filters?.ingredientId) params.set('ingredientId', filters.ingredientId);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const raw = await apiClient.getRaw<{ success: boolean; data: any[]; meta: any }>(`/inventory/stock-history?${params}`);
    return { data: raw.data as StockMovement[], meta: raw.meta };
  },

  // Usage / Stock Out
  async recordUsage(items: { ingredientId: string; quantity: number; notes?: string }[]) {
    return apiClient.post('/inventory/usage', { items });
  },

  async getDailySummary(date?: string): Promise<DailySummary> {
    const params = date ? `?date=${date}` : '';
    return apiClient.get(`/inventory/daily-summary${params}`);
  },

  async getUsageTrend(days: number = 7): Promise<UsageTrendPoint[]> {
    return apiClient.get(`/inventory/usage-trend?days=${days}`);
  },

  // Suppliers
  async getSuppliers(): Promise<Supplier[]> {
    return apiClient.get('/inventory/suppliers');
  },

  async createSupplier(data: Partial<Supplier>): Promise<Supplier> {
    return apiClient.post('/inventory/suppliers', data);
  },

  async updateSupplier(id: string, data: Partial<Supplier>): Promise<Supplier> {
    return apiClient.patch(`/inventory/suppliers/${id}`, data);
  },

  async deleteSupplier(id: string): Promise<void> {
    return apiClient.delete(`/inventory/suppliers/${id}`);
  },

  // Supplier links
  async linkSupplier(ingredientId: string, supplierId: string, costPerUnit?: number) {
    return apiClient.post(`/inventory/ingredients/${ingredientId}/suppliers`, { supplierId, costPerUnit });
  },

  async unlinkSupplier(ingredientId: string, supplierId: string) {
    return apiClient.delete(`/inventory/ingredients/${ingredientId}/suppliers/${supplierId}`);
  },

  // Purchase Orders
  async getPurchaseOrders(filters?: { status?: string; supplierId?: string }): Promise<PurchaseOrder[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.supplierId) params.set('supplierId', filters.supplierId);
    return apiClient.get(`/inventory/purchase-orders?${params}`);
  },

  async createPurchaseOrder(data: {
    supplierId: string;
    notes?: string;
    items: { ingredientId: string; quantity: number; costPerUnit: number }[];
  }): Promise<PurchaseOrder> {
    return apiClient.post('/inventory/purchase-orders', data);
  },

  async receivePurchaseOrder(id: string): Promise<PurchaseOrder> {
    return apiClient.post(`/inventory/purchase-orders/${id}/receive`, {});
  },

  async updatePurchaseOrderStatus(id: string, status: string): Promise<PurchaseOrder> {
    return apiClient.patch(`/inventory/purchase-orders/${id}/status`, { status });
  },

  // Overview
  async getOverview(): Promise<InventoryOverview> {
    return apiClient.get('/inventory/overview');
  },

  // Low stock alerts
  async getLowStockAlerts() {
    return apiClient.get<{ id: string; name: string; unit: string; currentStock: number; minStock: number }[]>('/inventory/alerts');
  },
};
