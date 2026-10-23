const express = require('express');
const client = require('prom-client');

const app = express();
client.collectDefaultMetrics();

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2],
});

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () =>
    end({ method: req.method, route: req.path, status: res.statusCode })
  );
  next();
});

const VERSION = '3.0.0';

app.get('/health', (req, res) => res.send('OK'));
app.get('/version', (req, res) => res.json({ version: VERSION }));

app.get('/api/restaurants', (req, res) => {
  let x = 0;
  for (let i = 0; i < 2e6; i++) x += Math.sqrt(i);
  res.json([
    { id: 1, name: 'Spice Villa', cuisine: 'Indian', rating: 4.5 },
    { id: 2, name: 'Pizza Corner', cuisine: 'Italian', rating: 4.2 },
    { id: 3, name: 'Wok Express', cuisine: 'Chinese', rating: 4.0 },
  ]);
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

module.exports = app;
