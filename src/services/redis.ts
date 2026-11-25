import { Redis } from 'ioredis';

// 1. Read Redis connection URL from .env (defaults to localhost:6379)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Singleton Redis Client Instance
 * Used across KairosHook for sub-millisecond idempotency locks and streaming queues.
 */
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    // Exponential backoff: waits longer between each attempt up to 2s
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// ==========================================
// Lifecycle Event Listeners (Observability)
// ==========================================

redis.on('connect', () => {
  console.log('[REDIS] Connected successfully to Redis server');
});

redis.on('ready', () => {
  console.log('[REDIS] Ready to accept idempotency and queue commands');
});

redis.on('error', (err: Error) => {
  console.error('[REDIS] Connection error:', err.message);
});

redis.on('close', () => {
  console.warn('[REDIS] Connection closed. Attempting reconnect...');
});