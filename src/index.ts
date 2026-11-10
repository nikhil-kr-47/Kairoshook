import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import {
  enforceWebhookSignature,
  type AuthenticatedWebhookRequest
} from './middlewares/verifySignature.js';

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
// 3. The Webhook Ingestion Route (Protected by Guard 1)
// ==========================================
app.post(
  '/api/v1/webhooks/:provider',
  enforceWebhookSignature, // <-- Guard 1 HMAC Signature Verification!
  (req: AuthenticatedWebhookRequest, res: Response) => {
    const { provider } = req.params;
    const event = req.body;

    console.log(`\n🎉 [GUARD 1 PASSED] Verified authentic webhook from: ${provider}`);
    console.log(`📦 Payload:`, JSON.stringify(event, null, 2));

    // Return instant acknowledgement to provider (< 15ms)
    res.status(200).json({
      received: true,
      provider,
      status: 'AUTHENTICATED_AND_BUFFERED',
      timestamp: new Date().toISOString()
    });
  }
);

// ==========================================
// 4. Start the HTTP Gateway
// ==========================================
app.listen(PORT, () => {
  console.log(`\n🚀 KairosHook Gateway running live on http://localhost:${PORT}`);
  console.log(`🛡️  Guard 1 Security active on: POST /api/v1/webhooks/:provider\n`);
});
