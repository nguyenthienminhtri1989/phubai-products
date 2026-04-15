const { Client } = require('pg');
require('dotenv').config({ path: '/sessions/zealous-happy-ramanujan/mnt/PHUBAI-ERP/.env' });

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  await client.query('ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS efficiency DOUBLE PRECISION');
  const r = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='production_logs' AND column_name='efficiency'");
  console.log('Column added:', r.rows);

  // Đánh dấu migration đã chạy trong _prisma_migrations
  const migrationName = '20260415082959_add_efficiency_to_production_logs';
  await client.query(`
    INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (gen_random_uuid(), 'manual', NOW(), $1, NULL, NULL, NOW(), 1)
    ON CONFLICT (migration_name) DO NOTHING
  `, [migrationName]);
  console.log('Migration recorded in _prisma_migrations');
  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
