/**
 * IndexedDB wrapper for offline support.
 * Stores cached menu data and queued orders for offline-first experience.
 */

const DB_NAME = 'qorder_offline';
const DB_VERSION = 1;

const STORES = {
  MENU: 'menu_cache',
  ORDERS: 'order_queue',
  META: 'meta',
} as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.MENU)) {
        db.createObjectStore(STORES.MENU, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.ORDERS)) {
        db.createObjectStore(STORES.ORDERS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly') {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  return { store: tx.objectStore(storeName), tx };
}

// ─── Menu Cache ───────────────────────────────────────

export interface CachedMenu {
  key: string; // `${restaurantSlug}`
  data: unknown;
  cachedAt: number;
}

export async function cacheMenu(restaurantSlug: string, data: unknown): Promise<void> {
  const { store } = await getStore(STORES.MENU, 'readwrite');
  const record: CachedMenu = { key: restaurantSlug, data, cachedAt: Date.now() };
  store.put(record);
}

export async function getCachedMenu(restaurantSlug: string): Promise<CachedMenu | null> {
  const { store } = await getStore(STORES.MENU);
  return new Promise((resolve, reject) => {
    const req = store.get(restaurantSlug);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ─── Order Queue ──────────────────────────────────────

export interface QueuedOrder {
  id?: number;
  restaurantSlug: string;
  tableId: string;
  payload: unknown;
  createdAt: number;
  retries: number;
}

export async function queueOrder(order: Omit<QueuedOrder, 'id' | 'createdAt' | 'retries'>): Promise<number> {
  const { store } = await getStore(STORES.ORDERS, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.add({ ...order, createdAt: Date.now(), retries: 0 });
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedOrders(): Promise<QueuedOrder[]> {
  const { store } = await getStore(STORES.ORDERS);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedOrder(id: number): Promise<void> {
  const { store } = await getStore(STORES.ORDERS, 'readwrite');
  store.delete(id);
}

export async function updateQueuedOrder(order: QueuedOrder): Promise<void> {
  const { store } = await getStore(STORES.ORDERS, 'readwrite');
  store.put(order);
}

export async function getQueuedOrderCount(): Promise<number> {
  const { store } = await getStore(STORES.ORDERS);
  return new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Meta ─────────────────────────────────────────────

export async function setMeta(key: string, value: unknown): Promise<void> {
  const { store } = await getStore(STORES.META, 'readwrite');
  store.put({ key, value, updatedAt: Date.now() });
}

export async function getMeta(key: string): Promise<unknown | null> {
  const { store } = await getStore(STORES.META);
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}
