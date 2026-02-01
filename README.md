# x402-actions

**Permissionless Solana DeFi API** — No API keys, just pay per request.

Built on [x402](https://x402.org) payment protocol + Solana Actions standard + [Kora](https://github.com/kora-labs/kora) gasless transactions.

## How It Works

```
Agent: POST /gasless/build (swap SOL→USDC)
   ↓
Server: 402 Payment Required
        Pay $0.01 USDC to execute
   ↓  
Agent: Signs USDC payment, retries with Payment-Signature header
   ↓
Server: ✓ Payment verified → Returns signed swap transaction
```

**No accounts. No API keys. Just a wallet.**

## Quick Start

### As a Client (AI Agent)

```typescript
import { createSvmClient } from "@x402/svm/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { Keypair } from "@solana/web3.js";

// Your agent's wallet
const keypair = Keypair.fromSecretKey(/* your key */);
const client = createSvmClient({ signer: toClientSvmSigner(keypair) });

// Wrap fetch to auto-pay x402 requests
const paidFetch = wrapFetchWithPayment(fetch, client);

// Now just use it — payment happens automatically
const response = await paidFetch("https://api.example.com/gasless/build", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amount: "0.1",
    userWallet: keypair.publicKey.toBase58(),
  }),
});

const { transaction } = await response.json();
// Sign and submit transaction...
```

### As a Server

```bash
# Install
git clone https://github.com/your-repo/x402-actions
cd x402-actions
npm install

# Configure
cp .env.example .env
# Edit .env:
#   X402_ENABLED=true
#   X402_PAY_TO=YourSolanaAddress (receives payments)
#   SOLANA_RPC_URL=https://your-rpc.com

# Run
npm run build
npm start
```

## Pricing

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /actions/swap` | $0.001 | Build swap transaction |
| `POST /gasless/quote` | $0.005 | Get swap quote with gas estimate |
| `POST /gasless/build` | $0.01 | Build gasless transaction |
| `POST /gasless/execute` | $0.02 | Execute via Kora (includes gas) |

All payments in **USDC on Solana mainnet**.

## API Reference

### Free Endpoints

```
GET /                 → Service info
GET /actions.json     → Blink discovery manifest  
GET /actions/swap     → Swap action metadata
GET /gasless/status   → Gasless service availability
```

### Paid Endpoints

#### Build Swap Transaction
```bash
POST /actions/swap?inputMint=SOL&outputMint=USDC&amount=1
Content-Type: application/json

{"account": "YourWalletPublicKey"}
```

#### Get Gasless Quote
```bash
POST /gasless/quote
Content-Type: application/json

{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 
  "amount": "0.1",
  "userWallet": "YourWalletPublicKey"
}
```

#### Build Gasless Transaction
```bash
POST /gasless/build
Content-Type: application/json

{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "0.1", 
  "userWallet": "YourWalletPublicKey"
}
```

#### Execute Gasless Transaction
```bash
POST /gasless/execute
Content-Type: application/json

{
  "signedTransaction": "base64-encoded-signed-transaction"
}
```

## x402 Payment Flow

When you hit a paid endpoint without payment:

```
HTTP/1.1 402 Payment Required
X-Payment-Required: eyJ...base64-encoded-payment-requirements...
```

The `X-Payment-Required` header contains:
- `price`: Amount to pay (e.g., "$0.01")
- `payTo`: Destination wallet
- `network`: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
- `scheme`: "exact"

Your client signs a USDC transfer and retries with:
```
Payment-Signature: eyJ...base64-encoded-signed-payment...
```

Server verifies payment, executes request, settles on-chain.

## Gasless Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Agent     │────▶│ x402-actions │────▶│    Kora     │
│  (wallet)   │     │   (server)   │     │ (fee payer) │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │                    │
       │  1. Pay x402      │                    │
       │─────────────────▶│                    │
       │                   │  2. Build tx      │
       │  3. Return tx    │◀───────────────────│
       │◀─────────────────│                    │
       │                   │                    │
       │  4. Sign & send   │                    │
       │─────────────────▶│  5. Submit + pay  │
       │                   │───────────────────▶│
       │  6. Confirmed    │                    │
       │◀─────────────────│◀───────────────────│
```

Users pay API fees in USDC (via x402). Kora pays Solana gas fees.

## Environment Variables

```env
# Server
PORT=3000
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# x402 Payment Gating
X402_ENABLED=true
X402_PAY_TO=YourSolanaWalletAddress
X402_FACILITATOR_URL=https://facilitator.x402.org

# Kora (for gasless)
KORA_PRIVATE_KEY=base58_encoded_private_key
KORA_RPC_URL=http://localhost:8181
```

## Running Kora (for gasless)

```bash
# Install
cargo install kora-cli

# Fund fee payer (needs SOL for gas)
solana transfer <fee_payer_address> 0.5

# Start Kora RPC
export KORA_PRIVATE_KEY="your_base58_key"
kora rpc start --config kora.toml --signers-config signers.toml --port 8181
```

## Why x402?

Traditional API monetization:
1. Create account
2. Get API key
3. Manage credentials
4. Rate limits, quotas, billing...

x402:
1. Have wallet
2. Pay per request
3. That's it

**For AI agents:** No credential management. No OAuth. No accounts. Just load wallet, pay, use.

## Client Libraries

```bash
# Full Solana client with auto-payment
npm install @x402/svm @x402/fetch

# Or use with existing HTTP client
npm install @x402/core @x402/svm
```

## License

MIT
