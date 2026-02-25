// ─── Category Icons (emoji map) ──────────────────────────────────────────────
export const categoryIcons: Record<string, string> = {
  appetizers: '🍢', appetizer: '🍢', starters: '🍢',
  'main courses': '🍽️', 'main course': '🍽️', mains: '🍽️', entrees: '🍽️',
  pizzas: '🍕', pizza: '🍕',
  desserts: '🍰', dessert: '🍰', sweets: '🍬',
  beverages: '🥤', beverage: '🥤', drinks: '🥤',
  salads: '🥗', salad: '🥗',
  burgers: '🍔', burger: '🍔',
  pasta: '🍝', noodles: '🍜',
  soups: '🍲', soup: '🍲',
  seafood: '🦐', sushi: '🍣',
  breakfast: '🍳',
  sandwiches: '🥪', sandwich: '🥪',
  chicken: '🍗',
  biryani: '🍛', rice: '🍚',
  coffee: '☕', tea: '🍵',
  ice_cream: '🍦',
  cake: '🎂', cakes: '🎂',
};

export const getCategoryIcon = (name: string): string => {
  const normalized = name.toLowerCase().trim();
  return categoryIcons[normalized] || '🍴';
};

// ─── Category Images (Unsplash URLs) ────────────────────────────────────────
// Sized at 128×128 (2× for retina on 64×64 display targets)
export const categoryImages: Record<string, string> = {
  appetizers: 'https://images.unsplash.com/photo-1541014741259-de529411b96a?w=128&h=128&fit=crop',
  appetizer: 'https://images.unsplash.com/photo-1541014741259-de529411b96a?w=128&h=128&fit=crop',
  starters: 'https://images.unsplash.com/photo-1541014741259-de529411b96a?w=128&h=128&fit=crop',
  'main courses': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=128&h=128&fit=crop',
  'main course': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=128&h=128&fit=crop',
  mains: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=128&h=128&fit=crop',
  entrees: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=128&h=128&fit=crop',
  pizzas: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=128&h=128&fit=crop',
  pizza: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=128&h=128&fit=crop',
  desserts: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=128&h=128&fit=crop',
  dessert: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=128&h=128&fit=crop',
  sweets: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=128&h=128&fit=crop',
  beverages: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=128&h=128&fit=crop',
  beverage: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=128&h=128&fit=crop',
  drinks: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=128&h=128&fit=crop',
  salads: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=128&h=128&fit=crop',
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=128&h=128&fit=crop',
  burgers: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=128&h=128&fit=crop',
  burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=128&h=128&fit=crop',
  pasta: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=128&h=128&fit=crop',
  soups: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=128&h=128&fit=crop',
  soup: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=128&h=128&fit=crop',
  seafood: 'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=128&h=128&fit=crop',
  sushi: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=128&h=128&fit=crop',
  breakfast: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=128&h=128&fit=crop',
  sandwiches: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=128&h=128&fit=crop',
  sandwich: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=128&h=128&fit=crop',
  chicken: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=128&h=128&fit=crop',
  biryani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=128&h=128&fit=crop',
  rice: 'https://images.unsplash.com/photo-1596560548464-f010549b84d7?w=128&h=128&fit=crop',
  noodles: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=128&h=128&fit=crop',
  coffee: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=128&h=128&fit=crop',
  tea: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=128&h=128&fit=crop',
  ice_cream: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=128&h=128&fit=crop',
  cake: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=128&h=128&fit=crop',
  cakes: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=128&h=128&fit=crop',
};

import { resolveImg } from './resolveImg';

export const getCategoryImage = (name: string, dbImage?: string | null): string | null => {
  if (dbImage) return resolveImg(dbImage);
  const normalized = name.toLowerCase().trim();
  return categoryImages[normalized] || null;
};
