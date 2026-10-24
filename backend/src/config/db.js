import mysql from 'mysql2/promise';
import { env } from './env.js';

/** @type {import('mysql2/promise').Pool | null} */
let pool = null;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      timezone: 'Z',
      ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function withTransaction(fn) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
