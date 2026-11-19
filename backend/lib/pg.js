/* Minimal PostgreSQL client (wire protocol v3) using only Node's built-in modules.
   Enough for this system: TLS with SNI (needed by Neon), password, MD5 and
   SCRAM-SHA-256 sign-in (with channel binding when TLS is used), and
   parameterised queries through the extended protocol, with results returned
   as plain objects. Parameters are sent as text and typed by the server. */
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

/** Parse postgres://user:pass@host:port/db?sslmode=require into options. */
function parseUrl(url) {
  const u = new URL(url);
  const q = Object.fromEntries(u.searchParams);
  const sslmode = q.sslmode || (/localhost|127\.0\.0\.1|^\[?::1\]?$/.test(u.hostname) ? 'disable' : 'require');
  return {
    host: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port || 5432),
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)) || decodeURIComponent(u.username),
    sslmode, channelBinding: q.channel_binding || 'prefer', applicationName: q.application_name || 'shaggar-pms',
    // verify-full checks the certificate and the host name; require only encrypts (as libpq does)
    rejectUnauthorized: sslmode === 'verify-full' || sslmode === 'verify-ca' || q.sslrootcert === 'system',
  };
}

const TEXT_TYPES = { 16: v => v === 't', 17: v => Buffer.from(v.slice(2), 'hex'), 20: Number, 21: Number, 23: Number, 26: Number, 700: Number, 701: Number, 1700: Number };

class PgError extends Error {
  constructor(fields) { super(fields.M || 'Database error'); this.code = fields.C; this.detail = fields.D; this.fields = fields; }
}

class Client {
  constructor(opts) { this.o = typeof opts === 'string' ? parseUrl(opts) : opts; this.buf = Buffer.alloc(0); this.waiters = []; this.queue = Promise.resolve(); this.closed = true; }

  /* ---------- connection ---------- */
  async connect() {
    const o = this.o;
    let sock = net.connect({ host: o.host, port: o.port });
    await new Promise((res, rej) => { sock.once('connect', res); sock.once('error', rej); });
    sock.setNoDelay(true);
    if (o.sslmode !== 'disable') {
      const req = Buffer.alloc(8); req.writeInt32BE(8, 0); req.writeInt32BE(80877103, 4); sock.write(req);
      const answer = await new Promise((res, rej) => { sock.once('data', d => res(String.fromCharCode(d[0]))); sock.once('error', rej); });
      if (answer === 'S') {
        sock = tls.connect({ socket: sock, servername: net.isIP(o.host) ? undefined : o.host, rejectUnauthorized: o.rejectUnauthorized });
        await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
      } else if (o.sslmode !== 'prefer' && o.sslmode !== 'allow') { sock.destroy(); throw new Error('The database server does not accept encrypted (TLS) connections.'); }
    }
    this.sock = sock; this.closed = false;
    sock.on('data', d => { this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d; this.drain(); });
    const onEnd = err => { if (this.closed) return; this.closed = true; const e = err || new Error('The database connection was closed.'); for (const w of this.waiters.splice(0)) w.reject(e); };
    sock.on('error', onEnd); sock.on('close', () => onEnd());
    // StartupMessage
    const params = ['user', o.user, 'database', o.database, 'application_name', o.applicationName, 'client_encoding', 'UTF8', 'DateStyle', 'ISO'];
    const body = Buffer.concat([...params.map(s => Buffer.from(s + '\0')), Buffer.from([0])]);
    const head = Buffer.alloc(8); head.writeInt32BE(8 + body.length, 0); head.writeInt32BE(196608, 4);
    sock.write(Buffer.concat([head, body]));
    await this.authenticate();
    return this;
  }

  async authenticate() {
    let scram = null;
    for (;;) {
      const m = await this.next();
      if (m.type === 'E') throw new PgError(parseFields(m.body));
      if (m.type === 'Z') return;
      if (m.type !== 'R') continue; // ParameterStatus, BackendKeyData, notices
      const code = m.body.readInt32BE(0);
      if (code === 0) continue;
      if (code === 3) this.send('p', cstr(this.o.password));
      else if (code === 5) {
        const salt = m.body.subarray(4, 8);
        const inner = md5(this.o.password + this.o.user);
        this.send('p', cstr('md5' + md5(Buffer.concat([Buffer.from(inner), salt]))));
      } else if (code === 10) {
        const mechs = m.body.subarray(4).toString().split('\0').filter(Boolean);
        const cert = this.sock.getPeerCertificate ? this.sock.getPeerCertificate() : null;
        const canBind = mechs.includes('SCRAM-SHA-256-PLUS') && cert && cert.raw && this.o.channelBinding !== 'disable';
        if (this.o.channelBinding === 'require' && !canBind) throw new Error('Channel binding was required but is not available on this connection.');
        if (!canBind && !mechs.includes('SCRAM-SHA-256')) throw new Error(`Unsupported sign-in methods: ${mechs.join(', ')}`);
        scram = { nonce: crypto.randomBytes(18).toString('base64'), plus: canBind, cbData: canBind ? certHash(cert.raw) : null };
        scram.gs2 = canBind ? 'p=tls-server-end-point,,' : 'n,,';
        scram.first = `n=*,r=${scram.nonce}`;
        const data = Buffer.from(scram.gs2 + scram.first);
        const mech = canBind ? 'SCRAM-SHA-256-PLUS' : 'SCRAM-SHA-256';
        const len = Buffer.alloc(4); len.writeInt32BE(data.length, 0);
        this.send('p', Buffer.concat([cstr(mech), len, data]));
      } else if (code === 11) {
        const server = m.body.subarray(4).toString();
        const a = Object.fromEntries(server.split(',').map(p => [p[0], p.slice(2)]));
        if (!a.r || !a.r.startsWith(scram.nonce)) throw new Error('The database server answered the sign-in incorrectly.');
        const salted = crypto.pbkdf2Sync(this.o.password.normalize('NFKC'), Buffer.from(a.s, 'base64'), Number(a.i), 32, 'sha256');
        const clientKey = hmac(salted, 'Client Key'), storedKey = crypto.createHash('sha256').update(clientKey).digest();
        const cbind = Buffer.concat([Buffer.from(scram.gs2), scram.cbData || Buffer.alloc(0)]).toString('base64');
        const finalNoProof = `c=${cbind},r=${a.r}`;
        const authMessage = `${scram.first},${server},${finalNoProof}`;
        const sig = hmac(storedKey, authMessage), proof = Buffer.from(clientKey.map((b, i) => b ^ sig[i]));
        scram.serverSig = hmac(hmac(salted, 'Server Key'), authMessage).toString('base64');
        this.send('p', Buffer.from(`${finalNoProof},p=${proof.toString('base64')}`));
      } else if (code === 12) {
        const v = Object.fromEntries(m.body.subarray(4).toString().split(',').map(p => [p[0], p.slice(2)])).v;
        if (v !== scram.serverSig) throw new Error('The database server could not prove its identity.');
      } else throw new Error(`Unsupported sign-in method (code ${code}).`);
    }
  }

  /* ---------- messages ---------- */
  send(type, body) { const h = Buffer.alloc(5); h.write(type, 0); h.writeInt32BE(body.length + 4, 1); this.sock.write(Buffer.concat([h, body])); }
  drain() {
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1); if (this.buf.length < len + 1) return;
      const msg = { type: String.fromCharCode(this.buf[0]), body: this.buf.subarray(5, len + 1) };
      this.buf = this.buf.subarray(len + 1);
      (this.inbox ||= []).push(msg);
    }
    while (this.inbox && this.inbox.length && this.waiters.length) this.waiters.shift().resolve(this.inbox.shift());
  }
  next() {
    if (this.inbox && this.inbox.length) return Promise.resolve(this.inbox.shift());
    if (this.closed) return Promise.reject(new Error('The database connection was closed.'));
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  /** Run one statement with $1..$n parameters. Resolves { rows, rowCount }. Calls are serialised. */
  query(sql, params = []) { const p = this.queue.then(() => this.run(sql, params)); this.queue = p.catch(() => {}); return p; }
  async run(sql, params) {
    if (this.closed) throw new Error('The database connection was closed.');
    const vals = params.map(v => (v == null ? null : Buffer.isBuffer(v) ? Buffer.from('\\x' + v.toString('hex')) : Buffer.from(typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v))));
    const bind = [cstr(''), cstr(''), i16(0), i16(vals.length)];
    for (const v of vals) { if (v == null) bind.push(i32(-1)); else bind.push(i32(v.length), v); }
    bind.push(i16(0));
    this.send('P', Buffer.concat([cstr(''), cstr(sql), i16(0)]));
    this.send('B', Buffer.concat(bind));
    this.send('D', Buffer.concat([Buffer.from('P'), cstr('')]));
    this.send('E', Buffer.concat([cstr(''), i32(0)]));
    this.send('S', Buffer.alloc(0));
    return this.collect();
  }
  /** Run several statements in one go (schema scripts). No parameters. */
  simple(sql) { const p = this.queue.then(async () => { this.send('Q', cstr(sql)); return this.collect(); }); this.queue = p.catch(() => {}); return p; }
  async collect() {
    let cols = null, rows = [], rowCount = 0, error = null;
    for (;;) {
      const m = await this.next();
      if (m.type === 'T') cols = parseRowDescription(m.body);
      else if (m.type === 'D') rows.push(parseDataRow(m.body, cols));
      else if (m.type === 'C') { const tag = m.body.toString().replace(/\0$/, ''); const n = Number(tag.split(' ').pop()); if (!isNaN(n)) rowCount = n; }
      else if (m.type === 'E') error = new PgError(parseFields(m.body));
      else if (m.type === 'Z') { if (error) throw error; return { rows, rowCount }; }
    }
  }
  async end() { if (this.closed) return; this.closed = true; try { this.send('X', Buffer.alloc(0)); } catch {} this.sock.end(); }
}

/* ---------- helpers ---------- */
const cstr = s => Buffer.from(s + '\0');
const i16 = n => { const b = Buffer.alloc(2); b.writeInt16BE(n, 0); return b; };
const i32 = n => { const b = Buffer.alloc(4); b.writeInt32BE(n, 0); return b; };
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
function parseFields(body) { const f = {}; let i = 0; while (i < body.length && body[i] !== 0) { const k = String.fromCharCode(body[i]); const end = body.indexOf(0, i + 1); f[k] = body.subarray(i + 1, end).toString(); i = end + 1; } return f; }
function parseRowDescription(body) {
  const n = body.readInt16BE(0); const cols = []; let i = 2;
  for (let c = 0; c < n; c++) { const end = body.indexOf(0, i); const name = body.subarray(i, end).toString(); i = end + 1; const oid = body.readInt32BE(i + 6); i += 18; cols.push({ name, parse: TEXT_TYPES[oid] }); }
  return cols;
}
function parseDataRow(body, cols) {
  const n = body.readInt16BE(0); const row = {}; let i = 2;
  for (let c = 0; c < n; c++) {
    const len = body.readInt32BE(i); i += 4;
    if (len === -1) { row[cols[c].name] = null; continue; }
    const s = body.subarray(i, i + len).toString(); i += len;
    row[cols[c].name] = cols[c].parse ? cols[c].parse(s) : s;
  }
  return row;
}
/* tls-server-end-point channel binding (RFC 5929): hash of the server certificate,
   with the certificate's own signature hash (SHA-256 when that is MD5 or SHA-1). */
function certHash(der) {
  const oid = sigAlgOid(der) || '';
  const algo = /^(1\.2\.840\.113549\.1\.1\.12|1\.2\.840\.10045\.4\.3\.3)$/.test(oid) ? 'sha384' : /^(1\.2\.840\.113549\.1\.1\.13|1\.2\.840\.10045\.4\.3\.4)$/.test(oid) ? 'sha512' : 'sha256';
  return crypto.createHash(algo).update(der).digest();
}
function sigAlgOid(der) {
  try {
    const read = i => { const tag = der[i]; let len = der[i + 1], off = 2; if (len & 0x80) { const k = len & 0x7f; len = 0; for (let j = 0; j < k; j++) len = len * 256 + der[i + 2 + j]; off += k; } return { tag, start: i + off, end: i + off + len }; };
    const cert = read(0), tbs = read(cert.start), alg = read(tbs.end), oid = read(alg.start);
    const b = der.subarray(oid.start, oid.end); const parts = [Math.floor(b[0] / 40), b[0] % 40]; let v = 0;
    for (const x of b.subarray(1)) { v = v * 128 + (x & 0x7f); if (!(x & 0x80)) { parts.push(v); v = 0; } }
    return parts.join('.');
  } catch { return null; }
}

module.exports = { Client, parseUrl, PgError };
