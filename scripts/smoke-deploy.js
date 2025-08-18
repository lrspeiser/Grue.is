/*
  Smoke test after deploy: verify health, version, and a tiny world gen call.
*/
const fetch = global.fetch || require('node-fetch');

(async () => {
  const API_BASE = process.env.API_BASE || 'https://grue-is.onrender.com';
  const userId = `smoke-${Date.now().toString(36)}`;
  function log(title, obj) {
    console.log(`\n=== ${title} ===`);
    if (typeof obj === 'string') console.log(obj);
    else console.log(JSON.stringify(obj, null, 2));
  }
  try {
    const h = await fetch(`${API_BASE}/healthz`);
    log('healthz', { status: h.status, ok: h.ok, text: await h.text() });

    const v = await fetch(`${API_BASE}/version`);
    log('version', { status: v.status, ok: v.ok, text: await v.text() });

    const gen = await fetch(`${API_BASE}/v2/api/generate-world`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name: 'Explorer', theme: 'fantasy' })
    });
    const gtxt = await gen.text();
    let gj;
    try { gj = JSON.parse(gtxt); } catch { gj = { raw: gtxt }; }
    log('generate-world', { status: gen.status, ok: gen.ok, body: gj });

    if (!gen.ok) process.exit(2);
    process.exit(0);
  } catch (e) {
    log('smoke-error', { message: e.message, stack: e.stack });
    process.exit(3);
  }
})();

