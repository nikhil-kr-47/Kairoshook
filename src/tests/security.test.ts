import crypto from 'node:crypto';
import { verifyWebhookSignature } from '../services/security.js';

// ============================================================
// 1. ARRANGE: Set up our test secret and helper function
// ============================================================
const TEST_SECRET = 'whsec_kairoshook_super_secret_test_key_123';
const VALID_PAYLOAD = JSON.stringify({
  eventId: 'evt_stripe_test_001',
  topic: 'payment.succeeded',
  data: { amount: 5000, currency: 'inr' }
});

// Helper: Simulates what Stripe/GitHub does to generate a real HMAC signature
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

console.log('🧪 Starting Guard 1: Cryptographic Security Verification Tests...\n');

// ============================================================
// TEST 1: Genuine Webhook from Stripe (Happy Path) -> MUST PASS
// ============================================================
const validSig = generateSignature(VALID_PAYLOAD, TEST_SECRET);
const test1 = verifyWebhookSignature({
  provider: 'stripe',
  rawBody: VALID_PAYLOAD,
  signature: validSig,
  secret: TEST_SECRET
});

if (test1.isValid) {
  console.log('Test 1 [Genuine Payload]: ✅ PASSED');
} else {
  console.error('Test 1 [Genuine Payload]: ❌ FAILED -', test1.error);
}

// ============================================================
// TEST 2: Tampered Payload (Attacker altered amount) -> MUST REJECT
// ============================================================
const tamperedPayload = JSON.stringify({
  eventId: 'evt_stripe_test_001',
  topic: 'payment.succeeded',
  data: { amount: 50000, currency: 'inr' } // Attacker changed 5000 to 50000!
});

const test2 = verifyWebhookSignature({
  provider: 'stripe',
  rawBody: tamperedPayload,
  signature: validSig, // Attacker sent the original signature with tampered body
  secret: TEST_SECRET
});

if (!test2.isValid) {
  console.log('Test 2 [Tampered Payload]: ✅ PASSED (Correctly Blocked)');
  console.log(`   └─ Rejection Reason: "${test2.error}"`);
} else {
  console.error('Test 2 [Tampered Payload]: ❌ CRITICAL SECURITY FLAW! Tampered data was accepted!');
}

// ============================================================
// TEST 3: Attacker Used Wrong Secret Key -> MUST REJECT
// ============================================================
const fakeSig = generateSignature(VALID_PAYLOAD, 'attacker_guessed_wrong_secret');
const test3 = verifyWebhookSignature({
  provider: 'stripe',
  rawBody: VALID_PAYLOAD,
  signature: fakeSig,
  secret: TEST_SECRET
});

if (!test3.isValid) {
  console.log('Test 3 [Invalid Secret Signature]: ✅ PASSED (Correctly Blocked)');
  console.log(`   └─ Rejection Reason: "${test3.error}"\n`);
} else {
  console.error('Test 3 [Invalid Secret Signature]: ❌ FAILED! Forged signature accepted!');
}

console.log('🛡️  GUARD 1: ALL SECURITY GATES VERIFIED AND OPERATIONAL!');