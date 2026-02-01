import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import express from 'express';
import cors from 'cors';
import { createActionHeaders } from '@solana/actions';
import { buildSwapTransaction } from './src/lib/raydium.js';

const RPC_URL = 'https://api.mainnet-beta.solana.com';

// Load wallet from env
const privateKey = process.env.SOLANA_PRIVATE_KEY;
if (!privateKey) {
  console.error('SOLANA_PRIVATE_KEY not set');
  process.exit(1);
}

const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
console.log('Wallet:', wallet.publicKey.toBase58());

// Token mints
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function testSwap() {
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Check balance first
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');
  
  if (balance < 0.01 * 1e9) {
    console.error('Insufficient balance for swap');
    process.exit(1);
  }

  // Build swap transaction directly (skip HTTP)
  console.log('\nBuilding swap: 0.005 SOL → USDC...');
  
  const txBase64 = await buildSwapTransaction({
    owner: wallet.publicKey.toBase58(),
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: 0.005,
    slippageBps: 100, // 1% slippage
  });

  console.log('Transaction built!');

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

testSwap().catch(console.error).finally(() => process.exit());
