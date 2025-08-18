/*
  Smoke test after deploy: verify health, version, and a tiny world gen call.
*/
const fetch = global.fetch || require('node-fetch');

(async () => {
  const args = process.argv.slice(2);
  const getArg = (name, def) => {
    const idx = args.findIndex(a => a === `--${name}`);
    if (idx !== -1) return args[idx + 1];
    return process.env[name.toUpperCase()] || def;
  };

  const API_BASE = getArg('base', process.env.API_BASE || 'https://grue-is.onrender.com');
  const retries = parseInt(getArg('retries', '2'), 10);
  const timeoutSec = parseInt(getArg('timeout', '45'), 10);
  const verbose = args.includes('--verbose');

  const userId = `smoke-${Date.now().toString(36)}`;
  function log(title, obj) {
    console.log(`\n=== ${title} ===`);
    if (typeof obj === 'string') console.log(obj);
    else console.log(JSON.stringify(obj, null, 2));
  }

  async function withTimeout(p, sec, label) {
    let timer;
    const to = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`Timeout after ${sec}s: ${label}`)), sec * 1000);
    });
    try {
      const res = await Promise.race([p, to]);
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  try {
    const h = await withTimeout(fetch(`${API_BASE}/healthz`), timeoutSec, 'healthz');
    log('healthz', { status: h.status, ok: h.ok, text: await h.text() });

    const v = await withTimeout(fetch(`${API_BASE}/version`), timeoutSec, 'version');
    log('version', { status: v.status, ok: v.ok, text: await v.text() });

    let attempt = 0;
    let gen, gtxt, gj;
    let lastErr;
    while (attempt <= retries) {
      try {
        if (attempt > 0 && verbose) console.log(`Retrying generate-world (attempt ${attempt}/${retries})...`);
        gen = await withTimeout(
          fetch(`${API_BASE}/v2/api/generate-world`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, name: 'Explorer', theme: 'fantasy' })
          }),
          timeoutSec,
          'generate-world'
        );
        gtxt = await gen.text();
        try { gj = JSON.parse(gtxt); } catch { gj = { raw: gtxt }; }
        log('generate-world', { status: gen.status, ok: gen.ok, body: gj });
        if (!gen.ok) throw new Error(`generate-world failed with status ${gen.status}`);
        break; // success
      } catch (e) {
        lastErr = e;
        if (attempt === retries) {
          throw e;
        }
        // brief backoff
        await new Promise(r => setTimeout(r, Math.min(5000, 1000 * (attempt + 1))));
        attempt++;
      }
    }

    process.exit(0);
  } catch (e) {
    log('smoke-error', { message: e.message, stack: e.stack });
    process.exit(3);
  }
})();

