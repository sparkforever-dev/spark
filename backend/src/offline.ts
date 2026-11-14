// Offline/fallback engine - keyword matching from schema knowledge

import { CONFIG } from './config';
import type { ChatResponse, AnimationState } from './types';

// Simple keyword scoring for offline responses
interface KeywordMatch {
  keywords: string[];
  reply: (audience: 'kids' | 'adult') => string;
  animation: AnimationState;
  suggestions: string[];
  sources: Array<'power' | 'gistemp' | 'demo'>;
}

const KEYWORD_MATCHES: KeywordMatch[] = [
  // Sound mapping questions
  {
    keywords: ['why', 'sound', 'music', 'note', 'pitch', 'rhythm', 'texture', 'layer', 'map'],
    reply: (audience) => audience === 'kids'
      ? "The music comes from real climate data! 🌡️ Temperature makes the pitch go up or down. Rain makes the rhythm. Wind adds texture. It's like Earth is playing a song!"
      : "Each climate variable maps to a sound parameter: temperature → pitch, rainfall → rhythm, wind speed → texture, vegetation → layers, CO2 → pan. This sonification lets you hear patterns in the data.",
    animation: 'talk',
    suggestions: ['How does temperature map to pitch?', 'What does rain sound like?'],
    sources: ['demo']
  },
  // Data source questions
  {
    keywords: ['data', 'source', 'nasa', 'real', 'measurement', 'satellite', 'power', 'gistemp'],
    reply: (audience) => audience === 'kids'
      ? "Yes, it's real data from NASA satellites! 🛰️ They measure temperature, rain, wind, and more from space. The temperature record goes back to 1880."
      : "The data comes from NASA POWER (satellite-derived climate parameters) and NASA GISTEMP (global surface temperature record since 1880). Both are authoritative scientific datasets.",
    animation: 'point',
    suggestions: ['What is NASA POWER?', 'How far back does the data go?'],
    sources: ['power', 'gistemp']
  },
  // How to use / what can I do
  {
    keywords: ['what', 'do', 'how', 'use', 'play', 'explore', 'studio', 'compare', 'learn'],
    reply: (audience) => audience === 'kids'
      ? "You can: 🌍 Spin the Earth and hear 145 years of warming! 🎵 Tap anywhere to hear that place's climate. 🎧 Mix sounds in the Studio. 📚 Learn how data becomes music. ⚖️ Compare two places!"
      : "Explore the globe to hear location-specific climatologies. Use Studio to compose with layered climate data. Compare two locations or time periods. Learn the sonification methodology.",
    animation: 'wave',
    suggestions: ['Take me to Explore', 'Open the Studio'],
    sources: ['demo']
  },
  // Climate change / warming
  {
    keywords: ['warming', 'climate change', 'global warming', 'hotter', 'temperature rise', 'degrees'],
    reply: (audience) => audience === 'kids'
      ? "Earth has warmed about 1.2°C since 1880. 🌡️ You can hear it in the music — the notes get higher over time! NASA tracks this with satellites and weather stations."
      : "Global average temperature has risen ~1.2°C since the pre-industrial era (1880–1900). GISTEMP shows this trend clearly. The sonification maps this warming to rising pitch over time.",
    animation: 'think',
    suggestions: ['Show me the temperature record', 'Compare two time periods'],
    sources: ['gistemp']
  },
  // Rain / precipitation
  {
    keywords: ['rain', 'rainfall', 'precipitation', 'wet', 'dry', 'storm', 'flood'],
    reply: (audience) => audience === 'kids'
      ? "Rain becomes rhythm in the music! 🌧️ More rain = faster beats. Less rain = slower. You can hear wet and dry places sound really different."
      : "Rainfall maps to rhythm/tempo in the sonification. Higher precipitation → faster rhythmic density. NASA POWER provides monthly climatology for precipitation (PRECTOTCORR).",
    animation: 'point',
    suggestions: ['What does a rainforest sound like?', 'Compare wet vs dry places'],
    sources: ['power']
  },
  // Wind
  {
    keywords: ['wind', 'windy', 'breeze', 'gust', 'hurricane', 'storm'],
    reply: (audience) => audience === 'kids'
      ? "Wind adds texture to the music! 💨 Stronger wind = rougher, more complex sounds. Gentle breeze = smooth. You can hear how windy a place is!"
      : "Wind speed (WS10M from NASA POWER) maps to texture/timbre. Higher wind speeds add harmonic complexity and noise components to the sound.",
    animation: 'point',
    suggestions: ['What does a windy place sound like?', 'How is wind measured?'],
    sources: ['power']
  },
  // Temperature
  {
    keywords: ['temperature', 'temp', 'hot', 'cold', 'warm', 'freeze', 'heat'],
    reply: (audience) => audience === 'kids'
      ? "Temperature controls the pitch! 🌡️ Hotter = higher notes. Colder = lower notes. That's why the music goes up as Earth warms."
      : "Temperature (T2M, TS from NASA POWER) maps to fundamental pitch. The mapping is logarithmic to match human pitch perception. GISTEMP provides the long-term global record.",
    animation: 'point',
    suggestions: ['What does the Arctic sound like?', 'Hear the equator vs poles'],
    sources: ['power', 'gistemp']
  },
  // Vegetation / plants
  {
    keywords: ['plant', 'tree', 'forest', 'vegetation', 'green', 'jungle', 'nature'],
    reply: (audience) => audience === 'kids'
      ? "Plants add layers to the music! 🌳 More vegetation = richer, fuller sound. Forests sound different from deserts."
      : "Vegetation indices map to harmonic layers/voice count. More vegetation → more simultaneous voices in the sonification.",
    animation: 'point',
    suggestions: ['Rainforest vs desert sound', 'How is vegetation measured?'],
    sources: ['power']
  },
  // CO2 / carbon
  {
    keywords: ['co2', 'carbon', 'emission', 'greenhouse', 'atmosphere'],
    reply: (audience) => audience === 'kids'
      ? "CO2 affects the pan/spread of the music! More CO2 = wider sound. It's like the music is spreading out."
      : "CO2 concentration maps to stereo pan spread. Rising CO2 widens the spatial image. This data comes from atmospheric monitoring networks, not directly from POWER.",
    animation: 'think',
    suggestions: ['How has CO2 changed?', 'What does CO2 sound like?'],
    sources: ['demo']
  },
  // Help / confused
  {
    keywords: ['help', 'confused', 'don\'t understand', 'lost', 'stuck'],
    reply: (audience) => audience === 'kids'
      ? "No worries! 😊 Try tapping the globe, pressing play, or asking me something like 'What does the ocean sound like?' I'm here to help!"
      : "Try exploring the globe, opening the Studio, or asking a specific question about the data or sonification. The Learn page explains the methodology.",
    animation: 'curious',
    suggestions: ['What can I do here?', 'How does this work?'],
    sources: ['demo']
  }
];

// Default fallback
const DEFAULT_REPLY = {
  kids: "I'm not sure about that! 🤔 Try asking about temperature, rain, wind, or what you can do here. Or tap the globe to explore!",
  adult: "I'm not certain. You can ask about the data sources (NASA POWER, GISTEMP), the sonification mappings, or how to use Explore, Studio, Compare, and Learn."
};

export function offlineAnswer(message: string, audience: 'kids' | 'adult'): ChatResponse {
  const lower = message.toLowerCase();

  // Score each keyword match
  let bestMatch: KeywordMatch | null = null;
  let bestScore = 0;

  for (const match of KEYWORD_MATCHES) {
    const score = match.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
    }
  }

  let reply: string;
  let animation: AnimationState = 'talk';
  let suggestions: string[] = [];
  let sources: Array<'power' | 'gistemp' | 'demo'> = ['demo'];
  let off_topic = false;

  if (bestMatch && bestScore > 0) {
    reply = bestMatch.reply(audience);
    animation = bestMatch.animation;
    suggestions = bestMatch.suggestions.slice(0, 3);
    sources = bestMatch.sources;
  } else {
    reply = DEFAULT_REPLY[audience];
    off_topic = true;
    suggestions = audience === 'kids'
      ? ['What does the ocean sound like?', 'How does this work?', 'Take me to Explore']
      : ['Explain the sonification', 'Show me data sources', 'Open Studio'];
  }

  // Worry rule check
  if (checkWorryRuleOffline(message)) {
    reply = getWorryResponseOffline(audience);
    off_topic = false;
    animation = 'talk';
  }

  return {
    reply,
    speak: true,
    audience,
    animation: { state: animation, then: 'idle' },
    actions: [],
    suggestions,
    sources: sources.map(p => ({ provenance: p, url: null })),
    flags: { off_topic, blocked: false, needs_human: false, pii_redacted: false },
    lines: [reply],
    sequence: [animation, 'idle']
  };
}

// Duplicate worry check for offline (avoid circular import)
function checkWorryRuleOffline(message: string): boolean {
  const lower = message.toLowerCase();
  const worryWords = ['worried', 'worry', 'scared', 'afraid', 'fear', 'anxious', 'anxiety', 'nervous'];
  const climateWords = ['climate', 'warming', 'temperature', 'heat', 'flood', 'drought', 'storm', 'hurricane', 'carbon', 'co2', 'emissions', 'planet', 'earth', 'future'];
  return worryWords.some(w => lower.includes(w)) && climateWords.some(w => lower.includes(w));
}

function getWorryResponseOffline(audience: 'kids' | 'adult'): string {
  if (audience === 'kids') {
    return "It's okay to feel worried about our planet. 💚 Lots of people care and are working on solutions. The music you hear is real data — it helps us understand what's happening. Want to explore a place that gives you hope?";
  }
  return "Climate anxiety is real and valid. The data sonified here represents both challenges and progress — renewable growth, policy action, and communities adapting. You're not alone in this concern. Would you like to hear a place where the data shows positive trends?";
}