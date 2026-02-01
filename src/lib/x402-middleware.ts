/**
 * Simple x402 Payment Middleware
 * 
 * Lightweight 402 payment gating without complex SDK dependencies.
 * Uses Kora for payment verification and settlement.
 */

import { Request, Response, NextFunction } from 'express';

const KORA_RPC_URL = process.env.KORA_RPC_URL || 'http://localhost:8181';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;

interface RoutePrice {
  usdCents: number;
  description: string;
}

interface X402Config {
  payTo: string;
  routes: Record<string, RoutePrice>;
}

/**
 * Creates x402 payment middleware
 */
export function x402Middleware(config: X402Config) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const routeKey = `${req.method} ${req.path}`;
    const priceConfig = config.routes[routeKey];
    
    // If route isn't configured for payment, pass through
    if (!priceConfig) {
      return next();
    }

    const paymentHeader = req.headers['x-payment'] || req.headers['payment-signature'];
    
    // No payment header - return 402 with requirements
    if (!paymentHeader) {
      const amountAtomicUnits = Math.ceil(priceConfig.usdCents * Math.pow(10, USDC_DECIMALS) / 100);
      
      const paymentRequirements = {
        x402Version: 1,
        scheme: 'exact',
        network: 'solana',
        payTo: config.payTo,
        amount: amountAtomicUnits.toString(),
        asset: USDC_MINT,
        description: priceConfig.description,
        maxTimeoutSeconds: 60,
        extra: {
          feePayer: process.env.KORA_FEE_PAYER || config.payTo,
        },
      };

      const encoded = Buffer.from(JSON.stringify(paymentRequirements)).toString('base64');
      
      res.status(402)
        .set('X-Payment-Required', encoded)
        .set('Payment-Required', encoded)
        .json({
          error: 'Payment Required',
          message: `This endpoint requires payment of $${(priceConfig.usdCents / 100).toFixed(4)} USDC`,
          paymentRequirements,
        });
      return;
    }

    // Payment header present - verify and settle
    try {
      const paymentPayload = JSON.parse(
        Buffer.from(paymentHeader as string, 'base64').toString('utf-8')
      );

      const transaction = paymentPayload.payload?.transaction || paymentPayload.transaction;
      
      if (!transaction) {
        return res.status(400).json({ 
          error: 'Invalid payment payload',
          message: 'Missing transaction in payment header'
        });
      }

      // Verify and settle via Kora
      const koraResponse = await fetch(KORA_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'signAndSendTransaction',
          params: {
            transaction,
            sendOptions: { 
              skipPreflight: false,
              maxRetries: 3,
            },
          },
        }),
      });

      const result = await koraResponse.json() as { error?: { message?: string }; result?: { signature?: string } };
      
      if (result.error) {
        return res.status(402).json({
          error: 'Payment failed',
          message: result.error.message || 'Kora rejected the transaction',
          details: result.error,
        });
      }

      // Payment successful - attach receipt and continue
      (req as any).x402Payment = {
        transactionHash: result.result?.signature,
        network: 'solana',
        amount: priceConfig.usdCents,
      };

      // Set payment response header
      res.set('X-Payment-Response', Buffer.from(JSON.stringify({
        success: true,
        transactionHash: result.result?.signature,
      })).toString('base64'));

      next();
    } catch (error: any) {
      console.error('x402 payment error:', error);
      res.status(400).json({
        error: 'Invalid payment',
        message: error.message,
      });
    }
  };
}

export default x402Middleware;
