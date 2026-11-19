/* Synchronous access to PostgreSQL.
   The rest of the backend was written for SQLite, whose calls return at once.
   This keeps that model: each query is handed to a worker thread that owns the
   connection, and the main thread waits for the answer (Atomics.wait). Queries
   therefore run one at a time, in order, exactly as they did with SQLite, and
   transactions need no special handling.
   Each query costs one round trip to the database, so run the server in the
   same region as the database (Render Frankfurt with Neon Frankfurt). */
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const path = require('node:path');

class PgSync {
  constructor(url, { timeoutMs = 30000 } = {}) {
    this.signal = new SharedArrayBuffer(4); this.flag = new Int32Array(this.signal); this.timeoutMs = timeoutMs;
    const { port1, port2 } = new MessageChannel(); this.port = port1;
    this.worker = new Worker(path.join(__dirname, 'pg-worker.js'), { workerData: { url, port: port2, signal: this.signal }, transferList: [port2] });
    this.worker.unref(); this.port.unref();
  }
  call(msg) {
    Atomics.store(this.flag, 0, 0);
    this.port.postMessage(msg);
    const r = Atomics.wait(this.flag, 0, 0, this.timeoutMs);
    if (r === 'timed-out') throw new Error(`The database did not answer within ${Math.round(this.timeoutMs / 1000)} seconds.`);
    const m = receiveMessageOnPort(this.port);
    if (!m) throw new Error('No answer from the database worker.');
    const a = m.message;
    if (!a.ok) { const e = new Error(a.message); e.code = a.code; e.detail = a.detail; throw e; }
    return a;
  }
  query(sql, params = []) { return this.call({ sql, params }); }
  exec(sql) { return this.call({ sql, simple: true }); }
  close() { try { this.port.close(); } catch {} this.worker.terminate(); }
}
module.exports = { PgSync };
