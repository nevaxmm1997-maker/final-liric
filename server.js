// server.js — wrapper for Render/Fly/Heroku style hosting
// Binds to 0.0.0.0 and uses process.env.PORT instead of a fixed localhost:8999.
// Drop this file in the ROOT of your repo and set "start": "node server.js" in package.json.

const http = require('http');

function tryRequire(paths) {
  for (const p of paths) {
    try {
      const mod = require(p);
      console.log(`[server.js] Loaded module: ${p}`);
      return mod;
    } catch (e) {
      // silently try next
    }
  }
  return null;
}

// Try common entry modules that export an Express app or a factory returning an app
const candidates = [
  './app',
  './src/app',
  './index',
  './src/index',
  './main',
  './src/main',
];

let mod = tryRequire(candidates);
if (!mod) {
  console.error('[server.js] Could not find an app module. Edit "candidates" to point to the file that exports your Express app.');
  process.exit(1);
}

// Normalize: module could export the app directly, { app }, or a function returning an app (possibly async)
async function resolveApp(m) {
  if (m && typeof m.use === 'function') return m;          // express() exported
  if (m && typeof m.app === 'object' && typeof m.app.use === 'function') return m.app; // { app }
  if (typeof m === 'function') {
    const maybe = m();
    if (maybe && typeof maybe.then === 'function') {
      return await maybe; // async factory
    }
    if (maybe && typeof maybe.use === 'function') return maybe; // sync factory
  }
  throw new Error('Module did not export an Express app or app factory.');
}

(async () => {
  try {
    const app = await resolveApp(mod);
    const HOST = process.env.HOST || '0.0.0.0';
    const PORT = Number(process.env.PORT) || 8999;
    http.createServer(app).listen(PORT, HOST, () => {
      console.log(`[server.js] Listening on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('[server.js] Failed to resolve/start app:', err);
    process.exit(1);
  }
})();
