const request = require('supertest');
const app = require('./app');

test('health endpoint returns OK', async () => {
  const res = await request(app).get('/health');
  expect(res.statusCode).toBe(200);
});

test('restaurants endpoint returns a list', async () => {
  const res = await request(app).get('/api/restaurants');
  expect(res.body.length).toBeGreaterThan(0);
});
