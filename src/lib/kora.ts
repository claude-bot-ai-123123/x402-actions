import { KoraClient } from '@solana/kora';

// Kora RPC URL - default to local, can be overridden via env
const KORA_RPC_URL = process.env.KORA_RPC_URL || 'http://localhost:8181';
const KORA_API_KEY = process.env.KORA_API_KEY;

let koraClient: KoraClient | null = null;

export function getKoraClient(): KoraClient {
  if (!koraClient) {
    koraClient = new KoraClient({
      rpcUrl: KORA_RPC_URL,
      apiKey: KORA_API_KEY,
    });
  }
  return koraClient;
}

/**
 * Get the Kora fee payer address
 */
export async function getKoraFeePayer(): Promise<string> {
  const kora = getKoraClient();
  const response = await kora.getPayerSigner();
  return response.signer_address;
}

/**
 * Get supported tokens for fee payment
 */
export async function getKoraSupportedTokens(): Promise<string[]> {
  const kora = getKoraClient();
  const response = await kora.getSupportedTokens();
  return response.tokens;
}

/**
 * Estimate transaction fee in a specific token
 */
export async function estimateFee(
  transaction: string, 
  feeToken: string
): Promise<{ feeInLamports: string; feeInToken: string }> {
  const kora = getKoraClient();
  const result = await kora.estimateTransactionFee({
    transaction,
    fee_token: feeToken,
  });
  return {
    feeInLamports: String(result.fee_in_lamports),
    feeInToken: String(result.fee_in_token),
  };
}

/**
 * Sign a transaction with Kora (fee payer signature only)
 */
export async function signWithKora(transaction: string): Promise<{
  signerPubkey: string;
  signedTransaction: string;
}> {
  const kora = getKoraClient();
  const result = await kora.signTransaction({ transaction });
  return {
    signerPubkey: result.signer_pubkey,
    signedTransaction: result.signed_transaction,
  };
}

/**
 * Sign and send a transaction via Kora
 * The transaction should already be signed by the user
 */
export async function signAndSendWithKora(transaction: string): Promise<{
  signerPubkey: string;
  signedTransaction: string;
}> {
  const kora = getKoraClient();
  const result = await kora.signAndSendTransaction({ transaction });
  return {
    signerPubkey: result.signer_pubkey,
    signedTransaction: result.signed_transaction,
  };
}
