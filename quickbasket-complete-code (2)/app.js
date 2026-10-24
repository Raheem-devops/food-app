const express = require('express');
const crypto = require('crypto');
const client = require('prom-client');
const { pool, initDb } = require('./db');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public'));

client.collectDefaultMetrics();
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2]
});
const ordersPlaced = new client.Counter({
  name: 'orders_placed_total',
  help: 'Total successfully placed orders'
});
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => end({ method: req.method, route: req.route?.path || req.path, status: res.statusCode }));
  next();
});

const VERSION = process.env.APP_VERSION || '2.0.0';
const STATUSES = ['placed', 'preparing', 'out_for_delivery', 'delivered'];

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.status(200).json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'unhealthy', database: 'disconnected' }); }
});
app.get('/version', (req, res) => res.json({ version: VERSION }));
app.get('/api/restaurants', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT r.id,r.name,r.cuisine,r.rating,r.delivery_minutes,r.image_url,
       COUNT(m.id)::int AS menu_count
       FROM restaurants r LEFT JOIN menu_items m ON m.restaurant_id=r.id AND m.available=true
       WHERE r.active=true GROUP BY r.id ORDER BY r.id`
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});
app.get('/api/restaurants/:id/menu', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid restaurant id' });
    const restaurant = await pool.query('SELECT id,name,cuisine FROM restaurants WHERE id=$1 AND active=true', [id]);
    if (!restaurant.rowCount) return res.status(404).json({ error: 'Restaurant not found' });
    const items = await pool.query(
      `SELECT id,restaurant_id,name,description,price,category,image_url
       FROM menu_items WHERE restaurant_id=$1 AND available=true ORDER BY category,id`, [id]
    );
    res.json({ restaurant: restaurant.rows[0], items: items.rows });
  } catch (e) { next(e); }
});
app.post('/api/orders', async (req, res, next) => {
  const { customerName, phone, address, items } = req.body || {};
  if (!customerName || customerName.trim().length < 2) return res.status(400).json({ error: 'Enter your name (at least 2 characters)' });
  if (!phone || !/^[+0-9 ()-]{10,20}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid phone number' });
  if (!address || address.trim().length < 8) return res.status(400).json({ error: 'Enter a delivery address' });
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) return res.status(400).json({ error: 'Cart must contain 1 to 30 items' });

  const clientDb = await pool.connect();
  try {
    await clientDb.query('BEGIN');
    let total = 0;
    const verifiedItems = [];
    for (const item of items) {
      const itemId = Number(item.menuItemId);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw Object.assign(new Error('Invalid item or quantity'), { status: 400 });
      }
      const found = await clientDb.query(
        `SELECT m.id,m.name,m.price FROM menu_items m JOIN restaurants r ON r.id=m.restaurant_id
         WHERE m.id=$1 AND m.available=true AND r.active=true FOR SHARE`, [itemId]
      );
      if (!found.rowCount) throw Object.assign(new Error(`Menu item ${itemId} is unavailable`), { status: 400 });
      const row = found.rows[0];
      const price = Number(row.price);
      total += price * quantity;
      verifiedItems.push({ ...row, quantity, price });
    }
    if (total <= 0 || total > 100000) throw Object.assign(new Error('Order total is outside allowed range'), { status: 400 });
    const trackingCode = `QB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const order = await clientDb.query(
      `INSERT INTO orders(tracking_code,customer_name,phone,address,total,status)
       VALUES($1,$2,$3,$4,$5,'placed') RETURNING id,tracking_code,total,status,created_at`,
      [trackingCode, customerName.trim(), phone.trim(), address.trim(), total]
    );
    for (const item of verifiedItems) {
      await clientDb.query(
        `INSERT INTO order_items(order_id,menu_item_id,item_name,quantity,unit_price)
         VALUES($1,$2,$3,$4,$5)`,
        [order.rows[0].id, item.id, item.name, item.quantity, item.price]
      );
    }
    await clientDb.query('COMMIT');
    ordersPlaced.inc();
    res.status(201).json({ ...order.rows[0], items: verifiedItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })) });
  } catch (e) {
    await clientDb.query('ROLLBACK');
    next(e);
  } finally { clientDb.release(); }
});
app.get('/api/orders/:trackingCode', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id,tracking_code,customer_name,total,status,created_at
       FROM orders WHERE tracking_code=$1`, [req.params.trackingCode.toUpperCase()]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Order not found. Check your tracking code.' });
    const items = await pool.query(
      'SELECT item_name,quantity,unit_price FROM order_items WHERE order_id=$1 ORDER BY id', [result.rows[0].id]
    );
    res.json({ ...result.rows[0], items: items.rows, timeline: STATUSES });
  } catch (e) { next(e); }
});

// Demo-only admin endpoint. Set ADMIN_TOKEN in the Kubernetes Secret.
app.patch('/api/admin/orders/:id/status', async (req, res, next) => {
  const expected = process.env.ADMIN_TOKEN;
  const supplied = req.get('x-admin-token');
  if (!expected || !supplied || supplied !== expected) return res.status(401).json({ error: 'Unauthorized' });
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const result = await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING id,tracking_code,status', [status, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});
app.get('/api/admin/orders', async (req, res, next) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || req.get('x-admin-token') !== expected) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await pool.query(
      `SELECT id,tracking_code,customer_name,phone,address,total,status,created_at
       FROM orders ORDER BY created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
});

module.exports = app;
