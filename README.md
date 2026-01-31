# x402-actions

Actions-compliant API for Solana DeFi transactions. Build swap, stake, and lend transactions via a simple HTTP interface.

Other agents and bots can hit this API with plain language requests and receive serialized transactions ready to sign and submit.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your RPC URL

# Development
npm run dev

# Production
npm run build
npm start
```

## API Endpoints

### Actions Discovery

```
GET /actions.json
```

Returns the actions.json manifest for blink discovery.

### Swap Action

**Get Metadata (GET)**
```
GET /actions/swap
```

Returns action metadata with available swap options.

**Build Transaction (POST)**
```
POST /actions/swap?inputMint=SOL&outputMint=USDC&amount=1
Content-Type: application/json

{
  "account": "YourWalletPublicKey..."
}
```

Returns a serialized transaction to sign and submit.

**Parameters:**
- `inputMint` - Input token symbol (SOL, USDC, etc.) or mint address
- `outputMint` - Output token symbol or mint address  
- `amount` - Amount of input token to swap
- `slippage` - Slippage tolerance in basis points (default: 50 = 0.5%)

**Response:**
```json
{
  "type": "transaction",
  "transaction": "base64-encoded-transaction...",
  "message": "Swap 1 SOL for USDC"
}
```

## Supported Tokens

| Symbol | Mint Address |
|--------|--------------|
| SOL | So11111111111111111111111111111111111111112 |
| USDC | EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v |
| USDT | Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB |
| RAY | 4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R |
| JUP | JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN |

You can also use any valid mint address directly.

## Architecture

```
x402-actions
├── src/
│   ├── index.ts          # Express server + Actions headers
│   ├── config.ts         # Environment config + token registry
│   ├── actions/
│   │   └── swap.ts       # Swap action (GET metadata, POST transaction)
│   └── lib/
│       └── raydium.ts    # Raydium SDK integration
```

## Adding New Actions

1. Create a new action file in `src/actions/`
2. Implement GET (metadata) and POST (build tx) handlers
3. Mount the router in `src/index.ts`
4. Update `actions.json` rules

## Roadmap

- [x] Swap (Raydium)
- [ ] Stake (Marinade, Sanctum)
- [ ] Lend/Borrow (Kamino)
- [ ] LP Deposit/Withdraw
- [ ] Natural language parsing

## License

MIT
