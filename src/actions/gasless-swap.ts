import { config } from '../config.js';
import { 
  getKoraFeePayer, 
  signAndSendWithKora,
  estimateFee,
  getKoraSupportedTokens,
} from '../lib/kora.js';
import { buildJupiterSwapTransaction, getJupiterQuote } from '../lib/jupiter.js';

// USDC mint on mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface GaslessSwapRequest {
  inputMint: string;
  outputMint: string;
  amount: string;
  userWallet: string;
  slippage?: number;
  feeToken?: string; // Token to pay gas fees in (default: USDC)
}

export interface GaslessSwapQuoteResponse {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  priceImpact: string;
  route: string;
  gasFee: {
    token: string;
    amount: string;
    amountInLamports: string;
  };
  feePayer: string;
  expiresAt: number;
}

export interface GaslessSwapResponse {
  signature: string;
  explorerUrl: string;
}

/**
 * Get a quote for a gasless swap including the gas fee
 * Uses Jupiter for best price across all DEXs
 */
export async function getGaslessSwapQuote(
  request: GaslessSwapRequest
): Promise<GaslessSwapQuoteResponse> {
  const feeToken = request.feeToken || USDC_MINT;
  const slippageBps = Math.round((request.slippage || 0.5) * 100);
  
  // Get Kora fee payer
  const feePayer = await getKoraFeePayer();
  
  // Build swap transaction via Jupiter to get quote and estimate gas
  const jupiterResult = await buildJupiterSwapTransaction({
    userWallet: request.userWallet,
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: parseFloat(request.amount),
    slippageBps,
  });
  
  // Estimate fee in the chosen token
  const feeEstimate = await estimateFee(jupiterResult.transaction, feeToken);
  
  return {
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    inputAmount: jupiterResult.inputAmount,
    outputAmount: jupiterResult.outputAmount,
    priceImpact: jupiterResult.priceImpact,
    route: jupiterResult.route,
    gasFee: {
      token: feeToken,
      amount: feeEstimate.feeInToken,
      amountInLamports: feeEstimate.feeInLamports,
    },
    feePayer,
    expiresAt: Date.now() + 30000, // 30 second expiry
  };
}

/**
 * Execute a gasless swap
 * The user signs the transaction, Kora pays the gas fee
 */
export async function executeGaslessSwap(
  request: GaslessSwapRequest,
  userSignedTransaction: string // Base64 encoded transaction signed by user
): Promise<GaslessSwapResponse> {
  // Sign with Kora and send
  const result = await signAndSendWithKora(userSignedTransaction);
  
  return {
    signature: result.signature,
    explorerUrl: `https://solscan.io/tx/${result.signature}`,
  };
}

/**
 * Build a gasless swap transaction for user signing
 * Uses Jupiter for routing, Kora for fee payment
 * Returns a transaction that the user needs to sign
 */
export async function buildGaslessSwapTransaction(
  request: GaslessSwapRequest
): Promise<{
  transaction: string; // Base64 encoded transaction
  quote: GaslessSwapQuoteResponse;
}> {
  const feeToken = request.feeToken || USDC_MINT;
  const slippageBps = Math.round((request.slippage || 0.5) * 100);
  
  // Get Kora fee payer
  const feePayer = await getKoraFeePayer();
  
  // Build swap transaction via Jupiter
  const jupiterResult = await buildJupiterSwapTransaction({
    userWallet: request.userWallet,
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: parseFloat(request.amount),
    slippageBps,
  });
  
  // Estimate fee
  const feeEstimate = await estimateFee(jupiterResult.transaction, feeToken);
  
  const quoteResponse: GaslessSwapQuoteResponse = {
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    inputAmount: jupiterResult.inputAmount,
    outputAmount: jupiterResult.outputAmount,
    priceImpact: jupiterResult.priceImpact,
    route: jupiterResult.route,
    gasFee: {
      token: feeToken,
      amount: feeEstimate.feeInToken,
      amountInLamports: feeEstimate.feeInLamports,
    },
    feePayer,
    expiresAt: Date.now() + 30000,
  };
  
  return {
    transaction: jupiterResult.transaction,
    quote: quoteResponse,
  };
}

/**
 * Check if Kora gasless service is available
 */
export async function isGaslessAvailable(): Promise<{
  available: boolean;
  feePayer: string | null;
  supportedTokens: string[];
  swapBackend: string;
}> {
  try {
    const [feePayer, supportedTokens] = await Promise.all([
      getKoraFeePayer(),
      getKoraSupportedTokens(),
    ]);
    
    return {
      available: true,
      feePayer,
      supportedTokens,
      swapBackend: 'Jupiter (aggregates Raydium, Orca, Meteora, etc.)',
    };
  } catch (error) {
    return {
      available: false,
      feePayer: null,
      supportedTokens: [],
      swapBackend: 'Jupiter',
    };
  }
}
