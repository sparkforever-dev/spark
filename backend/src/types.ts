// TypeScript interfaces matching the Python backend's ChatRequest/ChatResponse

export interface ChatRequest {
  session_id: string;
  message: string;
  audience: 'kids' | 'adult';
  language?: string; // BCP-47, default 'en'
  context: {
    page: 'home' | 'explore' | 'studio' | 'learn' | 'compare';
    layer?: 'ocean' | 'rain' | 'atmos' | 'veg' | 'temp';
    lat?: number;
    lon?: number;
    selected_value?: string;
    is_playing?: boolean;
    reduced_motion?: boolean;
  };
}

export interface ChatResponse {
  message_id?: string;
  reply: string;
  speak?: boolean;
  audience: 'kids' | 'adult';
  animation: {
    state: AnimationState;
    target?: string;
    then?: AnimationState;
  };
  actions?: Action[];
  suggestions?: string[];
  sources?: Source[];
  quiz?: Quiz;
  flags?: Flags;
  lines?: string[];
  sequence?: AnimationState[];
  tour?: TourItem[];
}

export type AnimationState =
  | 'enter_pop' | 'wave' | 'idle' | 'wander' | 'jump' | 'run'
  | 'talk' | 'think' | 'point' | 'dance' | 'celebrate' | 'curious' | 'sleep' | 'exit';

export interface Action {
  type: 'navigate' | 'play_demo' | 'highlight' | 'open_link';
  route?: string;        // for navigate
  channel?: string;      // for play_demo
  element_id?: string;   // for highlight
  url?: string;          // for open_link
}

export interface Source {
  provenance: 'power' | 'gistemp' | 'demo';
  url?: string | null;
}

export interface Quiz {
  question: string;
  options: string[];
  answer_index: number;
}

export interface Flags {
  off_topic?: boolean;
  blocked?: boolean;
  needs_human?: boolean;
  pii_redacted?: boolean;
}

export interface TourItem {
  page: 'home' | 'explore' | 'studio' | 'learn' | 'compare';
  line: string;
}

export interface FeedbackRequest {
  session_id: string;
  message_id?: string;
  rating: 'up' | 'down';
  comment?: string;
}

export interface FeedbackResponse {
  ok: boolean;
}

export interface HealthResponse {
  ok: boolean;
  engine: 'gemini' | 'offline';
  model: string;
  offline_reason: string | null;
  schema_version: string;
}

export interface IntroQuery {
  audience?: 'kids' | 'adult';
  returning?: 'true' | 'false';
  reduced_motion?: 'true' | 'false';
}

export interface TipQuery {
  page: 'home' | 'explore' | 'studio' | 'learn' | 'compare';
  audience?: 'kids' | 'adult';
}

export interface SessionData {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  count: number;
  created: number;
  lastActive: number;
}

export interface RateLimitData {
  minuteCount: number;
  minuteWindow: number; // Unix minute (timestamp / 60000)
  sessionCount: number;
}

export interface ChatLogEntry {
  ts: string;
  session_id: string;
  audience: 'kids' | 'adult';
  page: string;
  engine: 'gemini' | 'offline';
  flags: Flags;
  message_id: string;
  message?: string; // adult only, redacted
  reply?: string;   // adult only
}

export interface FeedbackLogEntry {
  ts: string;
  session_id: string;
  message_id?: string;
  rating: 'up' | 'down';
  comment?: string; // redacted
}

// Gemini API types
export interface GeminiRequest {
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  generationConfig?: {
    responseMimeType?: string;
    temperature?: number;
    maxOutputTokens?: number;
  };
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
}

export interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface LLMOutput {
  reply: string;
  animation_state: AnimationState;
  animation_target: string;
  actions: Array<{ type: Action['type']; value: string }>;
  suggestions: string[];
  sources: Array<'power' | 'gistemp' | 'demo'>;
  quiz_question?: string;
  quiz_options?: string[];
  quiz_answer_index?: number;
  off_topic: boolean;
  blocked: boolean;
  needs_human: boolean;
}