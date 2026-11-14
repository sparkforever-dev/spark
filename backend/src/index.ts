// Cloudflare Worker entry point for Earth Jukebox Sparky backend

import { createRouter } from './handlers';

// Type for Cloudflare Worker environment
interface Env {
  GEMINI_API_KEY: string;
  SESSIONS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  LOGS: KVNamespace;
  SPARKY_ALLOWED_ORIGINS?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Make SPARKY_ALLOWED_ORIGINS available globally for CORS
    if (env.SPARKY_ALLOWED_ORIGINS) {
      (globalThis as any).SPARKY_ALLOWED_ORIGINS = env.SPARKY_ALLOWED_ORIGINS;
    }

    const router = createRouter();
    return router.handle(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;