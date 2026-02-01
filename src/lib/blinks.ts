/**
 * Blinks client - calls Solana Actions endpoints directly
 * No SDK dependencies, just HTTP calls to Actions-compliant APIs
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config.js';

const connection = new Connection(config.rpcUrl, 'confirmed');

// Actions endpoints
const RAYDIUM_ACTIONS_BASE = 'https://share.raydium.io/dialect/actions/swap';

// Token decimals cache
const TOKEN_DECIMALS: Record<string, number> = {
  [config.tokens.SOL]: 9,
  [config.tokens.USDC]: 6,
  [config.tokens.USDT]: 6,
  [config.tokens.RAY]: 6,
  [config.tokens.JUP]: 6,
};

async function getTokenDecimals(mint: string): Promise<number> {
  if (TOKEN_DECIMALS[mint]) {
    return TOKEN_DECIMALS[mint];
  }
  
  const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
  if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
    const decimals = mintInfo.value.data.parsed.info.decimals;
    TOKEN_DECIMALS[mint] = decimals;
    return decimals;
  }
  throw new Error(`Could not get decimals for mint: ${mint}`);
}

export interface ActionGetResponse {
  icon: string;
  title: string;
  description: string;
  label: string;
  links?: {
    actions: Array<{
      label: string;
      href: string;
      parameters?: Array<{
        name: string;
        label: string;
      }>;
    }>;
  };
}

export interface ActionPostResponse {
  transaction: string;  // Base64 encoded serialized transaction
  message?: string;
}

export interface SwapParams {
  userWallet: string;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}

export interface SwapResult {
  transaction: string;  // Base64 encoded
  message: string;
}

/**
 * Get swap action metadata from Raydium
 */
export async function getSwapActionMetadata(
  inputMint: string,
  outputMint: string
): Promise<ActionGetResponse> {
  const url = `${RAYDIUM_ACTIONS_BASE}/info/?inputMint=${inputMint}&outputMint=${outputMint}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get swap metadata: ${error}`);
  }
  
  return response.json() as Promise<ActionGetResponse>;
}

/**
 * Build a swap transaction via Raydium Actions endpoint
 * Returns a serialized transaction ready for signing
 */
export async function buildSwapTransaction(params: SwapParams): Promise<SwapResult> {
  const { userWallet, inputMint, outputMint, amount, slippageBps = 50 } = params;
  
  // Build the POST URL
  const url = new URL(`${RAYDIUM_ACTIONS_BASE}/tx`);
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amount.toString());
  if (slippageBps) {
    url.searchParams.set('slippage', (slippageBps / 100).toString()); // Convert bps to %
  }
  
  // POST with user's account
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: userWallet }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to build swap transaction: ${error}`);
  }
  
  const result = await response.json() as ActionPostResponse;
  
  // Get token symbols for message
  const inputSymbol = Object.entries(config.tokens).find(([_, v]) => v === inputMint)?.[0] || inputMint.slice(0, 8);
  const outputSymbol = Object.entries(config.tokens).find(([_, v]) => v === outputMint)?.[0] || outputMint.slice(0, 8);
  
  return {
    transaction: result.transaction,
    message: result.message || `Swap ${amount} ${inputSymbol} → ${outputSymbol} via Raydium`,
  };
}

/**
 * Generic Actions client - call any Actions endpoint
 */
export async function callAction(
  actionUrl: string,
  account: string,
  params?: Record<string, string>
): Promise<ActionPostResponse> {
  const url = new URL(actionUrl);
  
  // Add any extra params
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Action call failed: ${error}`);
  }
  
  return response.json() as Promise<ActionPostResponse>;
}

/**
 * Get Actions metadata (GET request)
 */
export async function getActionMetadata(actionUrl: string): Promise<ActionGetResponse> {
  const response = await fetch(actionUrl);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get action metadata: ${error}`);
  }
  
  return response.json() as Promise<ActionGetResponse>;
}
