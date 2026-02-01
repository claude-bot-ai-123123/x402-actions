/**
 * Kora client - direct HTTP calls to Kora RPC
 * No SDK dependency, just JSON-RPC over HTTP
 */

// Kora RPC URL - default to local, can be overridden via env
const KORA_RPC_URL = process.env.KORA_RPC_URL || 'http://localhost:8181';
const KORA_API_KEY = process.env.KORA_API_KEY;

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KORA_API_KEY) {
    headers['x-api-key'] = KORA_API_KEY;
  }
  
  const response = await fetch(KORA_RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Kora RPC failed: ${response.status} ${response.statusText}`);
  }
  
  const json = await response.json() as JsonRpcResponse<T>;
  
  if (json.error) {
    throw new Error(`Kora RPC error: ${json.error.message}`);
  }
  
  return json.result as T;
}

/**
 * Get the Kora fee payer address
 */
export async function getKoraFeePayer(): Promise<string> {
  const result = await rpcCall<{ signer_address: string }>('getPayerSigner', {});
  return result.signer_address;
}

/**
 * Get supported tokens for fee payment
 */
export async function getKoraSupportedTokens(): Promise<string[]> {
  const result = await rpcCall<{ tokens: string[] }>('getSupportedTokens', {});
  return result.tokens;
}

/**
 * Estimate transaction fee in a specific token
 */
export async function estimateFee(
  transaction: string, 
  feeToken: string
): Promise<{ feeInLamports: string; feeInToken: string }> {
  const result = await rpcCall<{ fee_in_lamports: number; fee_in_token: number }>(
    'estimateTransactionFee',
    { transaction, fee_token: feeToken }
  );
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
  const result = await rpcCall<{ signer_pubkey: string; signed_transaction: string }>(
    'signTransaction',
    { transaction }
  );
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
  signature: string;
  signerPubkey: string;
}> {
  const result = await rpcCall<{ signer_pubkey: string; signature: string }>(
    'signAndSendTransaction',
    { transaction }
  );
  return {
    signature: result.signature,
    signerPubkey: result.signer_pubkey,
  };
}
