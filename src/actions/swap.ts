import { Router, Request, Response } from 'express';
import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';
import { buildSwapTransaction } from '../lib/raydium.js';
import { config } from '../config.js';

export const swapRouter = Router();

// GET - Return action metadata
swapRouter.get('/', (req: Request, res: Response) => {
  const response: ActionGetResponse = {
    type: 'action',
    icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    title: 'Swap Tokens',
    description: 'Swap tokens on Solana using Raydium. Specify input token, output token, and amount.',
    label: 'Swap',
    links: {
      actions: [
        {
          type: 'transaction',
          label: 'Swap SOL → USDC',
          href: '/actions/swap?inputMint=SOL&outputMint=USDC&amount={amount}',
          parameters: [
            {
              name: 'amount',
              label: 'Amount of SOL to swap',
              required: true,
            },
          ],
        },
        {
          type: 'transaction',
          label: 'Swap USDC → SOL',
          href: '/actions/swap?inputMint=USDC&outputMint=SOL&amount={amount}',
          parameters: [
            {
              name: 'amount',
              label: 'Amount of USDC to swap',
              required: true,
            },
          ],
        },
        {
          type: 'transaction',
          label: 'Custom Swap',
          href: '/actions/swap?inputMint={inputMint}&outputMint={outputMint}&amount={amount}',
          parameters: [
            {
              name: 'inputMint',
              label: 'Input token (symbol or mint address)',
              required: true,
            },
            {
              name: 'outputMint',
              label: 'Output token (symbol or mint address)',
              required: true,
            },
            {
              name: 'amount',
              label: 'Amount to swap',
              required: true,
            },
          ],
        },
      ],
    },
  };

  res.json(response);
});

// OPTIONS - CORS preflight
swapRouter.options('/', (req: Request, res: Response) => {
  res.status(200).end();
});

// POST - Build and return swap transaction
swapRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { account } = req.body as ActionPostRequest;
    const { inputMint, outputMint, amount, slippage } = req.query;

    if (!account) {
      return res.status(400).json({ error: 'Missing account in request body' });
    }

    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({ 
        error: 'Missing required query parameters: inputMint, outputMint, amount' 
      });
    }

    // Resolve token symbols to mints
    const resolvedInputMint = config.getTokenMint(inputMint as string) || (inputMint as string);
    const resolvedOutputMint = config.getTokenMint(outputMint as string) || (outputMint as string);
    const slippageBps = slippage ? parseInt(slippage as string, 10) : 50; // Default 0.5%

    console.log(`Building swap: ${amount} ${inputMint} → ${outputMint} for ${account}`);

    // Build the swap transaction using Raydium
    const transaction = await buildSwapTransaction({
      owner: account,
      inputMint: resolvedInputMint,
      outputMint: resolvedOutputMint,
      amount: parseFloat(amount as string),
      slippageBps,
    });

    const response: ActionPostResponse = {
      type: 'transaction',
      transaction,
      message: `Swap ${amount} ${inputMint} for ${outputMint}`,
    };

    res.json(response);
  } catch (error) {
    console.error('Swap error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
