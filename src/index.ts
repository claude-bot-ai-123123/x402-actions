import express from 'express';
import cors from 'cors';
import { createActionHeaders } from '@solana/actions';
import { swapRouter } from './actions/swap.js';
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
    description: 'Actions-compliant API for Solana DeFi transactions',
    endpoints: [
      'GET /actions/swap - Swap action metadata',
      'POST /actions/swap - Build swap transaction',
    ],
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
