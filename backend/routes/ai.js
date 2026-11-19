/* AI assistant endpoints. */
const { route, fail, rateLimit } = require('../lib/http');
const A = require('../lib/access');
const audit = require('../lib/audit');
const ai = require('../services/ai');

route('GET', '/api/ai/status', ctx => { A.requirePerm(ctx.user, 'ai'); return { provider: ai.provider() }; });
route('POST', '/api/ai/chat', async ctx => {
  A.requirePerm(ctx.user, 'ai');
  if (!rateLimit('ai:' + ctx.user.id, 30, 60 * 60e3)) fail(429, 'You have reached the assistant limit of 30 questions per hour. Try again later.');
  const messages = (ctx.body.messages || []).slice(-12).filter(m => m && m.content);
  if (!messages.length || messages[messages.length - 1].role !== 'user') fail(422, 'Send a question.');
  audit.log(ctx, 'AI assistant query', 'AI', ctx.user.id, String(messages[messages.length - 1].content).slice(0, 160));
  try { return await ai.chat(ctx.user, messages, ctx.body.lang); }
  catch (e) { fail(502, `The AI service could not answer: ${e.message}`); }
});
/** When the browser uses its own model connection (inside claude.ai), it still records the question. */
route('POST', '/api/ai/log', ctx => { A.requirePerm(ctx.user, 'ai'); audit.log(ctx, 'AI assistant query', 'AI', ctx.user.id, String(ctx.body.question || '').slice(0, 160)); return { ok: true }; });
