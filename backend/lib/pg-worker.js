/* Worker thread that owns the PostgreSQL connection for pgsync.js.
   It runs one request at a time, posts the answer, then wakes the main thread. */
const { workerData } = require('node:worker_threads');
const { Client } = require('./pg');

const { url, port, signal } = workerData;
const flag = new Int32Array(signal);
let client = null, inTx = false;

async function conn() {
  if (client && !client.closed) return client;
  if (inTx) throw new Error('The database connection was lost during a transaction.');
  client = await new Client(url).connect();
  return client;
}
function reply(msg) { port.postMessage(msg); Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); }

port.on('message', async ({ sql, params, simple }) => {
  try {
    let r;
    for (let attempt = 0; ; attempt++) {
      try { const c = await conn(); r = simple ? await c.simple(sql) : await c.query(sql, params); break; }
      catch (e) {
        // A connection closed while idle (Neon suspends after a few idle minutes): reconnect once.
        const dropped = !e.code && /closed|ECONNRESET|EPIPE|socket/i.test(e.message);
        if (dropped && attempt === 0 && !inTx) { client = null; continue; }
        throw e;
      }
    }
    if (/^\s*BEGIN/i.test(sql)) inTx = true; else if (/^\s*(COMMIT|ROLLBACK)/i.test(sql)) inTx = false;
    reply({ ok: true, rows: r.rows, rowCount: r.rowCount });
  } catch (e) {
    if (/^\s*(COMMIT|ROLLBACK)/i.test(sql)) inTx = false;
    reply({ ok: false, message: e.message, code: e.code || null, detail: e.detail || null });
  }
});
port.on('close', () => { if (client) client.end(); });
