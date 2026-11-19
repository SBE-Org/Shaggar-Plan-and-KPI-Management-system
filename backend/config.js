/* Runtime configuration from environment variables (see .env.example). */
const path = require('node:path');
const fs = require('node:fs');

// Minimal .env loader (no dependency): KEY=value lines, # comments.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const root = path.join(__dirname, '..');
const bool = (v, d) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

module.exports = {
  root,
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  // DEMO_MODE shows the one-time sign-in code on screen and lists demo accounts on the sign-in page.
  // It must be false in production.
  demoMode: bool(process.env.DEMO_MODE, true),
  dbFile: process.env.DB_FILE || path.join(root, 'storage', 'shaggar-pms.db'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(root, 'storage', 'uploads'),
  backupsDir: process.env.BACKUPS_DIR || path.join(root, 'storage', 'backups'),
  frontendDir: path.join(root, 'frontend'),
  sharedDir: path.join(root, 'shared'),
  // Set to true when served behind HTTPS (adds Secure cookies and HSTS).
  secureCookies: bool(process.env.SECURE_COOKIES, false),
  sessionCookie: 'spms_session',
  passwordIterations: Number(process.env.PASSWORD_ITERATIONS || 120000),
  maxBodyBytes: Number(process.env.MAX_BODY_MB || 15) * 1024 * 1024,
  // Notification gateways (used only after approval in Notifications → Channels)
  smsGatewayUrl: process.env.SMS_GATEWAY_URL || '',
  smsGatewayToken: process.env.SMS_GATEWAY_TOKEN || '',
  emailApiUrl: process.env.EMAIL_API_URL || '',
  emailApiToken: process.env.EMAIL_API_TOKEN || '',
  // Email service used for sign-in codes and notifications (HTTPS APIs; the first one set is used)
  brevoApiKey: process.env.BREVO_API_KEY || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  emailFromName: process.env.EMAIL_FROM_NAME || '',
  // AI assistant providers (optional; first one configured is used)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-sonnet-5-5',
  ollamaUrl: process.env.OLLAMA_URL || '',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1',
  // sign-in attempts allowed per network address in 15 minutes
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT || 30),
  schedulerMinutes: Number(process.env.SCHEDULER_MINUTES || 10),
};
