import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const API_URL = 'http://localhost:3000';

// Load wallet from env
const privateKey = process.env.SOLANA_PRIVATE_KEY;
if (!privateKey) {
  console.error('SOLANA_PRIVATE_KEY not set');
  process.exit(1);
}

const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
console.log('Wallet:', wallet.publicKey.toBase58());

async function testSwap() {
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Check balance first
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');
  
  if (balance < 0.01 * 1e9) {
    console.error('Insufficient balance for swap');
    process.exit(1);
  }

  // Build swap transaction via our API
  console.log('\nBuilding swap: 0.005 SOL → USDC...');
  const response = await fetch(
    `${API_URL}/actions/swap?inputMint=SOL&outputMint=USDC&amount=0.005`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: wallet.publicKey.toBase58() }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('API Error:', error);
    process.exit(1);
  }

  const { transaction: txBase64, message } = await response.json();
  console.log('Message:', message);

  // Deserialize and sign
  const txBuffer = Buffer.from(txBase64, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  
  console.log('\nSigning transaction...');
  transaction.sign([wallet]);

  // Submit
  console.log('Submitting to Solana...');
  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  console.log('\n✅ Transaction submitted!');
  console.log('Signature:', signature);
  console.log('Explorer:', `https://solscan.io/tx/${signature}`);

  // Wait for confirmation
  console.log('\nWaiting for confirmation...');
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  
  if (confirmation.value.err) {
    console.error('Transaction failed:', confirmation.value.err);
  } else {
    console.log('✅ Transaction confirmed!');
  }
}

testSwap().catch(console.error);
