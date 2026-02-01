/**
 * Direct swap test - calls Raydium Actions directly, no local server needed
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

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

console.log('Wallet:', keypair.publicKey.toBase58());

async function main() {
  // Check balance first
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');
  
  if (balance < 0.02 * 1e9) {
    console.error('Not enough SOL for swap + fees');
    process.exit(1);
  }
  
  // Call Raydium Actions endpoint directly
  const swapAmount = 0.01;
  console.log(`\nBuilding swap: ${swapAmount} SOL → USDC via Raydium Actions...`);
  
  const url = `https://share.raydium.io/dialect/actions/swap/tx?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${swapAmount}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: keypair.publicKey.toBase58() }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to build swap:', error);
    process.exit(1);
  }
  
  const result = await response.json() as { transaction: string; message?: string };
  console.log('Transaction received from Raydium Actions');
  
  // Deserialize and sign
  const txBuffer = Buffer.from(result.transaction, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  
  console.log('Transaction has', transaction.message.compiledInstructions.length, 'instructions');
  
  // Sign (the tx already has a recent blockhash from Raydium)
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
  try {
    const latestBlockhash = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, 'confirmed');
    
    if (confirmation.value.err) {
      console.error('Transaction failed:', confirmation.value.err);
    } else {
      console.log('✅ Swap confirmed!');
      
      // Check new balance
      const newBalance = await connection.getBalance(keypair.publicKey);
      console.log('New SOL balance:', newBalance / 1e9, 'SOL');
    }
  } catch (e) {
    console.log('Confirmation timed out, check explorer for status');
  }
}

main().catch(console.error);
