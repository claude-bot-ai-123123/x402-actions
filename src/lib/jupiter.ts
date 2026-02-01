import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config.js';

// Jupiter API - requires API key from portal.jup.ag
const JUPITER_API_BASE = 'https://api.jup.ag/swap/v1';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';

const connection = new Connection(config.rpcUrl, 'confirmed');

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

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapParams {
  userWallet: string;
  inputMint: string;
  outputMint: string;
  amount: number;          // Human readable amount
  slippageBps?: number;    // Default 50 (0.5%)
  priorityFee?: number;    // Priority fee in lamports
}

export interface JupiterSwapResult {
  quote: JupiterQuote;
  transaction: string;     // Base64 encoded transaction
  inputAmount: string;     // Human readable
  outputAmount: string;    // Human readable
  priceImpact: string;
  route: string;           // Human readable route description
}

/**
 * Get a swap quote from Jupiter
 */
export async function getJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}): Promise<JupiterQuote> {
  const { inputMint, outputMint, amount, slippageBps = 50 } = params;
  
  const inputDecimals = await getTokenDecimals(inputMint);
  const amountLamports = Math.floor(amount * 10 ** inputDecimals);
  
  const url = new URL(`${JUPITER_API_BASE}/quote`);
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amountLamports.toString());
  url.searchParams.set('slippageBps', slippageBps.toString());
  
  const headers: Record<string, string> = {};
  if (JUPITER_API_KEY) {
    headers['x-api-key'] = JUPITER_API_KEY;
  }
  
  const response = await fetch(url.toString(), { headers });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jupiter quote failed: ${error}`);
  }
  
  return response.json() as Promise<JupiterQuote>;
}

/**
 * Build a swap transaction using Jupiter
 * Returns unsigned transaction for user to sign
 */
export async function buildJupiterSwapTransaction(
  params: JupiterSwapParams
): Promise<JupiterSwapResult> {
  const { 
    userWallet, 
    inputMint, 
    outputMint, 
    amount, 
    slippageBps = 50,
    priorityFee,
  } = params;
  
  // Get quote first
  const quote = await getJupiterQuote({
    inputMint,
    outputMint,
    amount,
    slippageBps,
  });
  
  // Build swap transaction
  const swapHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (JUPITER_API_KEY) {
    swapHeaders['x-api-key'] = JUPITER_API_KEY;
  }
  
  const swapResponse = await fetch(`${JUPITER_API_BASE}/swap`, {
    method: 'POST',
    headers: swapHeaders,
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: userWallet,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: priorityFee || 'auto',
    }),
  });
  
  if (!swapResponse.ok) {
    const error = await swapResponse.text();
    throw new Error(`Jupiter swap build failed: ${error}`);
  }
  
  const swapResult = await swapResponse.json() as { swapTransaction: string };
  
  // Get decimals for human readable amounts
  const [inputDecimals, outputDecimals] = await Promise.all([
    getTokenDecimals(inputMint),
    getTokenDecimals(outputMint),
  ]);
  
  const inputAmount = (parseInt(quote.inAmount) / 10 ** inputDecimals).toFixed(inputDecimals);
  const outputAmount = (parseInt(quote.outAmount) / 10 ** outputDecimals).toFixed(outputDecimals);
  
  // Build route description
  const route = quote.routePlan
    .map(r => r.swapInfo.label)
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .join(' → ');
  
  return {
    quote,
    transaction: swapResult.swapTransaction,
    inputAmount,
    outputAmount,
    priceImpact: quote.priceImpactPct,
    route: route || 'Direct',
  };
}
