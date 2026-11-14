// Configuration constants from sparky.schema.json
import schema from '../sparky.schema.json' with { type: 'json' };

export const CONFIG = {
  // API
  BASE_PATH: '/api/sparky',
  MAX_BODY_SIZE: 8 * 1024, // 8 KB

  // Rate limits (from schema)
  RATE_LIMIT_PER_MINUTE: schema.api.rate_limits.per_minute, // 10
  RATE_LIMIT_PER_SESSION: schema.api.rate_limits.per_session, // 200
  MAX_INPUT_CHARS: schema.api.max_input_chars, // 500
  LOG_RETENTION_DAYS: schema.api.log_retention_days, // 30

  // LLM (from schema)
  LLM_MODEL: schema.api.llm.model, // gemini-3.1-flash-lite
  LLM_TEMPERATURE: schema.api.llm.temperature, // 0.7
  LLM_MAX_TOKENS: schema.api.llm.max_tokens, // 4000
  HISTORY_TURNS_KEPT: schema.api.llm.history_turns_kept, // 8

  // Full schema sections for system prompt building
  persona: schema.persona,
  audience_rules: schema.audience_rules,
  safety: schema.safety,
  knowledge: schema.knowledge,
  animation: schema.animation,
  intro: schema.intro,
  tips: schema.tips,

  // Enums from schema $defs
  AUDIENCES: schema.$defs.Audience.enum as readonly string[],
  PAGES: schema.$defs.Page.enum as readonly string[],
  LAYERS: schema.$defs.Layer.enum as readonly string[],
  ANIMATION_STATES: schema.$defs.AnimationState.enum as readonly string[],
  ACTION_TYPES: schema.$defs.ActionType.enum as readonly string[],
  CHANNELS: schema.$defs.Channel.enum as readonly string[],
  ROUTES: schema.$defs.Route.enum as readonly string[],
  PROVENANCES: schema.$defs.Provenance.enum as readonly string[],
  RATINGS: schema.$defs.Rating.enum as readonly string[],

  // UI Elements
  UI_ELEMENTS: schema.knowledge.ui_elements as readonly string[],

  // Safety
  DISTRESS_WORDS: schema.safety.distress_words as readonly string[],
  BLOCKED_WORDS: schema.safety.blocked_words as readonly string[],
  DISTRESS_RESPONSE: schema.safety.distress_escalation.response as string,
  BLOCKED_RESPONSE: schema.safety.blocked_response as { reply: string; blocked: boolean },

  // Animation
  ONE_SHOT_DURATIONS: schema.animation.one_shot as Record<string, number>,
  LOOP_STATES: schema.animation.loop as readonly string[],
  REDUCED_MOTION_MAP: schema.animation.reduced_motion_map as Record<string, string>,

  // Intro content
  INTRO: schema.intro,
  TIPS: schema.tips,

  // Knowledge
  SOUND_MAPPINGS: schema.knowledge.sound_mappings,
  DATASETS: schema.knowledge.datasets,
  FAQ: schema.knowledge.faq,
  SHORTCUTS: schema.knowledge.shortcuts,
} as const;

// CORS
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigins = (globalThis as any).SPARKY_ALLOWED_ORIGINS || '*';
  const allowOrigin = allowedOrigins === '*' ? '*' : allowedOrigins.split(',').includes(origin) ? origin : '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    'Vary': 'Origin',
  };
}

// Error responses
export const ERRORS = {
  BAD_JSON: 'Body must be a JSON object.',
  UNKNOWN_FIELDS: (fields: string[]) => `Unknown field(s): ${fields.join(', ')}.`,
  MISSING_FIELD: (field: string) => `Missing required field '${field}'.`,
  INVALID_UUID: 'session_id must be a UUID.',
  EMPTY_MESSAGE: 'message must be a non-empty string.',
  MESSAGE_TOO_LONG: 'message is longer than 500 characters.',
  INVALID_AUDIENCE: `audience must be one of [${CONFIG.AUDIENCES.join(', ')}].`,
  INVALID_PAGE: `context.page must be one of [${CONFIG.PAGES.join(', ')}].`,
  INVALID_LAYER: `context.layer must be one of [${CONFIG.LAYERS.join(', ')}].`,
  INVALID_LAT: 'context.lat must be a number between -90 and 90.',
  INVALID_LON: 'context.lon must be a number between -180 and 180.',
  INVALID_SELECTED_VALUE: 'context.selected_value must be a string.',
  INVALID_BOOLEAN: (field: string) => `context.${field} must be true or false.`,
  NOT_FOUND: 'Not found',
  BODY_TOO_LARGE: 'Request body too large.',
  INTERNAL_ERROR: 'Sparky tripped over a cable. Please try again.',
  INVALID_RATING: "rating must be 'up' or 'down'.",
  INVALID_COMMENT: 'comment must be a string of at most 300 characters.',
} as const;