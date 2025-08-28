// server.js — tolerant wrapper for Render
// Ưu tiên chạy dist/index (bản build sẵn). Nếu module tự .listen() thì coi như OK.
// Nếu module export Express app => chúng ta sẽ tạo server và bind 0.0.0.0:PORT.

const http = require('http');

const candidates = [
  './dist/index',     // ƯU TIÊN dist
  './app',
  './src/app',
  './index',
  './src/index',
  './main',
  './src/main',
];

function safeRequire(p) {
  try {
    const m = require(p);
    console.log(`[server.js] Loaded module: ${p}`);
    return { ok: true, mod: m };
  } catch (e) {
    return { ok: false, err: e };
  }
}

function isExpressApp(m) {
  return m && typeof m.use === 'function' && typeof m.listen === 'function';
}

function hasAppProp(m) {
  return m && typeof m.app === 'object' && typeof m.app.use === 'function';
}

(async () => {
  const HOST = process.env.HOST || '0.0.0.0';
  const PORT = Number(process.env.PORT) || 8999;

  for (const path of candidates) {
    const res = safeRequire(path);
    if (!res.ok) continue;

    let mod = res.mod;

    // TH1: module export trực tiếp express() app
    if (isExpressApp(mod)) {
      const app = mod;
      http.createServer(app).listen(PORT, HOST, () => {
        console.log(`[server.js] (app) Listening on http://${HOST}:${PORT}`);
      });
      return;
    }

    // TH2: module export { app }
    if (hasAppProp(mod)) {
      const app = mod.app;
      http.createServer(app).listen(PORT, HOST, () => {
        console.log(`[server.js] ({app}) Listening on http://${HOST}:${PORT}`);
      });
      return;
    }

    // TH3: module export function trả về app (sync/async)
    if (typeof mod === 'function') {
      try {
        const maybe = mod();
        if (maybe && typeof maybe.then === 'function') {
          mod = await maybe;
        } else {
          mod = maybe;
        }
        if (isExpressApp(mod)) {
          http.createServer(mod).listen(PORT, HOST, () => {
            console.log(`[server.js] (factory) Listening on http://${HOST}:${PORT}`);
          });
          return;
        }
      } catch (e) {
        // bỏ qua, thử path tiếp theo
      }
    }

    // TH4: Module tự .listen() bên trong (không export app) — thường là dist/index
    // Nếu require() không ném lỗi và process chưa thoát thì coi như app đã tự start.
    console.log(`[server.js] Module "${path}" did not export an app; assuming it started its own server.`);
    // Giữ process sống bằng 1 server no-op nếu cần (phòng khi module chạy detached)
    const noop = http.createServer((_, res) => res.end('OK'));
    noop.listen(0, '127.0.0.1', () => {
      console.log('[server.js] Keeping process alive (noop server).');
    });
    return;
  }

  console.error('[server.js] Could not find any suitable module (tried dist/index, app, index, ...).');
  process.exit(1);
})();
