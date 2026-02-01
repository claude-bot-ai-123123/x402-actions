import express from 'express';
import cors from 'cors';
import { createActionHeaders } from '@solana/actions';
import { swapRouter } from './actions/swap.js';
import { 
  getGaslessSwapQuote, 
  buildGaslessSwapTransaction, 
  executeGaslessSwap,
  isGaslessAvailable,
} from './actions/gasless-swap.js';
import { config } from './config.js';

// x402 imports
import { paymentMiddlewareFromConfig, x402ResourceServer } from '@x402/express';
import { ExactSvmScheme } from '@x402/svm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';

const app = express();

// Actions require specific CORS headers
const actionHeaders = createActionHeaders();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Payment', 'Payment-Signature'],
  exposedHeaders: ['X-Payment-Response', 'Payment-Response'],
}));

// Add Solana Actions headers to all responses
app.use((req, res, next) => {
  Object.entries(actionHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  next();
});

app.use(express.json());

// x402 Configuration
const X402_ENABLED = process.env.X402_ENABLED === 'true';
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://facilitator.x402.org';
const PAY_TO_ADDRESS = process.env.X402_PAY_TO || process.env.SOLANA_PAY_TO_ADDRESS;

// x402 payment middleware setup
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const svmScheme = new ExactSvmScheme();

// Solana mainnet network ID (CAIP-2 format)
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const;

// Payment-protected routes config (only used if X402_ENABLED and PAY_TO configured)
function buildPaidRoutes(payTo: string) {
  return {
    // Pay per swap quote (tiny fee)
    "POST /actions/swap": {
      accepts: {
        scheme: "exact" as const,
        price: "$0.001", // 0.1 cent per swap
        network: SOLANA_MAINNET,
        payTo,
        maxTimeoutSeconds: 60,
      },
      description: "Execute swap transaction via Raydium",
    },
    // Gasless endpoints (slightly higher fee to cover gas sponsorship economics)
    "POST /gasless/quote": {
      accepts: {
        scheme: "exact" as const, 
        price: "$0.005", // 0.5 cent per quote
        network: SOLANA_MAINNET,
        payTo,
        maxTimeoutSeconds: 60,
      },
      description: "Get gasless swap quote",
    },
    "POST /gasless/build": {
      accepts: {
        scheme: "exact" as const,
        price: "$0.01", // 1 cent per transaction build
        network: SOLANA_MAINNET,
        payTo,
        maxTimeoutSeconds: 60,
      },
      description: "Build gasless swap transaction",
    },
    "POST /gasless/execute": {
      accepts: {
        scheme: "exact" as const,
        price: "$0.02", // 2 cents per execution (covers gas + margin)
        network: SOLANA_MAINNET,
        payTo,
        maxTimeoutSeconds: 120,
      },
      description: "Execute gasless swap via Kora",
    },
  };
}

// Apply x402 middleware if enabled
if (X402_ENABLED && PAY_TO_ADDRESS) {
  console.log('🔐 x402 payment gating ENABLED');
  console.log(`   Facilitator: ${FACILITATOR_URL}`);
  console.log(`   Pay to: ${PAY_TO_ADDRESS}`);
  
  const paidRoutes = buildPaidRoutes(PAY_TO_ADDRESS);
  app.use(paymentMiddlewareFromConfig(
    paidRoutes,
    facilitatorClient,
    [{ network: SOLANA_MAINNET, server: svmScheme }],
  ));
} else {
  console.log('⚠️  x402 payment gating DISABLED (set X402_ENABLED=true and X402_PAY_TO to enable)');
}

// Health check (always free)
app.get('/', (req, res) => {
  res.json({
    name: 'x402-actions',
    version: '0.2.0',
    description: 'Actions-compliant API for Solana DeFi with x402 payment gating',
    x402: {
      enabled: X402_ENABLED,
      facilitator: FACILITATOR_URL,
      payTo: PAY_TO_ADDRESS || 'not configured',
    },
    endpoints: {
      free: [
        'GET / - Health check',
        'GET /actions.json - Actions manifest',
        'GET /actions/swap - Swap action metadata',
        'GET /gasless/status - Gasless service status',
      ],
      paid: X402_ENABLED ? [
        'POST /actions/swap - Build swap tx ($0.001)',
        'POST /gasless/quote - Get quote ($0.005)',
        'POST /gasless/build - Build tx ($0.01)',
        'POST /gasless/execute - Execute ($0.02)',
      ] : ['(x402 disabled - all endpoints free)'],
    },
    howToPay: X402_ENABLED ? {
      description: 'No API key needed. Just pay per request.',
      flow: [
        '1. POST to paid endpoint → receive 402 + payment requirements',
        '2. Sign USDC payment with your wallet',
        '3. Retry with Payment-Signature header → receive response',
      ],
      clientLibs: [
        'npm install @x402/fetch - Automatic payment wrapping',
        'npm install @x402/svm/client - Solana client',
      ],
    } : null,
  });
});

// Actions.json for blink discovery (always free)
app.get('/actions.json', (req, res) => {
  res.json({
    rules: [
      { pathPattern: '/actions/swap', apiPath: '/actions/swap' },
      { pathPattern: '/actions/swap/**', apiPath: '/actions/swap/**' },
    ],
  });
});

// Mount action routers
app.use('/actions/swap', swapRouter);

// Gasless swap endpoints (via Kora)
app.get('/gasless/status', async (req, res) => {
  try {
    const status = await isGaslessAvailable();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/gasless/quote', async (req, res) => {
  try {
    const { inputMint, outputMint, amount, userWallet, slippage, feeToken } = req.body;
    
    if (!inputMint || !outputMint || !amount || !userWallet) {
      return res.status(400).json({ 
        error: 'Missing required fields: inputMint, outputMint, amount, userWallet' 
      });
    }
    
    const quote = await getGaslessSwapQuote({
      inputMint,
      outputMint,
      amount,
      userWallet,
      slippage,
      feeToken,
    });
    
    res.json(quote);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/gasless/build', async (req, res) => {
  try {
    const { inputMint, outputMint, amount, userWallet, slippage, feeToken } = req.body;
    
    if (!inputMint || !outputMint || !amount || !userWallet) {
      return res.status(400).json({ 
        error: 'Missing required fields: inputMint, outputMint, amount, userWallet' 
      });
    }
    
    const result = await buildGaslessSwapTransaction({
      inputMint,
      outputMint,
      amount,
      userWallet,
      slippage,
      feeToken,
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/gasless/execute', async (req, res) => {
  try {
    const { inputMint, outputMint, amount, userWallet, slippage, feeToken, signedTransaction } = req.body;
    
    if (!signedTransaction) {
      return res.status(400).json({ error: 'Missing signedTransaction' });
    }
    
    const result = await executeGaslessSwap(
      { inputMint, outputMint, amount, userWallet, slippage, feeToken },
      signedTransaction
    );
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n🚀 x402-actions server running on port ${PORT}`);
  console.log(`   Actions endpoint: http://localhost:${PORT}/actions/swap`);
  if (X402_ENABLED) {
    console.log(`   Payment: USDC on Solana mainnet`);
    console.log(`   No API keys - agents pay per request\n`);
  }
});
