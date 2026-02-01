# x402-actions

Actions-compliant API for Solana DeFi transactions with gasless support via [Kora](https://github.com/kora-labs/kora).

Build swap, stake, and lend transactions via a simple HTTP interface. Users can pay gas fees in USDC instead of SOL.

**Swap Backend:** Raydium Actions (blinks) — no SDK dependencies, pure HTTP calls to Actions-compliant endpoints.

## Features

- **Actions-compliant** - Works with Solana Blinks and Actions standard
- **Gasless transactions** - Users pay fees in USDC via Kora fee payer
- **Simple API** - HTTP endpoints return serialized transactions ready to sign

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your RPC URL and Kora private key

# Development (API only)
npm run dev

# Production
npm run build
npm start
```

## Environment Variables

Create a `.env` file:

```env
# Server port
PORT=3000

# Solana RPC URL (use a reliable RPC for production)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Kora fee payer private key (base58 encoded)
# This wallet pays gas fees and gets reimbursed in USDC
KORA_PRIVATE_KEY=your_base58_private_key_here

# Optional: Kora RPC URL (default: http://localhost:8181)
KORA_RPC_URL=http://localhost:8181
```

## Gasless Setup with Kora

For gasless transactions, you need to run Kora alongside this API.

### 1. Install Kora CLI

```bash
cargo install kora-cli
```

### 2. Configure Kora

The included `kora.toml` configures:
- Allowed programs (Raydium AMM, Token programs)
- Allowed tokens for fee payment (USDC)
- Fee payer security policies
- Rate limiting

The `signers.toml` configures the fee payer wallet (reads from `KORA_PRIVATE_KEY` env var).

### 3. Fund the Fee Payer

Your fee payer wallet needs SOL to pay transaction fees:

```bash
# Check the fee payer address
kora rpc get-payer-signer --signers-config signers.toml

# Send SOL to the fee payer address
# Recommend: 0.1+ SOL for testing
```

### 4. Start Kora

```bash
# Load private key from env and start Kora RPC
export KORA_PRIVATE_KEY="your_base58_private_key"
kora rpc start \
  --config kora.toml \
  --signers-config signers.toml \
  --port 8181
```

### 5. Start the API

In a separate terminal:

```bash
npm run dev
```

## API Endpoints

### Health Check

```
GET /
```

Returns service info and available endpoints.

### Actions Discovery

```
GET /actions.json
```

Returns the actions.json manifest for blink discovery.

### Swap Action (Standard)

**Get Metadata:**
```
GET /actions/swap
```

**Build Transaction:**
```bash
POST /actions/swap?inputMint=SOL&outputMint=USDC&amount=1
Content-Type: application/json

{"account": "YourWalletPublicKey..."}
```

### Gasless Endpoints

**Check Service Status:**
```
GET /gasless/status
```

Returns:
```json
{
  "available": true,
  "feePayer": "5kFKR7n897KdGDwQwmHSncScuvZnkeQjk2wGbSjGXYjK",
  "supportedTokens": ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]
}
```

**Get Quote with Gas Fee:**
```bash
POST /gasless/quote
Content-Type: application/json

{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "0.1",
  "userWallet": "YourWalletPublicKey..."
}
```

**Build Transaction for Signing:**
```bash
POST /gasless/build
Content-Type: application/json

{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "0.1",
  "userWallet": "YourWalletPublicKey..."
}
```

**Execute Signed Transaction:**
```bash
POST /gasless/execute
Content-Type: application/json

{
  "signedTransaction": "base64-encoded-signed-transaction..."
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

## Architecture

```
x402-actions/
├── src/
│   ├── index.ts              # Express server + endpoints
│   ├── config.ts             # Environment config + token registry
│   ├── actions/
│   │   ├── swap.ts           # Standard swap action
│   │   └── gasless-swap.ts   # Gasless swap via Kora
│   └── lib/
│       ├── raydium.ts        # Raydium SDK integration
│       └── kora.ts           # Kora client wrapper
├── kora.toml                 # Kora RPC configuration
├── signers.toml              # Kora signer configuration
└── test-swap.ts              # Test script
```

## Testing

```bash
# Test standard swap (requires funded wallet)
export SOLANA_PRIVATE_KEY="your_test_wallet_key"
npx tsx test-swap.ts

# Test gasless swap (requires Kora running)
npx tsx test-swap-inline.ts
```

## Troubleshooting

### "Account not found" error
The fee payer wallet needs SOL. Fund it first:
```bash
solana transfer <fee_payer_address> 0.1 --allow-unfunded-recipient
```

### Kora connection refused
Make sure Kora is running on the expected port:
```bash
kora rpc start --config kora.toml --signers-config signers.toml --port 8181
```

### Transaction validation failed
Check `kora.toml` - the program being called might not be in `allowed_programs`.

## Roadmap

- [x] Swap (Raydium)
- [x] Gasless via Kora
- [ ] Stake (Marinade, Sanctum)
- [ ] Lend/Borrow (Kamino)
- [ ] LP Deposit/Withdraw

## License

MIT
