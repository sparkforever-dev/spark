// Safety filters: distress detection, blocked words, PII redaction

import { CONFIG } from './config';

// ============ Distress Detection ============
export function checkDistress(message: string): boolean {
  const lower = message.toLowerCase();
  return CONFIG.DISTRESS_WORDS.some(word => lower.includes(word.toLowerCase()));
}

export function getDistressResponse(audience: 'kids' | 'adult'): { reply: string; flags: any } {
  return {
    reply: CONFIG.DISTRESS_RESPONSE,
    flags: {
      off_topic: false,
      blocked: false,
      needs_human: true,
      pii_redacted: false
    }
  };
}

// ============ Blocked Words ============
export function checkBlocked(message: string): boolean {
  const lower = message.toLowerCase();
  return CONFIG.BLOCKED_WORDS.some(word => lower.includes(word.toLowerCase()));
}

export function getBlockedResponse(audience: 'kids' | 'adult'): { reply: string; flags: any } {
  return {
    reply: CONFIG.BLOCKED_RESPONSE.reply,
    flags: {
      off_topic: false,
      blocked: true,
      needs_human: false,
      pii_redacted: false
    }
  };
}

// ============ PII Redaction ============
const PII_PATTERNS = [
  // Email
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[email redacted]' },
  // Phone (US formats)
  { regex: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g, replacement: '[phone redacted]' },
  // Street address (simple pattern)
  { regex: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl)\b/gi, replacement: '[address redacted]' },
  // "my name is X" pattern
  { regex: /\bmy name is\s+[A-Za-z]+/gi, replacement: 'my name is [redacted]' },
];

export function redactPII(text: string): { redacted: string; wasRedacted: boolean } {
  let redacted = text;
  let wasRedacted = false;

  for (const { regex, replacement } of PII_PATTERNS) {
    const newText = redacted.replace(regex, replacement);
    if (newText !== redacted) {
      wasRedacted = true;
      redacted = newText;
    }
  }

  return { redacted, wasRedacted };
}

// ============ Worry Rule ============
const WORRY_WORDS = ['worried', 'worry', 'scared', 'afraid', 'fear', 'anxious', 'anxiety', 'nervous'];
const CLIMATE_WORDS = ['climate', 'warming', 'temperature', 'heat', 'flood', 'drought', 'storm', 'hurricane', 'carbon', 'co2', 'emissions', 'planet', 'earth', 'future'];

export function checkWorryRule(message: string): boolean {
  const lower = message.toLowerCase();
  const hasWorry = WORRY_WORDS.some(w => lower.includes(w));
  const hasClimate = CLIMATE_WORDS.some(w => lower.includes(w));
  return hasWorry && hasClimate;
}

export function getWorryResponse(audience: 'kids' | 'adult'): string {
  if (audience === 'kids') {
    return "It's okay to feel worried about our planet. 💚 Lots of people care and are working on solutions. The music you hear is real data — it helps us understand what's happening. Want to explore a place that gives you hope?";
  }
  return "Climate anxiety is real and valid. The data sonified here represents both challenges and progress — renewable growth, policy action, and communities adapting. You're not alone in this concern. Would you like to hear a place where the data shows positive trends?";
}