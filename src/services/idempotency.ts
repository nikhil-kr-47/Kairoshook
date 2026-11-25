//This file implements the Redis atomic mutex (SET NX EX).

import type {IdempotencyCheckResult,IdempotencyRecordPayload} from '../types/webhook.js';
import {redis} from './redis.js';

// Lock TTL: 5 mins while processing ( mainly for when the thread dies or carshes)
const LOCK_TTL_SECONDS = 300;
// Retention TTL: 7 days after completion for deduplication cache (Required to delete the keys after 7 days)
const COMPLETED_TTL_SECONDS = 86400 * 7;

function getIdempotencyKey (provider: string, eventId: string):string{
     return `idempotency:${provider}:${eventId}`;
}

export async function checkAndLockEvent(provider: string, eventId: string):Promise<IdempotencyCheckResult>{
    const key = getIdempotencyKey(provider, eventId);

    const initialPayload: IdempotencyRecordPayload = {
    status: 'PROCESSING',
    lockedAt: new Date().toISOString()
  };

  // 'NX' ensures only the FIRST thread to hit Redis sets the key.
  // 'EX' ensures if our server dies mid-execution, the lock auto-expires.
  const acquired = await redis.set(
    key,
    JSON.stringify(initialPayload),
    'EX',
    LOCK_TTL_SECONDS,
    'NX'
  );

  if (acquired === 'OK') {
    // First thread here! Lock acquired.
    return { status: 'FIRST_SEEN' };
  }

  // Key already exists! Inspect the current state: ( Encountered only when acquired is null)
  const rawRecord = await redis.get(key);
  if (!rawRecord) {
    // 🔒 LOOPHOLE CLOSED: 
    // The expired lock vanished before we could read it!
    // Instead of assuming we have the lock, re-run checkAndLockEvent 
    // so we ACTUALLY acquire the lock with 'SET NX'!
    return checkAndLockEvent(provider, eventId);
  }

  try{
    const record: IdempotencyRecordPayload = JSON.parse(rawRecord);
     if (record.status === 'COMPLETED') {
      return {
        status: 'DUPLICATE_COMPLETED',
        cachedResponse: record.response
      };
    }

     return { status: 'DUPLICATE_PROCESSING' };
  }catch{
    return { status: 'DUPLICATE_PROCESSING' };
  
  }
}

/**
 * Marks an event as COMPLETED and caches its response for future duplicates.
 */
export async function markEventCompleted(
  provider: string,
  eventId: string,
  responseToCache?: Record<string, unknown>
): Promise<void> {
  const key = getIdempotencyKey(provider, eventId);
  const completedPayload: IdempotencyRecordPayload = {
    status: 'COMPLETED',
    lockedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    response: responseToCache
  };
  await redis.set(
    key,
    JSON.stringify(completedPayload),
    'EX',
    COMPLETED_TTL_SECONDS
  );
}

/**
 * Releases the lock if an error occurs before the event can be queued.
 */
export async function releaseEventLock(
  provider: string,
  eventId: string
): Promise<void> {
  const key = getIdempotencyKey(provider, eventId);
  await redis.del(key);
}


