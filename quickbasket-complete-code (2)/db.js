const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'foodapp',
  user: process.env.PGUSER || process.env.POSTGRES_USER || 'foodapp',
  password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
});

async function initDb() {
  // CREATE IF NOT EXISTS and ON CONFLICT preserve existing records.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      cuisine VARCHAR(80) NOT NULL,
      rating NUMERIC(2,1) NOT NULL DEFAULT 4.0,
      delivery_minutes INTEGER NOT NULL DEFAULT 30,
      image_url TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
      category VARCHAR(80) NOT NULL DEFAULT 'Popular',
      image_url TEXT,
      available BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (restaurant_id, name)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      tracking_code VARCHAR(24) NOT NULL UNIQUE,
      customer_name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      address TEXT NOT NULL,
      total NUMERIC(10,2) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'placed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id INTEGER REFERENCES menu_items(id),
      item_name VARCHAR(120) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(10,2) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_code);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);

  // Upgrade an existing minimal restaurants table without dropping or recreating it.
  await pool.query(`
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1) NOT NULL DEFAULT 4.0;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS delivery_minutes INTEGER NOT NULL DEFAULT 30;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  const restaurants = [
    ['Spice Villa', 'Indian', 4.5, 30, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900'],
    ['Pizza Corner', 'Italian', 4.2, 25, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=900'],
    ['Wok Express', 'Chinese', 4.0, 20, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=900']
  ];
  for (const r of restaurants) {
    await pool.query(
      `INSERT INTO restaurants(name,cuisine,rating,delivery_minutes,image_url)
       SELECT $1,$2,$3,$4,$5
       WHERE NOT EXISTS (SELECT 1 FROM restaurants WHERE name=$1)`, r
    );
  }

  const menu = [
    ['Spice Villa','Paneer Butter Masala','Creamy tomato gravy with paneer',249,'Main Course'],
    ['Spice Villa','Veg Biryani','Aromatic basmati rice and vegetables',199,'Rice'],
    ['Spice Villa','Butter Naan','Soft tandoor naan',45,'Breads'],
    ['Pizza Corner','Margherita Pizza','Classic mozzarella and basil',299,'Pizza'],
    ['Pizza Corner','Farmhouse Pizza','Loaded with fresh vegetables',399,'Pizza'],
    ['Pizza Corner','Garlic Bread','Toasted bread with garlic butter',149,'Sides'],
    ['Wok Express','Veg Hakka Noodles','Stir-fried noodles and vegetables',189,'Noodles'],
    ['Wok Express','Veg Manchurian','Crispy vegetable balls in sauce',179,'Starters'],
    ['Wok Express','Fried Rice','Chinese-style vegetable fried rice',169,'Rice']
  ];
  for (const m of menu) {
    await pool.query(
      `INSERT INTO menu_items(restaurant_id,name,description,price,category)
       SELECT r.id,$2,$3,$4,$5 FROM restaurants r
       WHERE r.name=$1
       AND NOT EXISTS (
         SELECT 1 FROM menu_items mi WHERE mi.restaurant_id=r.id AND mi.name=$2
       )`, m
    );
  }
}

module.exports = { pool, initDb };