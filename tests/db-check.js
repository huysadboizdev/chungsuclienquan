require('dotenv').config();
const { initDatabase, db } = require('../src/database');

async function test() {
  console.log('Testing Database initialization...');
  await initDatabase();

  const packages = await db.all('SELECT * FROM packages');
  console.log('Seed packages count:', packages.length);
  if (packages.length < 3) {
    throw new Error('Expected at least 3 packages');
  }

  const settings = await db.all('SELECT * FROM settings');
  console.log('Settings count:', settings.length);
  if (settings.length < 5) {
    throw new Error('Expected at least 5 settings');
  }

  console.log('✅ Database check PASSED!');
  process.exit(0);
}

test().catch((err) => {
  console.error('❌ Database check FAILED:', err);
  process.exit(1);
});
