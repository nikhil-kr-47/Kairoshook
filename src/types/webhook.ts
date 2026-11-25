export type SupportedProvider = 'stripe' | 'shopify' | 'github' | (string & {});
export type IdempotencyStatus= 'FIRST_SEEN' | 'DUPLICATE_PROCESSING' | 'DUPLICATE_COMPLETED';

export interface IncomingWebhookRequest{
    provider: SupportedProvider;
    rawBody: string;
    signature: string;
    secret: string;
}

export interface VerificationResult{
    isValid : boolean;
    error?:string;

}

//For our redis queue
export interface QueuedEventData {
  eventId: string;
  provider: SupportedProvider;
  topic: string;
  entityId?: string;
  payload: string; // Serialized raw JSON
}

export interface IdempotencyRecordPayload{
    status:'PROCESSING' | 'COMPLETED';
     lockedAt: string;
     completedAt?: string;
     response?:Record<string,unknown>;
}

export interface IdempotencyCheckResult{
    status: IdempotencyStatus;
    cachedResponse?: Record<string, unknown>;
}