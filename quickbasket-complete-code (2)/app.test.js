const request = require('supertest');
jest.mock('./db', () => ({
  pool: { query: jest.fn(async (sql) => {
    if (sql.includes('SELECT 1')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
    if (sql.includes('FROM restaurants r LEFT JOIN')) return { rows: [{ id: 1, name: 'Spice Villa', cuisine: 'Indian', rating: '4.5' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }), connect: jest.fn() },
  initDb: jest.fn()
}));
const app = require('./app');
test('health endpoint checks database', async () => {
  const res = await request(app).get('/health');
  expect(res.statusCode).toBe(200);
  expect(res.body.database).toBe('connected');
});
test('restaurants endpoint returns database rows', async () => {
  const res = await request(app).get('/api/restaurants');
  expect(res.statusCode).toBe(200);
  expect(res.body[0].name).toBe('Spice Villa');
});
test('order validation rejects empty cart', async () => {
  const res = await request(app).post('/api/orders').send({ customerName:'Test User', phone:'9876543210', address:'Test street Hyderabad', items:[] });
  expect(res.statusCode).toBe(400);
});
