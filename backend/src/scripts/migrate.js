import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Strip CREATE DATABASE / USE so hosted MySQL (Aiven free) that only
 * exposes DB_NAME (e.g. defaultdb) still accepts schema.sql.
 */
function prepareSql(raw, database) {
  return raw
    .replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+\w+[^;]*;/gi, '')
    .replace(/CREATE\s+DATABASE\s+\w+[^;]*;/gi, '')
    .replace(/USE\s+\w+\s*;/gi, `USE \`${database}\`;`)
    .trim();
}

async function migrate() {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const sql = prepareSql(raw, env.db.database);

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
    console.log(`Running schema.sql against ${env.db.database}...`);
    await connection.query(sql);
    console.log('Migration complete.');
  } finally {
    await connection.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
