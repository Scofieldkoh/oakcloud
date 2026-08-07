/**
 * Confirms previously extracted BizFile data through the production
 * confirm route. Reads the saved extraction files and posts the payload.
 *
 * Usage: node tmp/scripts/run-bizfile-confirm.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { SignJWT } = require('jose');

const BASE_URL = process.env.BIZFILE_BASE_URL || 'http://localhost:3000';
const OUT_DIR = path.join(process.cwd(), 'tmp', 'pdfs');
const SLUGS = ['KGST', 'LaymanCoffee'];

function loadEnv(file) {
  const env = {};
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[m[1]] = value;
  }
  return env;
}

async function main() {
  const env = loadEnv(path.join(process.cwd(), '.env'));
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  const admin = await client.query(
    `SELECT id, email, "tenantId" FROM users WHERE email = $1 AND "isActive" = true LIMIT 1`,
    ['admin@oaktreesolutions.com.sg']
  );
  const user = admin.rows[0];
  const tenant = await client.query(
    `SELECT id FROM tenants WHERE status = 'ACTIVE' AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`
  );
  const workspace = tenant.rows[0];
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    tenantId: user.tenantId || workspace.id,
    workspaceId: user.tenantId || workspace.id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(env.JWT_SECRET));
  const cookie = `auth-token=${token}`;

  for (const slug of SLUGS) {
    const saved = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${slug}.extracted.json`), 'utf8'));
    const documentId = saved.documentId;
    const uen = saved.extractedData.entityDetails.uen;
    console.log(`\n[${slug}] Confirming ${uen} (document ${documentId})...`);

    const res = await fetch(`${BASE_URL}/api/documents/${documentId}/confirm`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractedData: saved.extractedData }),
    });
    const body = await res.json();
    if (!res.ok) {
      console.error(`[${slug}] Confirm failed (${res.status}):`, body);
      continue;
    }
    console.log(`[${slug}] Confirmed: companyId=${body.companyId} created=${body.created}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
