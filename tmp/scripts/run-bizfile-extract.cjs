/**
 * Drives the production BizFile upload + extraction routes with a signed
 * session cookie. Saves each extraction result for the accuracy diff.
 *
 * Usage: node tmp/scripts/run-bizfile-extract.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { SignJWT } = require('jose');

const BASE_URL = process.env.BIZFILE_BASE_URL || 'http://localhost:3000';
const PDF_DIR = 'C:/Users/Scotfield/OneDrive/Desktop/ACRA Bizfile';
const OUT_DIR = path.join(process.cwd(), 'tmp', 'pdfs');

const FILES = [
  { slug: 'KGST', fileName: 'KGST.pdf' },
  { slug: 'LaymanCoffee', fileName: 'Layman Coffee.pdf' },
];

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

async function signToken(secret, payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(secret));
}

async function main() {
  const env = loadEnv(path.join(process.cwd(), '.env'));
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  const admin = await client.query(
    `SELECT id, email, "tenantId" FROM users WHERE email = $1 AND "isActive" = true LIMIT 1`,
    ['admin@oaktreesolutions.com.sg']
  );
  if (admin.rowCount === 0) throw new Error('Admin user not found');
  const user = admin.rows[0];

  const tenant = await client.query(
    `SELECT id, name FROM tenants WHERE status = 'ACTIVE' AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`
  );
  if (tenant.rowCount === 0) throw new Error('No active tenant found');
  const workspace = tenant.rows[0];

  const token = await signToken(env.JWT_SECRET, {
    userId: user.id,
    email: user.email,
    tenantId: user.tenantId || workspace.id,
    workspaceId: user.tenantId || workspace.id,
  });
  const cookie = `auth-token=${token}`;
  console.log(`Signed in as ${user.email} -> workspace ${workspace.name} (${workspace.id})`);

  for (const { slug, fileName } of FILES) {
    const filePath = path.join(PDF_DIR, fileName);
    const buf = fs.readFileSync(filePath);
    const isPdf = buf.subarray(0, 4).toString('ascii') === '%PDF';
    const mime = isPdf ? 'application/pdf' : 'application/octet-stream';
    const ext = isPdf ? 'pdf' : fileName.split('.').pop();

    // 1) Upload through the real route
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), fileName);
    form.append('documentType', 'BIZFILE');
    form.append('tenantId', workspace.id);

    console.log(`\n[${slug}] Uploading ${fileName} (${(buf.length / 1024).toFixed(1)} KB)...`);
    const uploadRes = await fetch(`${BASE_URL}/api/documents/upload`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    });
    const uploadBody = await uploadRes.json();
    if (!uploadRes.ok) {
      console.error(`[${slug}] Upload failed (${uploadRes.status}):`, uploadBody);
      continue;
    }
    const documentId = uploadBody.documentId;
    console.log(`[${slug}] Uploaded document ${documentId}`);

    // 2) Extract through the real route
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    console.log(`[${slug}] Extracting via AI vision (may take a minute)...`);
    const extractRes = await fetch(`${BASE_URL}/api/documents/${documentId}/extract`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const extractBody = await extractRes.json();
    if (!extractRes.ok) {
      console.error(`[${slug}] Extract failed (${extractRes.status}):`, extractBody);
      continue;
    }

    const outFile = path.join(OUT_DIR, `${slug}.extracted.json`);
    fs.writeFileSync(outFile, JSON.stringify({
      documentId,
      extractedData: extractBody.extractedData,
      aiMetadata: extractBody.aiMetadata,
      conflict: extractBody.conflict,
    }, null, 2));
    console.log(`[${slug}] Extraction saved to ${outFile}`);
    console.log(`[${slug}] Model: ${extractBody.aiMetadata?.modelUsed} (${extractBody.aiMetadata?.providerUsed})`);
    console.log(`[${slug}] Conflict: ${JSON.stringify(extractBody.conflict)}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
