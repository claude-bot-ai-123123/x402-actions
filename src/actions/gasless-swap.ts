import { config } from '../config.js';
import { 
  getKoraClient, 
  getKoraFeePayer, 
  signAndSendWithKora,
  estimateFee,
  getKoraSupportedTokens,
} from '../lib/kora.js';
import { buildSwapTransaction } from '../lib/raydium.js';

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
  gasFee: {
    token: string;
    amount: string;
    amountInLamports: string;
  };
  feePayer: string;
  expiresAt: number;
}

export interface GaslessSwapResponse {
  signerPubkey: string;
  signedTransaction: string;
  explorerUrl: string;
}

/**
 * Get a quote for a gasless swap including the gas fee
 */
export async function getGaslessSwapQuote(
  request: GaslessSwapRequest
): Promise<GaslessSwapQuoteResponse> {
  const feeToken = request.feeToken || USDC_MINT;
  const slippageBps = Math.round((request.slippage || 0.5) * 100);
  
  // Get Kora fee payer
  const feePayer = await getKoraFeePayer();
  
  // Build swap transaction to estimate gas
  const swapTx = await buildSwapTransaction({
    owner: request.userWallet,
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: parseFloat(request.amount),
    slippageBps,
  });
  
  // Estimate fee in the chosen token
  const feeEstimate = await estimateFee(swapTx, feeToken);
  
  return {
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    inputAmount: request.amount,
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
    signerPubkey: result.signerPubkey,
    signedTransaction: result.signedTransaction,
    explorerUrl: `https://solscan.io/tx/${result.signerPubkey}`, // Note: This should be tx signature
  };
}

/**
 * Build a gasless swap transaction for user signing
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
  
  // Build swap transaction with user as owner
  const swapTx = await buildSwapTransaction({
    owner: request.userWallet,
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: parseFloat(request.amount),
    slippageBps,
  });
  
  // Estimate fee
  const feeEstimate = await estimateFee(swapTx, feeToken);
  
  const quoteResponse: GaslessSwapQuoteResponse = {
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    inputAmount: request.amount,
    gasFee: {
      token: feeToken,
      amount: feeEstimate.feeInToken,
      amountInLamports: feeEstimate.feeInLamports,
    },
    feePayer,
    expiresAt: Date.now() + 30000,
  };
  
  return {
    transaction: swapTx,
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
    };
  } catch (error) {
    return {
      available: false,
      feePayer: null,
      supportedTokens: [],
    };
  }
}
