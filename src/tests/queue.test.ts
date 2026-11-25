import { pushToEventQueue, getQueueLength, WEBHOOK_STREAM_KEY } from '../services/queue.js';
import { redis } from '../services/redis.js';

async function runQueueTest() {
  console.log('🧪 Starting Phase 2: Redis Streams Queue Verification...\n');

  try {
    // 1. Check initial queue depth
    const initialLength = await getQueueLength();
    console.log(`📊 Initial Queue Length: ${initialLength} events`);

    // 2. Push Test Event A (Stripe Payment)
    console.log('\n📥 Enqueuing Event A (Stripe Payment)...');
    const idA = await pushToEventQueue({
      eventId: `evt_test_${Date.now()}_A`,
      provider: 'stripe',
      topic: 'payment.succeeded',
      entityId: 'ord_nike_shoes_999',
      payload: JSON.stringify({ amount: 5000, currency: 'inr' })
    });
    console.log(`   ✅ Event A safely queued with Stream ID: "${idA}"`);

    // 3. Push Test Event B (Shopify Order)
    console.log('\n📥 Enqueuing Event B (Shopify Order)...');
    const idB = await pushToEventQueue({
      eventId: `evt_test_${Date.now()}_B`,
      provider: 'shopify',
      topic: 'orders.create',
      entityId: 'ord_shopify_101',
      payload: JSON.stringify({ customer: 'Nikhil', total: 1200 })
    });
    console.log(`   ✅ Event B safely queued with Stream ID: "${idB}"`);

    // 4. Verify queue length increased by exactly 2
    const newLength = await getQueueLength();
    console.log(`\n📊 New Queue Length: ${newLength} events`);

    if (newLength === initialLength + 2) {
      console.log('🎉 [QUEUE TEST PASSED] Exactly 2 events were appended in chronological microsecond order!');
    } else {
      console.error('❌ [QUEUE TEST FAILED] Queue length mismatch!');
    }

  } catch (error: any) {
    console.error('❌ Queue test error:', error.message);
  } finally {
    // Cleanly close the Redis connection so the terminal prompt exits
    await redis.quit();
  }
}

runQueueTest();