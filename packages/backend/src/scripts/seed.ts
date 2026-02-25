import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo restaurant
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'demo-restaurant' },
    update: {},
    create: {
      name: 'Q Order',
      slug: 'demo-restaurant',
      description: 'Fresh brews, artisan bites & warm vibes — order from your table.',
      address: '123 Main Street, City, Country',
      phone: '+1 234 567 8900',
      email: 'demo@restaurant.com',
      currency: 'USD',
      taxRate: 8.25,
      settings: {
        acceptingOrders: true,
        defaultPrepTime: 15,
      },
    },
  });

  console.log(`✅ Restaurant created: ${restaurant.name}`);

  // Create admin user
  const passwordHash = await bcrypt.hash('Admin123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      username: 'admin',
      passwordHash,
      name: 'Admin User',
      role: 'OWNER',
      restaurantId: restaurant.id,
    },
  });

  console.log(`✅ Admin user created: ${admin.email}`);

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: 'Appetizers' } },
      update: {},
      create: {
        name: 'Appetizers',
        description: 'Start your meal with our delicious appetizers',
        sortOrder: 1,
        restaurantId: restaurant.id,
      },
    }),
    prisma.category.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: 'Main Courses' } },
      update: {},
      create: {
        name: 'Main Courses',
        description: 'Our signature main dishes',
        sortOrder: 2,
        restaurantId: restaurant.id,
      },
    }),
    prisma.category.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: 'Beverages' } },
      update: {},
      create: {
        name: 'Beverages',
        description: 'Refreshing drinks',
        sortOrder: 3,
        restaurantId: restaurant.id,
      },
    }),
    prisma.category.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: 'Desserts' } },
      update: {},
      create: {
        name: 'Desserts',
        description: 'Sweet endings',
        sortOrder: 4,
        restaurantId: restaurant.id,
      },
    }),
  ]);

  console.log(`✅ Categories created: ${categories.length}`);

  // Create menu items
  const menuItems = [
    // Appetizers
    { name: 'Spring Rolls', description: 'Crispy vegetable spring rolls with sweet chili sauce', price: 8.99, categoryName: 'Appetizers', prepTime: 10, ingredients: ['rice paper', 'cabbage', 'carrots', 'glass noodles', 'sweet chili sauce'] },
    { name: 'Chicken Wings', description: 'Spicy buffalo wings with blue cheese dip', price: 12.99, categoryName: 'Appetizers', prepTime: 15, ingredients: ['chicken wings', 'buffalo sauce', 'butter', 'blue cheese', 'celery'] },
    { name: 'Soup of the Day', description: 'Ask your server for today\'s selection', price: 6.99, categoryName: 'Appetizers', prepTime: 5, ingredients: ['seasonal vegetables', 'broth', 'herbs', 'cream'] },
    
    // Main Courses
    { name: 'Grilled Salmon', description: 'Atlantic salmon with lemon butter sauce and seasonal vegetables', price: 24.99, categoryName: 'Main Courses', prepTime: 20, ingredients: ['Atlantic salmon', 'lemon', 'butter', 'asparagus', 'cherry tomatoes', 'dill'] },
    { name: 'Beef Burger', description: 'Angus beef patty with cheese, lettuce, tomato, and fries', price: 16.99, categoryName: 'Main Courses', prepTime: 15, ingredients: ['Angus beef patty', 'cheddar cheese', 'lettuce', 'tomato', 'brioche bun', 'fries'] },
    { name: 'Margherita Pizza', description: 'Classic pizza with tomato, mozzarella, and fresh basil', price: 14.99, categoryName: 'Main Courses', prepTime: 18, ingredients: ['pizza dough', 'tomato sauce', 'mozzarella', 'fresh basil', 'olive oil'] },
    { name: 'Chicken Alfredo', description: 'Fettuccine pasta with creamy alfredo sauce and grilled chicken', price: 18.99, categoryName: 'Main Courses', prepTime: 15, ingredients: ['fettuccine', 'grilled chicken', 'heavy cream', 'parmesan cheese', 'garlic', 'butter'] },
    
    // Beverages
    { name: 'Soft Drinks', description: 'Coca-Cola, Sprite, or Fanta', price: 2.99, categoryName: 'Beverages', prepTime: 1, ingredients: ['carbonated water', 'sugar', 'natural flavors'] },
    { name: 'Fresh Juice', description: 'Orange, Apple, or Mango juice', price: 4.99, categoryName: 'Beverages', prepTime: 3, ingredients: ['fresh fruits', 'water', 'ice'] },
    { name: 'Coffee', description: 'Freshly brewed coffee', price: 3.49, categoryName: 'Beverages', prepTime: 3, ingredients: ['Arabica coffee beans', 'water'] },
    
    // Desserts
    { name: 'Chocolate Cake', description: 'Rich chocolate layer cake with ganache', price: 7.99, categoryName: 'Desserts', prepTime: 5, ingredients: ['dark chocolate', 'flour', 'butter', 'eggs', 'sugar', 'cocoa powder'] },
    { name: 'Ice Cream', description: 'Three scoops of your choice', price: 5.99, categoryName: 'Desserts', prepTime: 3, ingredients: ['cream', 'milk', 'sugar', 'vanilla'] },
    { name: 'Tiramisu', description: 'Classic Italian coffee-flavored dessert', price: 8.99, categoryName: 'Desserts', prepTime: 5, ingredients: ['ladyfingers', 'mascarpone', 'espresso', 'cocoa powder', 'eggs', 'sugar'] },
  ];

  for (const item of menuItems) {
    const category = categories.find(c => c.name === item.categoryName);
    if (category) {
      await prisma.menuItem.upsert({
        where: { 
          restaurantId_name_categoryId: { 
            restaurantId: restaurant.id, 
            name: item.name,
            categoryId: category.id,
          } 
        },
        update: {},
        create: {
          name: item.name,
          description: item.description,
          price: item.price,
          prepTime: item.prepTime,
          ingredients: item.ingredients,
          restaurantId: restaurant.id,
          categoryId: category.id,
        },
      });
    }
  }

  console.log(`✅ Menu items created: ${menuItems.length}`);

  // Create tables
  const tables = [];
  for (let i = 1; i <= 10; i++) {
    const table = await prisma.table.upsert({
      where: { restaurantId_number: { restaurantId: restaurant.id, number: String(i) } },
      update: {},
      create: {
        number: String(i),
        name: `Table ${i}`,
        capacity: i <= 4 ? 2 : i <= 8 ? 4 : 6,
        qrCode: `${restaurant.id}-${i}-${Math.random().toString(36).slice(2, 10)}`,
        restaurantId: restaurant.id,
      },
    });
    tables.push(table);
  }

  console.log(`✅ Tables created: ${tables.length}`);

  console.log('\n🎉 Seeding complete!');
  console.log('\n📝 Demo credentials:');
  console.log('   Email: admin@demo.com');
  console.log('   Password: Admin123!');
  console.log(`   Restaurant slug: ${restaurant.slug}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
