import { apiClient } from './apiClient';

export interface Payment {
  id: string;
  method: 'CASH' | 'CARD' | 'UPI' | 'WALLET' | 'ONLINE';
  amount: number;
  reference?: string;
  notes?: string;
  gatewayProvider?: string;
  gatewayPaymentId?: string;
  status?: string;
  refundId?: string;
  refundAmount?: number;
  refundedAt?: string;
  createdAt: string;
}

export interface SessionOrderItem {
  id: string;
  quantity: number;
  notes?: string;
  menuItem: {
    id: string;
    name: string;
    price: number;
  };
  modifiers: Array<{
    id: string;
    name: string;
    price: number;
  }>;
  subtotal: number;
}

export interface TableSession {
  id: string;
  tableId: string;
  table: {
    id: string;
    number: string;
    name?: string;
  };
  status: 'ACTIVE' | 'CLOSED' | 'MERGED' | 'TRANSFERRED';
  startedAt: string;
  closedAt?: string;
  subtotal: number;
  tax: number;
  totalAmount: number;
  orders: Array<{
    id: string;
    items: SessionOrderItem[];
  }>;
  payments: Payment[];
}

export interface InvoiceData {
  invoiceNumber: string;
  restaurant: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  table: {
    number: string;
    name?: string;
  };
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    modifiers: Array<{ name: string; price: number }>;
    notes?: string;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  payments: Array<{
    method: string;
    amount: number;
    createdAt: string;
  }>;
  totalPaid: number;
  remaining: number;
}

export interface AddPaymentRequest {
  method: 'CASH' | 'CARD' | 'UPI' | 'WALLET';
  amount: number;
  reference?: string;
  notes?: string;
}

export interface TransferSessionRequest {
  newTableId: string;
}

export interface MergeSessionsRequest {
  sessionId1: string;
  sessionId2: string;
}

class SessionService {
  /**
   * Get or create session for a table
   */
  async getTableSession(tableId: string): Promise<TableSession> {
    return apiClient.get<TableSession>(
      `/sessions/table/${tableId}`,
    );
  }

  /**
   * Get session details by ID
   */
  async getSession(sessionId: string): Promise<TableSession> {
    return apiClient.get<TableSession>(
      `/sessions/${sessionId}`,
    );
  }

  /**
   * Add payment to a session (split bill)
   */
  async addPayment(
    sessionId: string,
    payment: AddPaymentRequest,
  ): Promise<{ session: TableSession; isFullyPaid: boolean }> {
    return apiClient.post<{ session: TableSession; isFullyPaid: boolean }>(
      `/sessions/${sessionId}/split-payment`, payment,
    );
  }

  /**
   * Transfer session to another table
   */
  async transferSession(
    sessionId: string,
    request: TransferSessionRequest,
  ): Promise<{ session: TableSession; oldTableId: string; newTableId: string }> {
    return apiClient.post<{
      session: TableSession;
      oldTableId: string;
      newTableId: string;
    }>(`/sessions/${sessionId}/transfer`, request);
  }

  /**
   * Merge two sessions into one
   */
  async mergeSessions(
    request: MergeSessionsRequest,
  ): Promise<{ mergedSession: TableSession }> {
    return apiClient.post<{ mergedSession: TableSession }>(
      '/sessions/merge', request,
    );
  }

  /**
   * Get printable invoice data
   */
  async getPrintInvoice(sessionId: string): Promise<InvoiceData> {
    return apiClient.get<InvoiceData>(
      `/sessions/${sessionId}/print`,
    );
  }

  /**
   * Send bill via WhatsApp
   */
  async sendWhatsAppBill(sessionId: string): Promise<{ sent: boolean; phone?: string }> {
    return apiClient.post<{ sent: boolean; phone?: string }>(
      `/sessions/${sessionId}/whatsapp-bill`, {},
    );
  }
}

export const sessionService = new SessionService();
