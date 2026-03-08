import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RESTAURANT_ID = '7b9aeaf1-0231-44e2-8966-3caa2ec085bc';

interface SeedCategory {
  name: string;
  description: string;
  sortOrder: number;
}

interface SeedMenuItem {
  name: string;
  description: string;
  price: number;
  discountPrice?: number | null;
  badge?: string | null;
  prepTime?: number;
  calories?: number;
  tags: string[];
  allergens: string[];
  ingredients: string[];
  categoryName: string;
  sortOrder: number;
  customizationGroup?: {
    name: string;
    required: boolean;
    minSelections: number;
    maxSelections: number;
    options: { name: string; priceModifier: number; isDefault: boolean }[];
  };
}

const categories: SeedCategory[] = [
  { name: 'Starters', description: 'Delicious appetizers and snacks to kick off your meal', sortOrder: 1 },
  { name: 'Pizzas', description: 'Freshly baked artisan pizzas with premium toppings', sortOrder: 2 },
  { name: 'Burgers & Sandwiches', description: 'Juicy burgers and loaded sandwiches', sortOrder: 3 },
  { name: 'Pasta & Mains', description: 'Hearty main courses and pasta dishes', sortOrder: 4 },
  { name: 'Asian & Indian Specials', description: 'Flavourful Asian and Indian delicacies', sortOrder: 5 },
  { name: 'Desserts', description: 'Sweet treats and indulgent desserts', sortOrder: 6 },
  { name: 'Beverages', description: 'Refreshing drinks and beverages', sortOrder: 7 },
  { name: 'Combos & Deals', description: 'Value meals and combo offers', sortOrder: 8 },
];

const menuItems: SeedMenuItem[] = [
  // ── Starters ──
  {
    name: 'Truffle Fries',
    description: 'Crispy golden fries drizzled with truffle oil and parmesan',
    price: 249,
    discountPrice: null,
    badge: 'Popular',
    prepTime: 10,
    calories: 320,
    tags: ['vegetarian', 'popular'],
    allergens: ['dairy'],
    ingredients: ['potato', 'truffle oil', 'parmesan', 'sea salt'],
    categoryName: 'Starters',
    sortOrder: 1,
    customizationGroup: {
      name: 'Portion Size',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Regular', priceModifier: 0, isDefault: true },
        { name: 'Large', priceModifier: 80, isDefault: false },
      ],
    },
  },
  {
    name: 'Chicken Wings',
    description: 'Spicy buffalo chicken wings served with ranch dip',
    price: 349,
    discountPrice: 299,
    badge: 'Bestseller',
    prepTime: 15,
    calories: 480,
    tags: ['non-vegetarian', 'spicy', 'bestseller'],
    allergens: ['dairy'],
    ingredients: ['chicken wings', 'buffalo sauce', 'butter', 'ranch dressing'],
    categoryName: 'Starters',
    sortOrder: 2,
    customizationGroup: {
      name: 'Spice Level',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Mild', priceModifier: 0, isDefault: false },
        { name: 'Medium', priceModifier: 0, isDefault: true },
        { name: 'Hot', priceModifier: 0, isDefault: false },
        { name: 'Extra Hot', priceModifier: 0, isDefault: false },
      ],
    },
  },
  {
    name: 'Caesar Salad',
    description: 'Fresh romaine lettuce with caesar dressing, croutons and parmesan',
    price: 229,
    discountPrice: null,
    badge: null,
    prepTime: 8,
    calories: 210,
    tags: ['vegetarian', 'healthy'],
    allergens: ['dairy', 'gluten'],
    ingredients: ['romaine lettuce', 'caesar dressing', 'croutons', 'parmesan'],
    categoryName: 'Starters',
    sortOrder: 3,
  },
  {
    name: 'Garlic Bread',
    description: 'Warm toasted bread with garlic butter and herbs',
    price: 149,
    discountPrice: null,
    badge: null,
    prepTime: 7,
    calories: 280,
    tags: ['vegetarian'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['bread', 'garlic butter', 'mixed herbs', 'parsley'],
    categoryName: 'Starters',
    sortOrder: 4,
    customizationGroup: {
      name: 'Add Cheese',
      required: false,
      minSelections: 0,
      maxSelections: 1,
      options: [
        { name: 'No Cheese', priceModifier: 0, isDefault: true },
        { name: 'With Cheese', priceModifier: 40, isDefault: false },
      ],
    },
  },
  {
    name: 'Nachos Supreme',
    description: 'Loaded tortilla chips with cheese, salsa, jalapeños and sour cream',
    price: 279,
    discountPrice: null,
    badge: 'New',
    prepTime: 10,
    calories: 450,
    tags: ['vegetarian', 'new'],
    allergens: ['dairy', 'gluten'],
    ingredients: ['tortilla chips', 'cheddar cheese', 'salsa', 'jalapeños', 'sour cream'],
    categoryName: 'Starters',
    sortOrder: 5,
  },
  {
    name: 'Crispy Onion Rings',
    description: 'Golden fried onion rings with chipotle mayo',
    price: 179,
    discountPrice: null,
    badge: null,
    prepTime: 8,
    calories: 340,
    tags: ['vegetarian'],
    allergens: ['gluten'],
    ingredients: ['onion', 'flour batter', 'breadcrumbs', 'chipotle mayo'],
    categoryName: 'Starters',
    sortOrder: 6,
  },

  // ── Pizzas ──
  {
    name: 'Margherita Pizza',
    description: 'Classic pizza with fresh mozzarella, tomato sauce and basil',
    price: 349,
    discountPrice: null,
    badge: 'Classic',
    prepTime: 18,
    calories: 680,
    tags: ['vegetarian', 'classic'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['pizza dough', 'tomato sauce', 'mozzarella', 'fresh basil', 'olive oil'],
    categoryName: 'Pizzas',
    sortOrder: 1,
    customizationGroup: {
      name: 'Pizza Size',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Medium (10")', priceModifier: 0, isDefault: true },
        { name: 'Large (12")', priceModifier: 100, isDefault: false },
        { name: 'Extra Large (14")', priceModifier: 200, isDefault: false },
      ],
    },
  },
  {
    name: 'Veggie Supreme Pizza',
    description: 'Loaded with bell peppers, mushrooms, olives, onions and corn',
    price: 399,
    discountPrice: 369,
    badge: null,
    prepTime: 20,
    calories: 720,
    tags: ['vegetarian'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['pizza dough', 'tomato sauce', 'mozzarella', 'bell peppers', 'mushrooms', 'olives', 'onions', 'corn'],
    categoryName: 'Pizzas',
    sortOrder: 2,
    customizationGroup: {
      name: 'Pizza Size',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Medium (10")', priceModifier: 0, isDefault: true },
        { name: 'Large (12")', priceModifier: 100, isDefault: false },
        { name: 'Extra Large (14")', priceModifier: 200, isDefault: false },
      ],
    },
  },
  {
    name: 'BBQ Chicken Pizza',
    description: 'Smoky BBQ sauce, grilled chicken, red onion and jalapeños',
    price: 449,
    discountPrice: null,
    badge: 'Popular',
    prepTime: 20,
    calories: 780,
    tags: ['non-vegetarian', 'popular'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['pizza dough', 'BBQ sauce', 'grilled chicken', 'mozzarella', 'red onion', 'jalapeños'],
    categoryName: 'Pizzas',
    sortOrder: 3,
    customizationGroup: {
      name: 'Pizza Size',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Medium (10")', priceModifier: 0, isDefault: true },
        { name: 'Large (12")', priceModifier: 100, isDefault: false },
        { name: 'Extra Large (14")', priceModifier: 200, isDefault: false },
      ],
    },
  },
  {
    name: 'Pepperoni Pizza',
    description: 'Classic pepperoni with extra mozzarella and oregano',
    price: 429,
    discountPrice: null,
    badge: 'Bestseller',
    prepTime: 18,
    calories: 820,
    tags: ['non-vegetarian', 'bestseller'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['pizza dough', 'tomato sauce', 'mozzarella', 'pepperoni', 'oregano'],
    categoryName: 'Pizzas',
    sortOrder: 4,
    customizationGroup: {
      name: 'Pizza Size',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Medium (10")', priceModifier: 0, isDefault: true },
        { name: 'Large (12")', priceModifier: 100, isDefault: false },
        { name: 'Extra Large (14")', priceModifier: 200, isDefault: false },
      ],
    },
  },
  {
    name: 'Farmhouse Pizza',
    description: 'Fresh veggies with onion, capsicum, tomato and mushroom',
    price: 379,
    discountPrice: null,
    badge: null,
    prepTime: 18,
    calories: 700,
    tags: ['vegetarian'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['pizza dough', 'tomato sauce', 'mozzarella', 'onion', 'capsicum', 'tomato', 'mushroom'],
    categoryName: 'Pizzas',
    sortOrder: 5,
  },

  // ── Burgers & Sandwiches ──
  {
    name: 'Classic Beef Burger',
    description: 'Juicy beef patty with lettuce, tomato, pickles and special sauce',
    price: 329,
    discountPrice: null,
    badge: 'Popular',
    prepTime: 15,
    calories: 650,
    tags: ['non-vegetarian', 'popular'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['beef patty', 'brioche bun', 'lettuce', 'tomato', 'pickles', 'special sauce'],
    categoryName: 'Burgers & Sandwiches',
    sortOrder: 1,
    customizationGroup: {
      name: 'Add-ons',
      required: false,
      minSelections: 0,
      maxSelections: 3,
      options: [
        { name: 'Extra Cheese', priceModifier: 30, isDefault: false },
        { name: 'Bacon', priceModifier: 50, isDefault: false },
        { name: 'Fried Egg', priceModifier: 25, isDefault: false },
        { name: 'Extra Patty', priceModifier: 100, isDefault: false },
      ],
    },
  },
  {
    name: 'Grilled Chicken Burger',
    description: 'Tender grilled chicken breast with avocado and chipotle mayo',
    price: 319,
    discountPrice: 279,
    badge: null,
    prepTime: 14,
    calories: 520,
    tags: ['non-vegetarian'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['chicken breast', 'brioche bun', 'avocado', 'chipotle mayo', 'lettuce', 'tomato'],
    categoryName: 'Burgers & Sandwiches',
    sortOrder: 2,
  },
  {
    name: 'Veg Supreme Burger',
    description: 'Crispy veggie patty with fresh veggies and mint mayo',
    price: 249,
    discountPrice: null,
    badge: 'Healthy',
    prepTime: 12,
    calories: 420,
    tags: ['vegetarian', 'healthy'],
    allergens: ['gluten'],
    ingredients: ['veggie patty', 'brioche bun', 'lettuce', 'tomato', 'onion rings', 'mint mayo'],
    categoryName: 'Burgers & Sandwiches',
    sortOrder: 3,
  },
  {
    name: 'Double Cheese Burger',
    description: 'Double beef patty with melted cheddar and American cheese',
    price: 429,
    discountPrice: null,
    badge: 'Indulgent',
    prepTime: 18,
    calories: 920,
    tags: ['non-vegetarian', 'indulgent'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['double beef patty', 'cheddar', 'American cheese', 'brioche bun', 'pickles', 'ketchup', 'mustard'],
    categoryName: 'Burgers & Sandwiches',
    sortOrder: 4,
  },
  {
    name: 'Club Sandwich',
    description: 'Triple-decker sandwich with grilled chicken, bacon, egg and veggies',
    price: 299,
    discountPrice: null,
    badge: null,
    prepTime: 12,
    calories: 580,
    tags: ['non-vegetarian'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['toast bread', 'grilled chicken', 'bacon', 'egg', 'lettuce', 'tomato', 'mayo'],
    categoryName: 'Burgers & Sandwiches',
    sortOrder: 5,
  },

  // ── Pasta & Mains ──
  {
    name: 'Creamy Alfredo Pasta',
    description: 'Fettuccine in rich creamy alfredo sauce with mushrooms',
    price: 329,
    discountPrice: null,
    badge: 'Comfort Food',
    prepTime: 18,
    calories: 680,
    tags: ['vegetarian', 'comfort food'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['fettuccine', 'alfredo sauce', 'cream', 'parmesan', 'mushrooms', 'garlic'],
    categoryName: 'Pasta & Mains',
    sortOrder: 1,
    customizationGroup: {
      name: 'Pasta Type',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Penne', priceModifier: 0, isDefault: false },
        { name: 'Spaghetti', priceModifier: 0, isDefault: false },
        { name: 'Fettuccine', priceModifier: 0, isDefault: true },
        { name: 'Fusilli', priceModifier: 0, isDefault: false },
      ],
    },
  },
  {
    name: 'Arrabbiata Pasta',
    description: 'Penne in spicy tomato sauce with garlic, chilli and basil',
    price: 299,
    discountPrice: null,
    badge: 'Spicy',
    prepTime: 16,
    calories: 520,
    tags: ['vegetarian', 'spicy'],
    allergens: ['gluten'],
    ingredients: ['penne', 'tomato sauce', 'garlic', 'red chilli', 'basil', 'olive oil'],
    categoryName: 'Pasta & Mains',
    sortOrder: 2,
  },
  {
    name: 'Grilled Chicken Steak',
    description: 'Herb-marinated chicken breast with mashed potato and sautéed veggies',
    price: 449,
    discountPrice: 399,
    badge: null,
    prepTime: 25,
    calories: 620,
    tags: ['non-vegetarian'],
    allergens: ['dairy'],
    ingredients: ['chicken breast', 'herbs', 'mashed potato', 'sautéed vegetables', 'gravy'],
    categoryName: 'Pasta & Mains',
    sortOrder: 3,
  },
  {
    name: 'Paneer Tikka',
    description: 'Marinated cottage cheese cubes grilled in tandoor with spices',
    price: 299,
    discountPrice: null,
    badge: 'Popular',
    prepTime: 18,
    calories: 380,
    tags: ['vegetarian', 'popular', 'indian'],
    allergens: ['dairy'],
    ingredients: ['paneer', 'yogurt', 'tikka masala', 'bell peppers', 'onion', 'lemon'],
    categoryName: 'Pasta & Mains',
    sortOrder: 4,
  },
  {
    name: 'Fish & Chips',
    description: 'Beer-battered fish fillet with crispy fries and tartar sauce',
    price: 399,
    discountPrice: null,
    badge: 'Classic',
    prepTime: 20,
    calories: 720,
    tags: ['non-vegetarian', 'classic'],
    allergens: ['gluten', 'fish'],
    ingredients: ['fish fillet', 'beer batter', 'fries', 'tartar sauce', 'lemon'],
    categoryName: 'Pasta & Mains',
    sortOrder: 5,
  },

  // ── Asian & Indian Specials ──
  {
    name: 'Veg Fried Rice',
    description: 'Stir-fried rice with fresh vegetables and soy sauce',
    price: 229,
    discountPrice: null,
    badge: null,
    prepTime: 12,
    calories: 420,
    tags: ['vegetarian', 'asian'],
    allergens: ['soy'],
    ingredients: ['basmati rice', 'mixed vegetables', 'soy sauce', 'garlic', 'spring onion'],
    categoryName: 'Asian & Indian Specials',
    sortOrder: 1,
    customizationGroup: {
      name: 'Spice Level',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Mild', priceModifier: 0, isDefault: false },
        { name: 'Medium', priceModifier: 0, isDefault: true },
        { name: 'Hot', priceModifier: 0, isDefault: false },
      ],
    },
  },
  {
    name: 'Chicken Biryani',
    description: 'Aromatic basmati rice layered with spiced chicken and saffron',
    price: 349,
    discountPrice: null,
    badge: 'Chef\'s Special',
    prepTime: 30,
    calories: 650,
    tags: ['non-vegetarian', 'indian', 'popular'],
    allergens: ['dairy', 'nuts'],
    ingredients: ['basmati rice', 'chicken', 'saffron', 'biryani masala', 'yogurt', 'fried onion', 'mint'],
    categoryName: 'Asian & Indian Specials',
    sortOrder: 2,
  },
  {
    name: 'Hakka Noodles',
    description: 'Stir-fried noodles with vegetables in Indo-Chinese sauce',
    price: 219,
    discountPrice: null,
    badge: null,
    prepTime: 12,
    calories: 380,
    tags: ['vegetarian', 'asian'],
    allergens: ['gluten', 'soy'],
    ingredients: ['egg noodles', 'mixed vegetables', 'soy sauce', 'vinegar', 'garlic', 'chilli'],
    categoryName: 'Asian & Indian Specials',
    sortOrder: 3,
  },
  {
    name: 'Butter Chicken',
    description: 'Tender chicken in rich, creamy tomato-butter gravy',
    price: 379,
    discountPrice: null,
    badge: 'Bestseller',
    prepTime: 25,
    calories: 550,
    tags: ['non-vegetarian', 'indian', 'bestseller'],
    allergens: ['dairy', 'nuts'],
    ingredients: ['chicken', 'tomato', 'butter', 'cream', 'cashew paste', 'spices', 'fenugreek'],
    categoryName: 'Asian & Indian Specials',
    sortOrder: 4,
  },
  {
    name: 'Dal Tadka',
    description: 'Yellow lentils tempered with cumin, garlic and ghee',
    price: 199,
    discountPrice: null,
    badge: null,
    prepTime: 20,
    calories: 280,
    tags: ['vegetarian', 'indian', 'healthy'],
    allergens: ['dairy'],
    ingredients: ['yellow lentils', 'cumin', 'garlic', 'ghee', 'tomato', 'green chilli', 'coriander'],
    categoryName: 'Asian & Indian Specials',
    sortOrder: 5,
  },

  // ── Desserts ──
  {
    name: 'Chocolate Lava Cake',
    description: 'Warm chocolate cake with a molten centre, served with vanilla ice cream',
    price: 249,
    discountPrice: null,
    badge: 'Must Try',
    prepTime: 15,
    calories: 480,
    tags: ['vegetarian', 'must try', 'indulgent'],
    allergens: ['gluten', 'dairy', 'eggs'],
    ingredients: ['dark chocolate', 'butter', 'eggs', 'flour', 'vanilla ice cream'],
    categoryName: 'Desserts',
    sortOrder: 1,
  },
  {
    name: 'New York Cheesecake',
    description: 'Rich and creamy cheesecake with a graham cracker crust',
    price: 279,
    discountPrice: null,
    badge: null,
    prepTime: 5,
    calories: 420,
    tags: ['vegetarian'],
    allergens: ['gluten', 'dairy', 'eggs'],
    ingredients: ['cream cheese', 'graham cracker', 'sugar', 'eggs', 'vanilla extract'],
    categoryName: 'Desserts',
    sortOrder: 2,
  },
  {
    name: 'Brownie with Ice Cream',
    description: 'Warm fudgy brownie topped with vanilla ice cream and chocolate sauce',
    price: 229,
    discountPrice: 199,
    badge: 'Popular',
    prepTime: 8,
    calories: 520,
    tags: ['vegetarian', 'popular'],
    allergens: ['gluten', 'dairy', 'eggs', 'nuts'],
    ingredients: ['dark chocolate', 'butter', 'walnuts', 'flour', 'vanilla ice cream', 'chocolate sauce'],
    categoryName: 'Desserts',
    sortOrder: 3,
  },
  {
    name: 'Gulab Jamun',
    description: 'Soft milk dumplings soaked in cardamom-infused sugar syrup',
    price: 149,
    discountPrice: null,
    badge: null,
    prepTime: 5,
    calories: 320,
    tags: ['vegetarian', 'indian'],
    allergens: ['dairy', 'gluten'],
    ingredients: ['khoya', 'flour', 'sugar syrup', 'cardamom', 'rose water'],
    categoryName: 'Desserts',
    sortOrder: 4,
  },

  // ── Beverages ──
  {
    name: 'Iced Coffee',
    description: 'Chilled espresso over ice with a dash of milk',
    price: 179,
    discountPrice: null,
    badge: null,
    prepTime: 5,
    calories: 120,
    tags: ['beverage', 'cold'],
    allergens: ['dairy'],
    ingredients: ['espresso', 'ice', 'milk', 'sugar'],
    categoryName: 'Beverages',
    sortOrder: 1,
    customizationGroup: {
      name: 'Milk Choice',
      required: false,
      minSelections: 0,
      maxSelections: 1,
      options: [
        { name: 'Regular Milk', priceModifier: 0, isDefault: true },
        { name: 'Oat Milk', priceModifier: 30, isDefault: false },
        { name: 'Almond Milk', priceModifier: 40, isDefault: false },
        { name: 'Soy Milk', priceModifier: 25, isDefault: false },
      ],
    },
  },
  {
    name: 'Iced Latte',
    description: 'Smooth espresso blended with cold frothy milk',
    price: 199,
    discountPrice: null,
    badge: 'Popular',
    prepTime: 5,
    calories: 150,
    tags: ['beverage', 'cold', 'popular'],
    allergens: ['dairy'],
    ingredients: ['espresso', 'milk', 'ice'],
    categoryName: 'Beverages',
    sortOrder: 2,
  },
  {
    name: 'Fresh Orange Juice',
    description: 'Freshly squeezed orange juice, no added sugar',
    price: 149,
    discountPrice: null,
    badge: 'Healthy',
    prepTime: 5,
    calories: 90,
    tags: ['beverage', 'healthy', 'fresh'],
    allergens: [],
    ingredients: ['fresh oranges'],
    categoryName: 'Beverages',
    sortOrder: 3,
  },
  {
    name: 'Vanilla Milkshake',
    description: 'Thick and creamy vanilla milkshake topped with whipped cream',
    price: 199,
    discountPrice: null,
    badge: null,
    prepTime: 5,
    calories: 350,
    tags: ['beverage', 'cold'],
    allergens: ['dairy'],
    ingredients: ['vanilla ice cream', 'milk', 'whipped cream', 'vanilla extract'],
    categoryName: 'Beverages',
    sortOrder: 4,
  },
  {
    name: 'Soft Drinks',
    description: 'Choice of Coca-Cola, Sprite, Fanta or Thumbs Up',
    price: 79,
    discountPrice: null,
    badge: null,
    prepTime: 2,
    calories: 140,
    tags: ['beverage', 'cold'],
    allergens: [],
    ingredients: ['carbonated drink'],
    categoryName: 'Beverages',
    sortOrder: 5,
    customizationGroup: {
      name: 'Drink Choice',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Coca-Cola', priceModifier: 0, isDefault: true },
        { name: 'Sprite', priceModifier: 0, isDefault: false },
        { name: 'Fanta', priceModifier: 0, isDefault: false },
        { name: 'Thumbs Up', priceModifier: 0, isDefault: false },
      ],
    },
  },
  {
    name: 'Mineral Water',
    description: 'Packaged drinking water (500ml)',
    price: 40,
    discountPrice: null,
    badge: null,
    prepTime: 1,
    calories: 0,
    tags: ['beverage'],
    allergens: [],
    ingredients: ['purified water'],
    categoryName: 'Beverages',
    sortOrder: 6,
  },

  // ── Combos & Deals ──
  {
    name: 'Classic Combo Meal',
    description: 'Any burger + fries + soft drink — the perfect trio',
    price: 449,
    discountPrice: 399,
    badge: 'Value Deal',
    prepTime: 18,
    calories: 950,
    tags: ['combo', 'value', 'popular'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['burger', 'fries', 'soft drink'],
    categoryName: 'Combos & Deals',
    sortOrder: 1,
  },
  {
    name: 'Pizza + Coke Combo',
    description: 'Any medium pizza with a 300ml Coca-Cola',
    price: 399,
    discountPrice: 349,
    badge: 'Popular',
    prepTime: 20,
    calories: 820,
    tags: ['combo', 'popular'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['pizza', 'coca-cola'],
    categoryName: 'Combos & Deals',
    sortOrder: 2,
  },
  {
    name: 'Family Feast Combo',
    description: '2 pizzas + garlic bread + 4 soft drinks — great for sharing',
    price: 1199,
    discountPrice: 999,
    badge: 'Best Value',
    prepTime: 25,
    calories: 2800,
    tags: ['combo', 'family', 'value'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['2 pizzas', 'garlic bread', '4 soft drinks'],
    categoryName: 'Combos & Deals',
    sortOrder: 3,
  },
  {
    name: 'Burger Duo Deal',
    description: '2 burgers + 2 fries + 2 soft drinks',
    price: 699,
    discountPrice: 599,
    badge: 'Deal',
    prepTime: 18,
    calories: 1800,
    tags: ['combo', 'value'],
    allergens: ['gluten', 'dairy'],
    ingredients: ['2 burgers', '2 fries', '2 soft drinks'],
    categoryName: 'Combos & Deals',
    sortOrder: 4,
  },
];

async function seed() {
  console.log('🌱 Seeding menu for Lotus Cafe...\n');

  // Step 1: Create categories
  const categoryMap: Record<string, string> = {};
  for (const cat of categories) {
    const created = await prisma.category.upsert({
      where: { restaurantId_branchId_name: { restaurantId: RESTAURANT_ID, branchId: '', name: cat.name } },
      update: { description: cat.description, sortOrder: cat.sortOrder },
      create: {
        name: cat.name,
        description: cat.description,
        sortOrder: cat.sortOrder,
        restaurantId: RESTAURANT_ID,
      },
    });
    categoryMap[cat.name] = created.id;
    console.log(`  ✅ Category: ${cat.name} (${created.id})`);
  }

  console.log(`\n📦 Created ${Object.keys(categoryMap).length} categories\n`);

  // Step 2: Create menu items
  let itemCount = 0;
  for (const item of menuItems) {
    const categoryId = categoryMap[item.categoryName];
    if (!categoryId) {
      console.error(`  ❌ Category "${item.categoryName}" not found! Skipping ${item.name}`);
      continue;
    }

    // Upsert modifier group if present
    let modifierGroupId: string | undefined;
    if (item.customizationGroup) {
      const mg = item.customizationGroup;
      const modGroup = await prisma.modifierGroup.upsert({
        where: { restaurantId_branchId_name: { restaurantId: RESTAURANT_ID, branchId: '', name: mg.name } },
        update: {
          isRequired: mg.required,
          minSelect: mg.minSelections,
          maxSelect: mg.maxSelections,
        },
        create: {
          name: mg.name,
          isRequired: mg.required,
          minSelect: mg.minSelections,
          maxSelect: mg.maxSelections,
          restaurantId: RESTAURANT_ID,
        },
      });

      // Clean existing modifiers and recreate
      await prisma.modifier.deleteMany({ where: { modifierGroupId: modGroup.id } });
      await prisma.modifier.createMany({
        data: mg.options.map((opt, idx) => ({
          name: opt.name,
          price: opt.priceModifier,
          isDefault: opt.isDefault,
          isActive: true,
          sortOrder: idx,
          modifierGroupId: modGroup.id,
        })),
      });

      modifierGroupId = modGroup.id;
    }

    // Upsert menu item
    const existing = await prisma.menuItem.findFirst({
      where: { restaurantId: RESTAURANT_ID, name: item.name, categoryId },
    });

    if (existing) {
      // Update existing
      await prisma.menuItem.update({
        where: { id: existing.id },
        data: {
          description: item.description,
          price: item.price,
          discountPrice: item.discountPrice ?? null,
          badge: item.badge ?? null,
          prepTime: item.prepTime ?? null,
          calories: item.calories ?? null,
          tags: item.tags,
          allergens: item.allergens,
          ingredients: item.ingredients,
          sortOrder: item.sortOrder,
          isAvailable: true,
          isActive: true,
        },
      });

      if (modifierGroupId) {
        // Link modifier group if not already linked
        const linkExists = await prisma.menuItemModifierGroup.findFirst({
          where: { menuItemId: existing.id, modifierGroupId },
        });
        if (!linkExists) {
          await prisma.menuItemModifierGroup.create({
            data: { menuItemId: existing.id, modifierGroupId, sortOrder: 0 },
          });
        }
      }

      console.log(`  🔄 Updated: ${item.name}`);
    } else {
      // Create new
      const created = await prisma.menuItem.create({
        data: {
          name: item.name,
          description: item.description,
          price: item.price,
          discountPrice: item.discountPrice ?? null,
          badge: item.badge ?? null,
          prepTime: item.prepTime ?? null,
          calories: item.calories ?? null,
          tags: item.tags,
          allergens: item.allergens,
          ingredients: item.ingredients,
          sortOrder: item.sortOrder,
          isAvailable: true,
          isActive: true,
          categoryId,
          restaurantId: RESTAURANT_ID,
          ...(modifierGroupId ? {
            modifierGroups: {
              create: { modifierGroupId, sortOrder: 0 },
            },
          } : {}),
        },
      });
      console.log(`  ✅ Created: ${item.name} (${created.id})`);
    }
    itemCount++;
  }

  console.log(`\n🎉 Done! Seeded ${itemCount} menu items across ${categories.length} categories.\n`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
