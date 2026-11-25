import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import {
  enforceWebhookSignature,
  type AuthenticatedWebhookRequest
} from './middlewares/verifySignature.js';
import {checkAndLockEvent,releaseEventLock} from './services/idempotency.js';
import {pushToEventQueue} from './services/queue.js';
// import type {S} from './types/webhook.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. Body Parser with Raw Body Preservation
// ==========================================
// Captures untouched network bytes into req.rawBody for HMAC verification!
app.use(
  express.json({
    verify: (req: AuthenticatedWebhookRequest, _res: Response, buf: Buffer) => {
      req.rawBody = buf.toString('utf8');
    }
  })
);

// ==========================================
// 2. System Health Check
// ==========================================
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'HEALTHY',
    service: 'KairosHook Ingestion Gateway',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 3. The Webhook Ingestion Route (Guard 1 + Guard 2 + Redis Streams)
// ==========================================
app.post(
  '/api/v1/webhooks/:provider',
  enforceWebhookSignature, // <-- Guard 1 HMAC Signature Verification!
  async(req: AuthenticatedWebhookRequest, res: Response) => {
    const  provider  = req.params.provider as string || 'custom';
    const payload = req.body || {};

    // Extract standardized metadata from the payload:
    // Different providers store event ID and topic under different keys
    const eventId = payload.id || payload.eventId || req.headers['x-event-id'];
    const topic = payload.type || payload.topic || 'webhook.event';
    const entityId = payload.data?.object?.id || payload.entityId || eventId;

    if (!eventId) {
      return res.status(400).json({
        error: 'Missing unique event ID (expected payload.id or x-event-id header)'
      });
    }

    try{
      // -------------------------------------------------------------
      // Guard 2: Hot Idempotency Mutex Lock Check (Atomic SET NX)
      // -------------------------------------------------------------
      const idempotency = await checkAndLockEvent(provider, String(eventId));

      // Scenario A: Event was completed in the past -> Instant cached response!
      if (idempotency.status === 'DUPLICATE_COMPLETED') {
        console.log(`⚡ [IDEMPOTENCY] Replaying cached response for completed event: ${eventId}`);
        return res.status(200).json(
          idempotency.cachedResponse || { received: true, status: 'ALREADY_COMPLETED' }
        );
      }

      // Scenario B: Duplicate arrives while a worker is already processing it
      if (idempotency.status === 'DUPLICATE_PROCESSING') {
        console.log(`⚠️ [IDEMPOTENCY] Blocked concurrent duplicate in-flight: ${eventId}`);
        return res.status(200).json({
          received: true,
          status: 'IN_FLIGHT',
          message: 'Event is currently being processed by another worker'
        });
      }

      // -------------------------------------------------------------
      // Scenario C: FIRST_SEEN -> Push into Redis Streams Queue (< 1ms)
      // -------------------------------------------------------------
      const streamId = await pushToEventQueue({
        eventId: String(eventId),
        provider,
        topic,
        entityId: String(entityId),
        payload: req.rawBody || ''
      });

      console.log(`📥 [QUEUED] Event "${eventId}" (${provider}:${topic}) pushed to stream -> Stream ID: ${streamId}`);

       // Return fast acknowledgement to provider (< 10ms total latency)
      return res.status(200).json({
        received: true,
        provider,
        eventId,
        streamId,
        status: 'QUEUED',
        timestamp: new Date().toISOString()
      });
    }catch(error:any){
      console.error(`❌ [INGESTION ERROR] Failed processing ${eventId}:`, error.message);
      // Emergency rollback: Release lock so future provider retries aren't locked out
      await releaseEventLock(provider, String(eventId));
      return res.status(500).json({
        error: 'Internal ingestion error',
        message: error.message
      });
    }
  }
);

// ==========================================
// 4. Start the HTTP Gateway
// ==========================================
app.listen(PORT, () => {
  console.log(`\n KairosHook Gateway running live on http://localhost:${PORT}`);
  console.log(`Guard 1 Security active on: POST /api/v1/webhooks/:provider\n`);
});
