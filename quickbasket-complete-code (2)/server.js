const app = require('./app');
const { initDb, pool } = require('./db');
const PORT = Number(process.env.PORT || 3000);

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`QuickBasket listening on ${PORT}`));
  })
  .catch(async (error) => {
    console.error('Database initialization failed:', error);
    await pool.end();
    process.exit(1);
  });
