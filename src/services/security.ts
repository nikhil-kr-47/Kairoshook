import crypto from 'node:crypto';

import type {IncomingWebhookRequest,VerificationResult} from "../types/webhook.js";

export function verifyWebhookSignature(req:IncomingWebhookRequest):VerificationResult{
    const {rawBody,signature,secret}=req;

    // 1. Guard check: Ensure required fields are not empty
  if (!rawBody || !signature || !secret ) {
    return {
      isValid: false,
      error: 'Missing required verification parameters (rawBody, signature, secret).'
    };
  }

    try {
    // 2. Compute the expected HMAC-SHA256 hex digest using our shared secret
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

      const cleanSignature=signature.startsWith("sha256=")
      ?signature.slice(7)
      :signature;

      // 4. Length check before timingSafeEqual (buffers must be equal length)
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const providedBuffer = Buffer.from(cleanSignature, 'hex');
    if (expectedBuffer.length !== providedBuffer.length) {
      return { isValid: false, error: 'Signature length mismatch.' };
    }

    // 5. Constant-time comparison (prevents timing attacks)
    const isMatch = crypto.timingSafeEqual(expectedBuffer, providedBuffer);
    return {
      isValid: isMatch,
      error: isMatch ? undefined : 'Invalid signature: payload may have been tampered with.'
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: `Verification failed with error: ${err.message}`
    };
  }
}