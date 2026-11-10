import type {Request,Response,NextFunction} from 'express';

import { verifyWebhookSignature } from "../services/security.js";
import { SupportedProvider } from '../types/webhook.js';

// Extend Express Request type to include the rawBody string
export interface AuthenticatedWebhookRequest extends Request {
  rawBody?: string;
}

export function enforceWebhookSignature(req:AuthenticatedWebhookRequest,res:Response,next:NextFunction):void{
   const provider=(req.params.provider as SupportedProvider) || "custom";

   // 2. Extract signature header (supports standard providers)
  const signature =
    (req.headers['x-signature'] as string) ||
    (req.headers['stripe-signature'] as string) ||
    (req.headers['x-hub-signature-256'] as string);

    if (!signature) {
    res.status(401).json({
      error: 'Unauthorized: Missing webhook signature header.'
    });
    return;
  }
    
    // 3. Retrieve the shared secret key from environment
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({
      error: 'Server Misconfiguration: WEBHOOK_SECRET is not defined in .env.'
    });
    return;
  }

  if (!req.rawBody) {
    res.status(400).json({
      error: 'Bad Request: Raw body missing for cryptographic verification.'
    });
    return;
  }

  // 5. Run the timing-safe HMAC cryptographic verification
  const verification = verifyWebhookSignature({
    provider,
    rawBody: req.rawBody,
    signature,
    secret
  });

  if (!verification.isValid) {
    res.status(401).json({
      error: `Unauthorized: ${verification.error}`
    });
    return;
  }

  // Verification passed! Move to next middleware or route handler
  next();
}