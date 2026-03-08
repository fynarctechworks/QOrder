import { apiClient } from './apiClient';
import type { Table, TableStatus } from '../types';

/** Map backend status values to frontend equivalents */
const STATUS_MAP: Record<string, TableStatus> = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  RESERVED: 'reserved',
  INACTIVE: 'cleaning',  // backend INACTIVE ≈ frontend cleaning
  CLEANING: 'cleaning',
};

/** Map frontend status → backend status */
const TO_BACKEND_STATUS: Record<string, string> = {
  available: 'AVAILABLE',
  occupied: 'OCCUPIED',
  reserved: 'RESERVED',
  cleaning: 'INACTIVE',  // frontend cleaning → backend INACTIVE
};

function toBackendStatus(status: string): string {
  return TO_BACKEND_STATUS[status] ?? status.toUpperCase();
}

/** Normalise backend UPPER_CASE status → frontend lowercase */
function normalizeTable(raw: Record<string, unknown>): Table {
  if (!raw || typeof raw !== 'object') {
    throw new Error('normalizeTable: expected an object');
  }
  // Create a shallow copy to avoid mutating the input
  const copy = { ...raw } as unknown as Table;
  if (copy.status && typeof copy.status === 'string') {
    copy.status = STATUS_MAP[copy.status] ?? (copy.status.toLowerCase() as TableStatus);
  }
  // Map _count.orders → activeOrders
  const count = (raw as { _count?: { orders?: number } })._count;
  if (count && typeof count.orders === 'number') {
    (copy as unknown as Record<string, unknown>).activeOrders = count.orders;
  } else if ((copy as unknown as Record<string, unknown>).activeOrders === undefined) {
    (copy as unknown as Record<string, unknown>).activeOrders = 0;
  }
  return copy;
}

export const tableService = {
  async getAll(): Promise<Table[]> {
    const raw = await apiClient.get<Record<string, unknown>[]>('/tables');
    return (raw ?? []).map(normalizeTable);
  },

  async getById(id: string): Promise<Table> {
    const raw = await apiClient.get<Record<string, unknown>>(`/tables/${id}`);
    return normalizeTable(raw);
  },

  async create(data: Partial<Table>): Promise<Table> {
    const payload = { ...data, status: data.status ? toBackendStatus(data.status) : undefined };
    const raw = await apiClient.post<Record<string, unknown>>('/tables', payload);
    return normalizeTable(raw);
  },

  async update(id: string, data: Partial<Table>): Promise<Table> {
    const payload = { ...data, status: data.status ? toBackendStatus(data.status) : undefined };
    const raw = await apiClient.patch<Record<string, unknown>>(`/tables/${id}`, payload);
    return normalizeTable(raw);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete(`/tables/${id}`);
  },

  async updateStatus(id: string, status: TableStatus): Promise<Table> {
    const raw = await apiClient.patch<Record<string, unknown>>(`/tables/${id}/status`, { status: toBackendStatus(status) });
    return normalizeTable(raw);
  },

  async generateQRCode(id: string): Promise<{ qrCode: string }> {
    return apiClient.post(`/tables/${id}/qr-code`);
  },

  async getTableOrders(tableId: string): Promise<TableOrderDetails> {
    return apiClient.get<TableOrderDetails>(`/tables/${tableId}/orders`);
  },

  async getRunningTables(): Promise<RunningTable[]> {
    return apiClient.get<RunningTable[]>('/tables/running');
  },

  async regenerateSessionToken(id: string): Promise<Table> {
    const raw = await apiClient.post<Record<string, unknown>>(`/tables/${id}/regenerate-session`);
    return normalizeTable(raw);
  },
};

export interface TableOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers: Array<{ name: string; price: number }>;
  notes?: string;
}

export interface TableOrderDetails {
  tableId: string;
  tableNumber: string;
  tableName: string | null;
  orderCount: number;
  subtotal: number;
  tax: number;
  total: number;
  items: TableOrderItem[];
}

export interface RunningTable {
  tableId: string;
  tableNumber: string;
  tableName: string | null;
  sectionId: string | null;
  sectionName: string | null;
  invoiceId: string | null;
  totalAmount: number;
  orderCount: number;
  sessionStart: string;
  durationInMinutes: number;
  staffName: string | null;
}
