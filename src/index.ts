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

const app = express();

// Actions require specific CORS headers
const actionHeaders = createActionHeaders();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

// Add Solana Actions headers to all responses
app.use((req, res, next) => {
  Object.entries(actionHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  next();
});

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'x402-actions',
    version: '0.1.0',
    description: 'Actions-compliant API for Solana DeFi transactions with gasless support',
    endpoints: {
      actions: [
        'GET /actions/swap - Swap action metadata',
        'POST /actions/swap - Build swap transaction',
      ],
      gasless: [
        'GET /gasless/status - Check if gasless service is available',
        'POST /gasless/quote - Get swap quote with gas fee estimate',
        'POST /gasless/build - Build transaction for user signing',
        'POST /gasless/execute - Execute signed transaction via Kora',
      ],
    },
  });
});

// Actions.json for blink discovery
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
  console.log(`x402-actions server running on port ${PORT}`);
  console.log(`Actions endpoint: http://localhost:${PORT}/actions/swap`);
});
