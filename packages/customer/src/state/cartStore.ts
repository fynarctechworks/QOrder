import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { CartItem, MenuItem, SelectedCustomization } from '../types';

/** Stable serialisation of customisations for duplicate detection (key-order independent). */
function customizationKey(groups: SelectedCustomization[]): string {
  return groups
    .map((g) => `${g.groupId}:[${g.options.map((o) => o.id).sort().join(',')}]`)
    .sort()
    .join('|');
}

interface CartState {
  items: CartItem[];
  restaurantId: string | null;
  tableId: string | null;
  
  // Actions
  setRestaurantContext: (restaurantId: string, tableId: string) => void;
  addItem: (
    menuItem: MenuItem,
    quantity: number,
    customizations: SelectedCustomization[],
    specialInstructions?: string
  ) => void;
  updateItemQuantity: (cartItemId: string, quantity: number) => void;
  updateItemCustomizations: (
    cartItemId: string,
    customizations: SelectedCustomization[],
    specialInstructions?: string
  ) => void;
  removeItem: (cartItemId: string) => void;
  clearCart: () => void;
  generateIdempotencyKey: () => string;
}

const calculateItemTotal = (
  menuItem: MenuItem,
  quantity: number,
  customizations: SelectedCustomization[]
): number => {
  const basePrice = menuItem.price;
  const customizationTotal = customizations.reduce((sum, group) => {
    return sum + group.options.reduce((optSum, opt) => optSum + opt.priceModifier, 0);
  }, 0);
  return (basePrice + customizationTotal) * quantity;
};

const generateCartItemId = (): string => {
  return `cart-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

export const useCartStore = create<CartState>()(
  persist(
    immer((set, get) => ({
      items: [],
      restaurantId: null,
      tableId: null,

    setRestaurantContext: (restaurantId, tableId) => {
      set((state) => {
        // Clear cart if switching restaurants or tables
        if (
          (state.restaurantId && state.restaurantId !== restaurantId) ||
          (state.tableId && state.tableId !== tableId)
        ) {
          state.items = [];
        }
        state.restaurantId = restaurantId;
        state.tableId = tableId;
      });
    },

    addItem: (menuItem, quantity, customizations, specialInstructions) => {
      set((state) => {
        // Check if identical item already exists
        const existingIndex = state.items.findIndex(
          (item: CartItem) =>
            item.menuItem.id === menuItem.id &&
            customizationKey(item.selectedCustomizations) ===
              customizationKey(customizations) &&
            item.specialInstructions === specialInstructions
        );

        if (existingIndex >= 0) {
          // Update quantity of existing item
          const existing = state.items[existingIndex];
          if (!existing) return;
          const newQuantity = existing.quantity + quantity;
          existing.quantity = newQuantity;
          existing.totalPrice = calculateItemTotal(
            menuItem,
            newQuantity,
            customizations
          );
        } else {
          // Add new item
          state.items.push({
            id: generateCartItemId(),
            menuItem,
            quantity,
            selectedCustomizations: customizations,
            specialInstructions,
            totalPrice: calculateItemTotal(menuItem, quantity, customizations),
          });
        }
      });
    },

    updateItemQuantity: (cartItemId, quantity) => {
      set((state) => {
        const item = state.items.find((i: CartItem) => i.id === cartItemId);
        if (item) {
          if (quantity <= 0) {
            state.items = state.items.filter((i: CartItem) => i.id !== cartItemId);
          } else {
            item.quantity = quantity;
            item.totalPrice = calculateItemTotal(
              item.menuItem,
              quantity,
              item.selectedCustomizations
            );
          }
        }
      });
    },

    removeItem: (cartItemId) => {
      set((state) => {
        state.items = state.items.filter((i: CartItem) => i.id !== cartItemId);
      });
    },

    updateItemCustomizations: (cartItemId, customizations, specialInstructions) => {
      set((state) => {
        const item = state.items.find((i: CartItem) => i.id === cartItemId);
        if (item) {
          item.selectedCustomizations = customizations;
          if (specialInstructions !== undefined) {
            item.specialInstructions = specialInstructions;
          }
          item.totalPrice = calculateItemTotal(
            item.menuItem,
            item.quantity,
            customizations
          );
        }
      });
    },

    clearCart: () => {
      set((state) => {
        state.items = [];
      });
    },

    generateIdempotencyKey: () => {
      const restaurantId = get().restaurantId;
      const tableId = get().tableId;
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 11);
      return `${restaurantId}-${tableId}-${timestamp}-${random}`;
    },
  })),
  {
    name: 'qr-cart-storage',
    version: 1,
    partialize: (state) => ({
      items: state.items.map((item) => ({
        id: item.id,
        menuItem: {
          id: item.menuItem.id,
          name: item.menuItem.name,
          price: item.menuItem.price,
          image: item.menuItem.image,
          // Retain fields needed by CartPage / FloatingCartButton
          prepTime: item.menuItem.prepTime,
          categoryId: item.menuItem.categoryId,
          isAvailable: item.menuItem.isAvailable,
          customizationGroups: item.menuItem.customizationGroups,
        } as import('../types').MenuItem,
        quantity: item.quantity,
        selectedCustomizations: item.selectedCustomizations,
        specialInstructions: item.specialInstructions,
        totalPrice: item.totalPrice,
      })),
      restaurantId: state.restaurantId,
      tableId: state.tableId,
    }),
  })
);

/** Derived selector: total number of items in the cart. */
export const selectTotalItems = (s: CartState) => s.items.reduce((sum, item) => sum + item.quantity, 0);

/** Derived selector: cart subtotal (sum of item totals). */
export const selectSubtotal = (s: CartState) => s.items.reduce((sum, item) => sum + item.totalPrice, 0);
