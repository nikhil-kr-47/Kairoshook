export type SupportedProvider = 'stripe' | 'shopify' | 'github' | (string & {});

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