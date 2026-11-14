// All route handlers for the Sparky API

import { Router } from 'itty-router';
import { CONFIG, ERRORS, getCorsHeaders } from './config';
import type {
  ChatRequest, ChatResponse, FeedbackRequest, HealthResponse,
  IntroQuery, TipQuery, SessionData
} from './types';
import {
  getSession, saveSession, addMessageToSession, incrementSessionCount,
  checkRateLimit, logChat, logFeedback, generateUUID, isValidUUID
} from './kv';
import { checkDistress, getDistressResponse, checkBlocked, getBlockedResponse, redactPII, checkWorryRule, getWorryResponse } from './safety';
import { offlineAnswer } from './offline';
import { buildSystemPrompt, buildContextBlock, buildGeminiHistory, callGemini, mapLLMOutputToResponse } from './gemini';

// Load schema at module level (for /schema endpoint)
let cachedSchema: any = null;
async function loadSchema(): Promise<any> {
  if (cachedSchema) return cachedSchema;
  try {
    // In Cloudflare Workers, we can't use import.meta.url for relative imports
    // Instead, we'll inline the schema or fetch it
    const response = await fetch('https://raw.githubusercontent.com/sparkforever-dev/spark/main/sparky.schema.json');
    if (response.ok) {
      cachedSchema = await response.json();
      return cachedSchema;
    }
  } catch {}
  // Fallback: return minimal schema structure
  return { $defs: {}, api: { llm: { model: 'gemini-3.1-flash-lite' } } };
}

// ============ Validation ============
function validateChatRequest(body: any): { valid: boolean; error?: string; request?: ChatRequest } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: ERRORS.BAD_JSON };
  }

  // Check unknown top-level fields
  const allowedFields = ['session_id', 'message', 'audience', 'language', 'context'];
  const unknownFields = Object.keys(body).filter(k => !allowedFields.includes(k));
  if (unknownFields.length > 0) {
    return { valid: false, error: ERRORS.UNKNOWN_FIELDS(unknownFields) };
  }

  // Required fields
  for (const field of ['session_id', 'message', 'audience', 'context']) {
    if (!body[field]) {
      return { valid: false, error: ERRORS.MISSING_FIELD(field) };
    }
  }

  // session_id UUID
  if (!isValidUUID(body.session_id)) {
    return { valid: false, error: ERRORS.INVALID_UUID };
  }

  // message
  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return { valid: false, error: ERRORS.EMPTY_MESSAGE };
  }
  if (body.message.length > CONFIG.MAX_INPUT_CHARS) {
    return { valid: false, error: ERRORS.MESSAGE_TOO_LONG };
  }

  // audience
  if (!CONFIG.AUDIENCES.includes(body.audience)) {
    return { valid: false, error: ERRORS.INVALID_AUDIENCE };
  }

  // context
  const ctx = body.context;
  if (!ctx || typeof ctx !== 'object') {
    return { valid: false, error: ERRORS.MISSING_FIELD('context') };
  }
  if (!CONFIG.PAGES.includes(ctx.page)) {
    return { valid: false, error: ERRORS.INVALID_PAGE };
  }
  if (ctx.layer && !CONFIG.LAYERS.includes(ctx.layer)) {
    return { valid: false, error: ERRORS.INVALID_LAYER };
  }
  if (ctx.lat !== undefined && (typeof ctx.lat !== 'number' || ctx.lat < -90 || ctx.lat > 90)) {
    return { valid: false, error: ERRORS.INVALID_LAT };
  }
  if (ctx.lon !== undefined && (typeof ctx.lon !== 'number' || ctx.lon < -180 || ctx.lon > 180)) {
    return { valid: false, error: ERRORS.INVALID_LON };
  }
  if (ctx.selected_value !== undefined && typeof ctx.selected_value !== 'string') {
    return { valid: false, error: ERRORS.INVALID_SELECTED_VALUE };
  }
  if (ctx.is_playing !== undefined && typeof ctx.is_playing !== 'boolean') {
    return { valid: false, error: ERRORS.INVALID_BOOLEAN('is_playing') };
  }
  if (ctx.reduced_motion !== undefined && typeof ctx.reduced_motion !== 'boolean') {
    return { valid: false, error: ERRORS.INVALID_BOOLEAN('reduced_motion') };
  }

  // language (optional)
  if (body.language !== undefined && typeof body.language !== 'string') {
    return { valid: false, error: 'language must be a string.' };
  }

  return { valid: true, request: body as ChatRequest };
}

function validateFeedbackRequest(body: any): { valid: boolean; error?: string; request?: FeedbackRequest } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: ERRORS.BAD_JSON };
  }

  if (!body.session_id || !isValidUUID(body.session_id)) {
    return { valid: false, error: ERRORS.INVALID_UUID };
  }

  if (!body.rating || !CONFIG.RATINGS.includes(body.rating)) {
    return { valid: false, error: ERRORS.INVALID_RATING };
  }

  if (body.comment !== undefined && (typeof body.comment !== 'string' || body.comment.length > 300)) {
    return { valid: false, error: ERRORS.INVALID_COMMENT };
  }

  return { valid: true, request: body as FeedbackRequest };
}

// ============ CORS Helper ============
function corsResponse(request: Request, body: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...getCorsHeaders(request),
      ...headers
    }
  });
}

// ============ Handlers ============

// GET /api/sparky/health
export async function handleHealth(request: Request, env: any): Promise<Response> {
  const hasApiKey = !!env.GEMINI_API_KEY;
  let offlineReason: string | null = null;

  if (!hasApiKey) {
    offlineReason = 'no Anthropic credentials (GEMINI_API_KEY not set)';
  }

  const response: HealthResponse = {
    ok: true,
    engine: hasApiKey ? 'gemini' : 'offline',
    model: CONFIG.LLM_MODEL,
    offline_reason: offlineReason,
    schema_version: '1.0.0'
  };

  return corsResponse(request, response);
}

// GET /api/sparky/intro
export async function handleIntro(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const audience = (url.searchParams.get('audience') as 'kids' | 'adult') || 'adult';
  const returning = url.searchParams.get('returning') === 'true';
  const reducedMotion = url.searchParams.get('reduced_motion') === 'true';

  const introConfig = CONFIG.INTRO[audience][returning ? 'returning' : 'first_visit'];

  const response: ChatResponse = {
    reply: introConfig.reply,
    speak: true,
    audience,
    animation: {
      state: introConfig.animation.state as any,
      then: introConfig.animation.then as any
    },
    actions: [],
    suggestions: introConfig.suggestions,
    sources: [],
    flags: { off_topic: false, blocked: false, needs_human: false, pii_redacted: false },
    lines: introConfig.lines,
    sequence: introConfig.sequence as any,
    tour: 'tour' in introConfig ? (introConfig.tour as any) : undefined
  };

  return corsResponse(request, response);
}

// GET /api/sparky/tip
export async function handleTip(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const page = url.searchParams.get('page') as TipQuery['page'];
  const audience = (url.searchParams.get('audience') as 'kids' | 'adult') || 'adult';

  if (!page || !CONFIG.PAGES.includes(page)) {
    return corsResponse(request, { error: `page must be one of [${CONFIG.PAGES.join(', ')}] and audience one of [${CONFIG.AUDIENCES.join(', ')}].` }, 400);
  }

  const tipText = CONFIG.TIPS[page][audience];

  const response: ChatResponse = {
    reply: tipText,
    speak: true,
    audience,
    animation: { state: 'run' as any, then: 'talk' as any },
    actions: [],
    suggestions: CONFIG.INTRO[audience].first_visit.suggestions,
    sources: [],
    flags: { off_topic: false, blocked: false, needs_human: false, pii_redacted: false }
  };

  return corsResponse(request, response);
}

// POST /api/sparky/chat
export async function handleChat(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
  // Parse body
  let body: any;
  try {
    const text = await request.text();
    if (text.length > CONFIG.MAX_BODY_SIZE) {
      return corsResponse(request, { error: ERRORS.BODY_TOO_LARGE }, 413);
    }
    body = text ? JSON.parse(text) : {};
  } catch {
    return corsResponse(request, { error: ERRORS.BAD_JSON }, 400);
  }

  // Validate
  const validation = validateChatRequest(body);
  if (!validation.valid) {
    return corsResponse(request, { error: validation.error }, 400);
  }

  const req = validation.request!;
  const { session_id, message, audience, context } = req;

  // Rate limit
  const rateLimit = await checkRateLimit(env.RATE_LIMITS, session_id);
  if (!rateLimit.allowed) {
    const retryMsg = rateLimit.retryAfter
      ? `Whoa, so many questions! Take a breath and try again in ${rateLimit.retryAfter} seconds. 🌬️`
      : "You've asked a lot today! Let's continue tomorrow. 🌙";

    const response: ChatResponse = {
      reply: retryMsg,
      speak: true,
      audience,
      animation: { state: (rateLimit.retryAfter ? 'idle' : 'sleep') as any, then: 'idle' as any },
      actions: [],
      suggestions: [],
      sources: [],
      flags: { off_topic: false, blocked: false, needs_human: false, pii_redacted: false }
    };

    return corsResponse(request, response, 429);
  }

  // PII redaction
  const { redacted: redactedMessage, wasRedacted } = redactPII(message);

  // Distress check
  if (checkDistress(redactedMessage)) {
    const distress = getDistressResponse(audience);
    const messageId = generateUUID();

    // Log (async)
    const logEntry = {
      ts: new Date().toISOString(),
      session_id,
      audience,
      page: context.page,
      engine: 'offline' as const,
      flags: distress.flags,
      message_id: messageId,
      message: audience === 'adult' ? redactedMessage : undefined,
      reply: distress.reply
    };
    ctx.waitUntil(logChat(env.LOGS, logEntry));

    return corsResponse(request, {
      ...distress,
      reply: distress.reply,
      speak: true,
      audience,
      animation: { state: 'idle' as any, then: 'idle' as any },
      actions: [],
      suggestions: [],
      sources: [],
      message_id: messageId
    });
  }

  // Blocked words check
  if (checkBlocked(redactedMessage)) {
    const blocked = getBlockedResponse(audience);
    const messageId = generateUUID();

    const logEntry = {
      ts: new Date().toISOString(),
      session_id,
      audience,
      page: context.page,
      engine: 'offline' as const,
      flags: blocked.flags,
      message_id: messageId,
      message: audience === 'adult' ? redactedMessage : undefined,
      reply: blocked.reply
    };
    ctx.waitUntil(logChat(env.LOGS, logEntry));

    return corsResponse(request, {
      ...blocked,
      reply: blocked.reply,
      speak: true,
      audience,
      animation: { state: 'idle' as any, then: 'idle' as any },
      actions: [],
      suggestions: [],
      sources: [],
      message_id: messageId
    });
  }

  // Get session
  let session = await getSession(env.SESSIONS, session_id);
  if (!session) {
    session = { messages: [], count: 0, created: Date.now(), lastActive: Date.now() };
  }

  // Check if offline (no API key)
  const hasApiKey = !!env.GEMINI_API_KEY;
  let response: ChatResponse;
  let engine: 'gemini' | 'offline' = 'offline';

  if (hasApiKey) {
    try {
      // Build prompts
      const systemPrompt = buildSystemPrompt();
      const contextBlock = buildContextBlock(req);
      const history = buildGeminiHistory(session);

      // Call Gemini
      const llmOutput = await callGemini(env, systemPrompt, contextBlock, redactedMessage, history);

      if (llmOutput) {
        engine = 'gemini';
        const messageId = generateUUID();
        response = mapLLMOutputToResponse(llmOutput, req, messageId);
        response.flags!.pii_redacted = wasRedacted;

        // Worry rule check (post-processing)
        if (checkWorryRule(redactedMessage) && !response.flags!.blocked) {
          response.reply = getWorryResponse(audience);
          response.flags!.off_topic = false;
        }

        // Add to session history
        await addMessageToSession(env.SESSIONS, session_id, 'user', redactedMessage);
        await addMessageToSession(env.SESSIONS, session_id, 'assistant', response.reply);
        await incrementSessionCount(env.SESSIONS, session_id);

        // Log (async)
        const logEntry = {
          ts: new Date().toISOString(),
          session_id,
          audience,
          page: context.page,
          engine: 'gemini' as const,
          flags: response.flags!,
          message_id: messageId,
          message: audience === 'adult' ? redactedMessage : undefined,
          reply: audience === 'adult' ? response.reply : undefined
        };
        ctx.waitUntil(logChat(env.LOGS, logEntry));

        return corsResponse(request, response);
      }
    } catch (error) {
      console.error('Gemini error, falling back to offline:', error);
      // Fall through to offline
    }
  }

  // Offline fallback
  const messageId = generateUUID();
  response = offlineAnswer(redactedMessage, audience);
  response.message_id = messageId;
  response.flags!.pii_redacted = wasRedacted;

  // Worry rule
  if (checkWorryRule(redactedMessage) && !response.flags!.blocked) {
    response.reply = getWorryResponse(audience);
    response.flags!.off_topic = false;
  }

  // Add to session history
  await addMessageToSession(env.SESSIONS, session_id, 'user', redactedMessage);
  await addMessageToSession(env.SESSIONS, session_id, 'assistant', response.reply);
  await incrementSessionCount(env.SESSIONS, session_id);

  // Log (async)
  const logEntry = {
    ts: new Date().toISOString(),
    session_id,
    audience,
    page: context.page,
    engine: 'offline' as const,
    flags: response.flags!,
    message_id: messageId,
    message: audience === 'adult' ? redactedMessage : undefined,
    reply: audience === 'adult' ? response.reply : undefined
  };
  ctx.waitUntil(logChat(env.LOGS, logEntry));

  return corsResponse(request, response);
}

// POST /api/sparky/feedback
export async function handleFeedback(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
  let body: any;
  try {
    const text = await request.text();
    if (text.length > CONFIG.MAX_BODY_SIZE) {
      return corsResponse(request, { error: ERRORS.BODY_TOO_LARGE }, 413);
    }
    body = text ? JSON.parse(text) : {};
  } catch {
    return corsResponse(request, { error: ERRORS.BAD_JSON }, 400);
  }

  const validation = validateFeedbackRequest(body);
  if (!validation.valid) {
    return corsResponse(request, { error: validation.error }, 400);
  }

  const req = validation.request!;

  // Log feedback (async)
  const logEntry = {
    ts: new Date().toISOString(),
    session_id: req.session_id,
    message_id: req.message_id,
    rating: req.rating,
    comment: req.comment ? redactPII(req.comment).redacted : undefined
  };
  ctx.waitUntil(logFeedback(env.LOGS, logEntry));

  return corsResponse(request, { ok: true });
}

// GET /api/sparky/schema
export async function handleSchema(request: Request, env: any): Promise<Response> {
  const schema = await loadSchema();
  return corsResponse(request, schema);
}

// ============ Router Setup ============
export function createRouter() {
  const router = Router();

  // CORS preflight
  router.options('*', () => new Response(null, { status: 204 }));

  // Routes - itty-router passes (request, env, ctx) to handlers
  router.get('/api/sparky/health', handleHealth);
  router.get('/api/sparky/intro', handleIntro);
  router.get('/api/sparky/tip', handleTip);
  router.post('/api/sparky/chat', handleChat);
  router.post('/api/sparky/feedback', handleFeedback);
  router.get('/api/sparky/schema', handleSchema);

  // 404
  router.all('*', () => corsResponse({} as any, { error: ERRORS.NOT_FOUND }, 404));

  return router;
}