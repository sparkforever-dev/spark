// Gemini API client and system prompt construction

import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from './config';
import type { LLMOutput, ChatRequest, SessionData } from './types';

// Lazy initialization - will be set on first use
let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

function getModel(env: any) {
  if (!genAI) {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({
      model: CONFIG.LLM_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: CONFIG.LLM_TEMPERATURE,
        maxOutputTokens: CONFIG.LLM_MAX_TOKENS,
      },
    });
  }
  return model;
}

// Build system prompt from schema (cached)
let cachedSystemPrompt: string | null = null;

export function buildSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  const { persona, audience_rules, safety, knowledge, animation, intro, tips } = CONFIG;

  const prompt = `You are ${persona.name}, ${persona.tagline}

${persona.description}

VOICE: ${persona.voice}

=== AUDIENCE MODES ===
KIDS (max ${audience_rules.kids.max_words} words):
- ${audience_rules.kids.tone}
- Quiz: ${audience_rules.kids.quiz}
- Avoid: ${audience_rules.kids.avoid.join(', ')}

ADULT (max ${audience_rules.adult.max_words} words):
- ${audience_rules.adult.tone}
- Quiz: ${audience_rules.adult.quiz}
- Avoid: ${audience_rules.adult.avoid.join(', ')}

=== SAFETY RULES ===
DISTRESS WORDS (trigger care response): ${safety.distress_words.join(', ')}
BLOCKED WORDS (trigger blocked response): ${safety.blocked_words.join(', ')}

If user message contains distress words: respond with care message, set needs_human=true
If user message contains blocked words: respond with blocked message, set blocked=true

=== KNOWLEDGE BASE ===
SOUND MAPPINGS:
${Object.entries(knowledge.sound_mappings).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

DATASETS:
${knowledge.datasets.map((d: any) => `- ${d.id}: ${d.name} - ${d.description} (${d.url})`).join('\n')}

PAGES:
${Object.entries(knowledge.pages).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

SHORTCUTS:
${Object.entries(knowledge.shortcuts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

FAQ:
${knowledge.faq.map((f: any) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')}

UI ELEMENTS (for highlight/animation target):
${knowledge.ui_elements.join(', ')}

=== ANIMATION STATES ===
One-shot (duration ms):
${Object.entries(animation.one_shot).map(([k, v]) => `- ${k}: ${v}ms`).join('\n')}

Loop states: ${animation.loop.join(', ')}

Reduced motion mapping: ${JSON.stringify(animation.reduced_motion_map)}

=== OUTPUT FORMAT ===
Return ONLY valid JSON matching this schema:
{
  "reply": "string - your response",
  "animation_state": "one of: ${CONFIG.ANIMATION_STATES.join(', ')}",
  "animation_target": "string - UI element ID from knowledge.ui_elements or empty string",
  "actions": [{"type": "navigate|play_demo|highlight|open_link", "value": "string"}],
  "suggestions": ["string", "string", "string"],
  "sources": ["power|gistemp|demo"],
  "quiz_question": "string (kids only)",
  "quiz_options": ["string", "string", "string", "string"],
  "quiz_answer_index": "number (0-3)",
  "off_topic": "boolean",
  "blocked": "boolean",
  "needs_human": "boolean"
}

RULES:
- reply: max ${audience_rules.kids.max_words} words for kids, ${audience_rules.adult.max_words} for adult (we'll trim)
- animation_state: MUST be from the list above
- animation_target: MUST be from UI elements list or empty string
- actions: max 3, type must be valid, value depends on type
- suggestions: max 3, each <= 60 chars
- sources: only from [power, gistemp, demo]
- quiz: only for kids, 2-4 options, answer_index in range
- Every number you state MUST come from knowledge base or live tool result`;

  cachedSystemPrompt = prompt;
  return prompt;
}

// Build per-request context block
export function buildContextBlock(request: ChatRequest): string {
  const { audience, context, language } = request;
  const pageRouteMap: Record<string, string> = {
    home: '#/',
    explore: '#/explore',
    studio: '#/studio',
    learn: '#/learn',
    compare: '#/compare'
  };

  let contextBlock = `<context>\naudience: ${audience}\npage: ${context.page} (${pageRouteMap[context.page]})`;

  if (context.layer) contextBlock += `\nlayer: ${context.layer}`;
  if (context.lat !== undefined && context.lon !== undefined) {
    contextBlock += `\nlat: ${context.lat}\nlon: ${context.lon}`;
  }
  if (context.selected_value) contextBlock += `\nselected_value: ${context.selected_value}`;
  if (context.is_playing !== undefined) contextBlock += `\nis_playing: ${context.is_playing}`;
  if (context.reduced_motion !== undefined) contextBlock += `\nreduced_motion: ${context.reduced_motion}`;
  if (language && language !== 'en') contextBlock += `\nreply_language: ${language}`;

  contextBlock += '\n</context>';
  return contextBlock;
}

// Convert session history to Gemini format
export function buildGeminiHistory(session: SessionData | null): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  if (!session || session.messages.length === 0) return [];

  const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const msg of session.messages) {
    history.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  }

  return history;
}

// Call Gemini API
export async function callGemini(
  env: any,
  systemPrompt: string,
  contextBlock: string,
  userMessage: string,
  history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
): Promise<LLMOutput | null> {
  try {
    const model = getModel(env);

    // Combine context + user message
    const userContent = `${contextBlock}\n\n${userMessage}`;

    // Build full conversation
    const contents = [
      ...history,
      { role: 'user' as const, parts: [{ text: userContent }] }
    ];

    const result = await model.generateContent({
      contents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      }
    });

    const response = result.response;
    const text = response.text();

    if (!text) {
      console.error('Empty Gemini response');
      return null;
    }

    // Parse JSON output
    let parsed: LLMOutput;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse Gemini JSON:', text);
      return null;
    }

    // Validate required fields
    if (!parsed.reply || !parsed.animation_state) {
      console.error('Missing required fields in Gemini output');
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

// Map LLM output to ChatResponse
import type { ChatResponse, AnimationState, Action, Source } from './types';

export function mapLLMOutputToResponse(
  llmOutput: LLMOutput,
  request: ChatRequest,
  messageId: string
): ChatResponse {
  const { audience, context } = request;
  const maxWords = audience === 'kids' ? CONFIG.audience_rules.kids.max_words : CONFIG.audience_rules.adult.max_words;

  // Trim reply to max words (with 1.3x slack like Python)
  const words = llmOutput.reply.split(/\s+/);
  const maxAllowed = Math.floor(maxWords * 1.3);
  const trimmedReply = words.length > maxAllowed ? words.slice(0, maxAllowed).join(' ') + '…' : llmOutput.reply;

  // Validate animation state
  let animationState: AnimationState = llmOutput.animation_state;
  if (!CONFIG.ANIMATION_STATES.includes(animationState)) {
    animationState = 'talk';
  }

  // Reduced motion mapping
  if (context.reduced_motion && CONFIG.REDUCED_MOTION_MAP[animationState]) {
    animationState = CONFIG.REDUCED_MOTION_MAP[animationState] as AnimationState;
  }

  // Validate animation target
  let animationTarget = llmOutput.animation_target;
  if (animationTarget && !CONFIG.UI_ELEMENTS.includes(animationTarget)) {
    animationTarget = '';
  }

  // Map actions
  const actions: Action[] = (llmOutput.actions || []).slice(0, 3).map(a => {
    const action: Action = { type: a.type };
    switch (a.type) {
      case 'navigate':
        if (CONFIG.ROUTES.includes(a.value as any)) action.route = a.value;
        break;
      case 'play_demo':
        if (CONFIG.CHANNELS.includes(a.value as any)) action.channel = a.value;
        break;
      case 'highlight':
        if (CONFIG.UI_ELEMENTS.includes(a.value)) action.element_id = a.value;
        break;
      case 'open_link':
        const dataset = CONFIG.DATASETS.find(d => d.url === a.value);
        if (dataset) action.url = a.value;
        break;
    }
    return action;
  }).filter(a => Object.keys(a).length > 1); // Only keep valid actions

  // Map suggestions
  const suggestions = (llmOutput.suggestions || []).slice(0, 3).map(s => s.slice(0, 60));

  // Map sources
  const sources: Source[] = (llmOutput.sources || []).map(p => ({
    provenance: p,
    url: p === 'demo' ? null : CONFIG.DATASETS.find(d => d.provenance === p)?.url || null
  }));

  // Build quiz (kids only)
  let quiz: ChatResponse['quiz'];
  if (audience === 'kids' && llmOutput.quiz_question && llmOutput.quiz_options && llmOutput.quiz_options.length >= 2) {
    const options = llmOutput.quiz_options.slice(0, 4);
    const answerIndex = Math.min(llmOutput.quiz_answer_index ?? 0, options.length - 1);
    quiz = {
      question: llmOutput.quiz_question,
      options,
      answer_index: answerIndex
    };
  }

  // Flags
  const flags = {
    off_topic: llmOutput.off_topic ?? false,
    blocked: llmOutput.blocked ?? false,
    needs_human: llmOutput.needs_human ?? false,
    pii_redacted: false // Set by caller
  };

  // If blocked, override reply and clear actions/quiz
  let finalReply = trimmedReply;
  let finalActions = actions;
  let finalQuiz = quiz;

  if (flags.blocked) {
    finalReply = CONFIG.BLOCKED_RESPONSE.reply;
    finalActions = [];
    finalQuiz = undefined;
  }

  return {
    message_id: messageId,
    reply: finalReply,
    speak: true,
    audience,
    animation: {
      state: animationState,
      target: animationTarget || undefined,
      then: 'idle'
    },
    actions: finalActions.length > 0 ? finalActions : undefined,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    sources: sources.length > 0 ? sources : undefined,
    quiz: finalQuiz,
    flags
  };
}