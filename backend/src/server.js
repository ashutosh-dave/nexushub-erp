import app from './app.js';
import { env } from './config/env.js';
import { getPool } from './config/db.js';

async function start() {
  try {
    await getPool().query('SELECT 1');
    console.log('MySQL pool ready');
  } catch (err) {
    console.warn('MySQL not reachable yet:', err.message);
  }

  app.listen(env.port, () => {
    console.log(`NexusHub API listening on :${env.port}`);
  });
}

start();
