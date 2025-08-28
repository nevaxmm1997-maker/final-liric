// server.js — robust entry for Render/Heroku/Fly
// - Tries package.json "main"
// - Tries common paths (dist/index, dist/server, index, server, src/*)
// - Supports both CJS(require) and ESM(import)
// - If module exports an Express app (or {app} / factory), we bind 0.0.0.0:PORT

const fs = require('fs');
const path = require('path');
const http = require('http');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 8999;

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

function readPkgMain() {
  const p = path.resolve(process.cwd(), 'package.json');
  if (!exists(p)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    return pkg.main ? './' + pkg.main.replace(/^.\//, '') : null;
  } catch { return null; }
}

const candidates = [
  readPkgMain(),
  './dist/index.js', './dist/server.js', './dist/app.js',
  './index.js', './server.js', './app.js',
  './src/index.js', './src/server.js', './src/app.js',
  './dist/index.mjs', './dist/server.mjs',
  './index.mjs', './server.mjs', './src/index.mjs', './src/server.mjs'
].filter(Boolean);

function isExpressApp(m) {
  return m && typeof m.use === 'function' && typeof m.listen === 'function';
}
function hasAppProp(m) {
  return m && typeof m.app === 'object' && typeof m.app.use === 'function';
}

async function tryLoad(modPath) {
  // 1) try CJS
  try {
    const mod = require(modPath);
    return { ok: true, mod, via: 'require', modPath };
  } catch {}
  // 2) try ESM
  try {
    const resolved = require('url').pathToFileURL(path.resolve(modPath)).href;
    const mod = await import(resolved);
    // ESM default export?
    return { ok: true, mod: mod.default ?? mod, via: 'import', modPath };
  } catch {}
  return { ok: false, mod: null, via: null, modPath };
}

(async () => {
  for (const p of candidates) {
    const res = await tryLoad(p);
    if (!res.ok) continue;

    let m = res.mod;
    console.log(`[server.js] Loaded ${p} via ${res.via}`);

    // app trực tiếp
    if (isExpressApp(m)) {
      http.createServer(m).listen(PORT, HOST, () =>
        console.log(`[server.js] (app) Listening on http://${HOST}:${PORT}`)
      );
      return;
    }
    // { app }
    if (hasAppProp(m)) {
      http.createServer(m.app).listen(PORT, HOST, () =>
        console.log(`[server.js] ({app}) Listening on http://${HOST}:${PORT}`)
      );
      return;
    }
    // factory trả về app (sync/async)
    if (typeof m === 'function') {
      try {
        const maybe = m();
        const app = (maybe && typeof maybe.then === 'function') ? await maybe : maybe;
        if (isExpressApp(app)) {
          http.createServer(app).listen(PORT, HOST, () =>
            console.log(`[server.js] (factory) Listening on http://${HOST}:${PORT}`)
          );
          return;
        }
      } catch {}
    }

    // module có thể tự .listen() bên trong => keep-alive nhẹ
    console.log(`[server.js] Module "${p}" did not export an app; assuming it started its own server.`);
    const noop = http.createServer((_, r) => r.end('OK'));
    noop.listen(0, '127.0.0.1', () => console.log('[server.js] Keep-alive server started.'));
    return;
  }

  // Không tìm thấy file phù hợp — in directory để bạn kiểm tra nhanh
  console.error('[server.js] No suitable module found. CWD listing:');
  try { console.error(fs.readdirSync(process.cwd(), { withFileTypes: true }).map(d=> (d.isDirectory()? '[DIR] ':'      ') + d.name).join('\n')); } catch {}
  process.exit(1);
})();
