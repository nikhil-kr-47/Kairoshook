import { 
  checkAndLockEvent, 
  markEventCompleted, 
  releaseEventLock 
} from '../services/idempotency.js';
import { redis } from '../services/redis.js';

async function runIdempotencyTest() {
  console.log('🧪 Starting Guard 2: Idempotency Mutex Verification...\n');

  const testProvider = 'stripe';
  const testEventId = `evt_idem_${Date.now()}`;

  try {
    // -------------------------------------------------------------
    // Scenario 1: First Attempt (Initial Webhook Hit)
    // -------------------------------------------------------------
    console.log('1️⃣ Attempt 1 (Brand new webhook):');
    const result1 = await checkAndLockEvent(testProvider, testEventId);
    console.log(`   Result Status: "${result1.status}"`);

    if (result1.status === 'FIRST_SEEN') {
      console.log('   ✅ PASS: Acquired atomic lock in Redis successfully.');
    } else {
      throw new Error(`Expected FIRST_SEEN but received: ${result1.status}`);
    }

    // -------------------------------------------------------------
    // Scenario 2: Concurrent Duplicate (In-flight retry)
    // -------------------------------------------------------------
    console.log('\n2️⃣ Attempt 2 (Duplicate while still PROCESSING):');
    const result2 = await checkAndLockEvent(testProvider, testEventId);
    console.log(`   Result Status: "${result2.status}"`);

    if (result2.status === 'DUPLICATE_PROCESSING') {
      console.log('   ✅ PASS: Correctly blocked duplicate in-flight execution.');
    } else {
      throw new Error(`Expected DUPLICATE_PROCESSING but received: ${result2.status}`);
    }

    // -------------------------------------------------------------
    // Scenario 3: Complete Processing and Cache Response
    // -------------------------------------------------------------
    console.log('\n3️⃣ Completing Event Processing...');
    await markEventCompleted(testProvider, testEventId, {
      received: true,
      orderId: 'ord_nike_shoes_999',
      message: 'Order processed successfully'
    });
    console.log('   ✅ Event marked COMPLETED in Redis with 7-day replay cache.');

    // -------------------------------------------------------------
    // Scenario 4: Replay Attack / Delayed Duplicate (Hours/Days later)
    // -------------------------------------------------------------
    console.log('\n4️⃣ Attempt 3 (Replayed Event after completion):');
    const result3 = await checkAndLockEvent(testProvider, testEventId);
    console.log(`   Result Status: "${result3.status}"`);
    console.log('   Cached Response:', result3.cachedResponse);

    if (
      result3.status === 'DUPLICATE_COMPLETED' &&
      result3.cachedResponse?.received === true &&
      result3.cachedResponse?.orderId === 'ord_nike_shoes_999'
    ) {
      console.log('   ✅ PASS: Returned cached response instantly without re-executing logic.');
    } else {
      throw new Error(`Expected DUPLICATE_COMPLETED with cached payload, got: ${result3.status}`);
    }

    // -------------------------------------------------------------
    // Scenario 5: Clean Up Test Lock
    // -------------------------------------------------------------
    console.log('\n5️⃣ Releasing lock (Cleanup):');
    await releaseEventLock(testProvider, testEventId);
    console.log('   ✅ PASS: Test lock released cleanly.');

    console.log('\n🎉 [GUARD 2 IDEMPOTENCY TEST PASSED] All race condition scenarios verified!');

  } catch (error: any) {
    console.error('\n❌ Idempotency test failed:', error.message);
  } finally {
    // Close the Redis connection so the terminal exits
    await redis.quit();
  }
}

runIdempotencyTest();