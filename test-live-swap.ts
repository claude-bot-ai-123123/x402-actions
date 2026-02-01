/**
 * Live swap test - executes a real swap on mainnet
 */
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('Missing SOLANA_PRIVATE_KEY');
  process.exit(1);
}

const connection = new Connection(RPC_URL, 'confirmed');
const keypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

console.log('Wallet:', keypair.publicKey.toBase58());

async function main() {
  // Check balance first
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');
  
  if (balance < 0.02 * 1e9) {
    console.error('Not enough SOL for swap + fees');
    process.exit(1);
  }
  
  // Get swap transaction from our API
  console.log('\nBuilding swap: 0.01 SOL → USDC...');
  
  const response = await fetch(
    'http://localhost:3000/actions/swap?inputMint=SOL&outputMint=USDC&amount=0.01',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: keypair.publicKey.toBase58() }),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to build swap:', error);
    process.exit(1);
  }
  
  const result = await response.json();
  console.log('Message:', result.message);
  
  // Deserialize and sign
  const txBuffer = Buffer.from(result.transaction, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  
  // Get fresh blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.message.recentBlockhash = blockhash;
  
  // Sign
  transaction.sign([keypair]);
  
  // Send
  console.log('\nSending transaction...');
  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    maxRetries: 3,
  });
  
  console.log('Signature:', signature);
  console.log('Explorer:', `https://solscan.io/tx/${signature}`);
  
  // Wait for confirmation
  console.log('\nWaiting for confirmation...');
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  });
  
  if (confirmation.value.err) {
    console.error('Transaction failed:', confirmation.value.err);
  } else {
    console.log('✅ Swap confirmed!');
    
    // Check new balance
    const newBalance = await connection.getBalance(keypair.publicKey);
    console.log('New SOL balance:', newBalance / 1e9, 'SOL');
  }
}

main().catch(console.error);
