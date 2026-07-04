import { readFileSync } from 'node:fs';
import postgres from 'postgres';
const file = process.argv[2];
if (!file) throw new Error('usage: apply-sql.mts <file.sql>');
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql.unsafe(readFileSync(file, 'utf8'));
console.log(`applied: ${file}`);
await sql.end();
