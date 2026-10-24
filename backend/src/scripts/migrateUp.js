import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Runs additive SQL files in database/migrations/ (CREATE IF NOT EXISTS / ALTER).
 * Safe for hosted MySQL (Aiven) — does not drop tables.
 */
async function migrateUp() {
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory; nothing to do.');
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (!files.length) {
    console.log('No migration files found.');
    return;
  }

  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
    ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim();
      if (!sql) continue;
      console.log(`Applying ${file}...`);
      try {
        await connection.query(sql);
        console.log(`  OK: ${file}`);
      } catch (err) {
        // Idempotent: duplicate FK / table already exists with different def
        if (err.code === 'ER_FK_DUP_NAME' || err.code === 'ER_DUP_KEYNAME') {
          console.log(`  Skip (already applied): ${file} (${err.code})`);
          continue;
        }
        throw err;
      }
    }
    console.log('Additive migrations complete.');
  } finally {
    await connection.end();
  }
}

migrateUp().catch((err) => {
  console.error(err);
  process.exit(1);
});
