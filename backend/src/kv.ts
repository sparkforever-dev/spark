// Cloudflare KV helpers for sessions, rate limits, and logging

import type { SessionData, RateLimitData, ChatLogEntry, FeedbackLogEntry } from './types';
import { CONFIG } from './config';

// ============ Session Storage ============
const SESSION_TTL = 60 * 60; // 1 hour in seconds

export async function getSession(kv: KVNamespace, sessionId: string): Promise<SessionData | null> {
  const data = await kv.get(`sess:${sessionId}`, 'json') as SessionData | null;
  if (!data) return null;

  // Check if session expired (1 hour idle)
  if (Date.now() - data.lastActive > 60 * 60 * 1000) {
    await kv.delete(`sess:${sessionId}`);
    return null;
  }
  return data;
}

export async function saveSession(kv: KVNamespace, sessionId: string, session: SessionData): Promise<void> {
  session.lastActive = Date.now();
  await kv.put(`sess:${sessionId}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });
}

export async function addMessageToSession(
  kv: KVNamespace,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<SessionData> {
  let session = await getSession(kv, sessionId);
  if (!session) {
    session = { messages: [], count: 0, created: Date.now(), lastActive: Date.now() };
  }

  session.messages.push({ role, content });
  session.count += 1;

  // Compact history after HISTORY_TURNS_KEPT turns (8 turns = 16 messages)
  const maxMessages = CONFIG.HISTORY_TURNS_KEPT * 2;
  if (session.messages.length > maxMessages) {
    const recent = session.messages.slice(-maxMessages);
    session.messages = recent;
  }

  await saveSession(kv, sessionId, session);
  return session;
}

export async function incrementSessionCount(kv: KVNamespace, sessionId: string): Promise<number> {
  const session = await getSession(kv, sessionId);
  if (session) {
    session.count += 1;
    await saveSession(kv, sessionId, session);
    return session.count;
  }
  return 0;
}

// ============ Rate Limiting ============
export async function checkRateLimit(kv: KVNamespace, sessionId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const currentMinute = Math.floor(now / 60000);

  // Get minute counter
  const minuteKey = `rl:min:${sessionId}:${currentMinute}`;
  const minuteCount = (await kv.get(minuteKey, 'json') as number) || 0;

  // Get session counter
  const sessionKey = `rl:sess:${sessionId}`;
  const sessionData = (await kv.get(sessionKey, 'json') as RateLimitData) || {
    minuteCount: 0,
    minuteWindow: currentMinute,
    sessionCount: 0
  };

  // Reset minute counter if new minute
  if (sessionData.minuteWindow !== currentMinute) {
    sessionData.minuteCount = 0;
    sessionData.minuteWindow = currentMinute;
  }

  // Check limits
  if (minuteCount >= CONFIG.RATE_LIMIT_PER_MINUTE) {
    const retryAfter = 60 - (now % 60000) / 1000;
    return { allowed: false, retryAfter: Math.ceil(retryAfter) };
  }

  if (sessionData.sessionCount >= CONFIG.RATE_LIMIT_PER_SESSION) {
    return { allowed: false }; // Session limit - no retry
  }

  // Increment counters
  await kv.put(minuteKey, String(minuteCount + 1), { expirationTtl: 120 }); // 2 minutes
  sessionData.minuteCount = minuteCount + 1;
  sessionData.sessionCount += 1;
  await kv.put(sessionKey, JSON.stringify(sessionData), { expirationTtl: 86400 }); // 24 hours

  return { allowed: true };
}

// ============ Logging ============
export async function logChat(kv: KVNamespace, entry: ChatLogEntry): Promise<void> {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `log:chat:${date}:${entry.session_id}`;

  const existing = await kv.get(key, 'json') as ChatLogEntry[] | null;
  const logs = existing || [];
  logs.push(entry);

  // Keep last 1000 entries per day per session
  if (logs.length > 1000) logs.shift();

  await kv.put(key, JSON.stringify(logs), { expirationTtl: CONFIG.LOG_RETENTION_DAYS * 86400 });
}

export async function logFeedback(kv: KVNamespace, entry: FeedbackLogEntry): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  const key = `log:fb:${date}:${entry.session_id}`;

  const existing = await kv.get(key, 'json') as FeedbackLogEntry[] | null;
  const logs = existing || [];
  logs.push(entry);

  await kv.put(key, JSON.stringify(logs), { expirationTtl: CONFIG.LOG_RETENTION_DAYS * 86400 });
}

// ============ UUID ============
export function generateUUID(): string {
  return crypto.randomUUID();
}

export function isValidUUID(uuid: string): boolean {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}