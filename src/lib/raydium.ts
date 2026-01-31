import { 
  Connection, 
  PublicKey, 
  Keypair,
} from '@solana/web3.js';
import { 
  Raydium, 
  TxVersion, 
  ApiV3PoolInfoStandardItem,
  AmmV4Keys,
  AmmRpcData,
} from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { config } from '../config.js';

const connection = new Connection(config.rpcUrl, 'confirmed');

// Decimals for common tokens
const TOKEN_DECIMALS: Record<string, number> = {
  [config.tokens.SOL]: 9,
  [config.tokens.USDC]: 6,
  [config.tokens.USDT]: 6,
  [config.tokens.RAY]: 6,
  [config.tokens.JUP]: 6,
};

async function getTokenDecimals(mint: string): Promise<number> {
  if (TOKEN_DECIMALS[mint]) {
    return TOKEN_DECIMALS[mint];
  }
  
  // Fetch from chain if not cached
  const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
  if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
    return mintInfo.value.data.parsed.info.decimals;
  }
  throw new Error(`Could not get decimals for mint: ${mint}`);
}

// Known AMM pool IDs for common pairs
const POOL_IDS: Record<string, string> = {
  'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
  'SOL-USDT': '7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX',
  'RAY-SOL': 'AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA',
  'RAY-USDC': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
};

function getPoolId(inputMint: string, outputMint: string): string | undefined {
  const inputSymbol = Object.entries(config.tokens).find(([_, v]) => v === inputMint)?.[0];
  const outputSymbol = Object.entries(config.tokens).find(([_, v]) => v === outputMint)?.[0];
  
  if (inputSymbol && outputSymbol) {
    return POOL_IDS[`${inputSymbol}-${outputSymbol}`] || POOL_IDS[`${outputSymbol}-${inputSymbol}`];
  }
  return undefined;
}

interface SwapParams {
  owner: string;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}

export async function buildSwapTransaction(params: SwapParams): Promise<string> {
  const { owner, inputMint, outputMint, amount, slippageBps } = params;
  const ownerPubkey = new PublicKey(owner);

  // Initialize Raydium SDK with the user's pubkey as owner
  // Note: We use a dummy keypair since we're not signing - just building the tx
  const raydium = await Raydium.load({
    connection,
    owner: ownerPubkey,
    disableLoadToken: true,
  });

  // Get token decimals
  const inputDecimals = await getTokenDecimals(inputMint);
  const amountInRaw = new BN(Math.floor(amount * 10 ** inputDecimals));

  // Try to find pool ID from our known pools
  let poolId = getPoolId(inputMint, outputMint);
  
  // If not in known pools, search via API
  if (!poolId) {
    const poolData = await raydium.api.fetchPoolByMints({
      mint1: inputMint,
      mint2: outputMint,
    });
    
    if (!poolData.data || poolData.data.length === 0) {
      throw new Error(`No pool found for swap`);
    }
    
    // Get first AMM V4 pool
    const ammPool = poolData.data.find(p => 
      p.programId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' ||
      p.type === 'Standard'
    );
    
    if (!ammPool) {
      throw new Error(`No AMM pool found for this pair`);
    }
    
    poolId = ammPool.id;
  }

  console.log(`Using pool: ${poolId}`);

  // Fetch pool info
  const data = await raydium.api.fetchPoolById({ ids: poolId });
  const poolInfo = data[0] as ApiV3PoolInfoStandardItem;
  
  // Get pool keys and RPC data
  const poolKeys = await raydium.liquidity.getAmmPoolKeys(poolId);
  const rpcData = await raydium.liquidity.getRpcPoolInfo(poolId);

  const [baseReserve, quoteReserve, status] = [
    rpcData.baseReserve, 
    rpcData.quoteReserve, 
    rpcData.status.toNumber()
  ];

  // Determine swap direction
  const baseIn = inputMint === poolInfo.mintA.address;
  const [mintIn, mintOut] = baseIn 
    ? [poolInfo.mintA, poolInfo.mintB] 
    : [poolInfo.mintB, poolInfo.mintA];

  // Compute output amount
  const slippage = slippageBps / 10000;
  const out = raydium.liquidity.computeAmountOut({
    poolInfo: {
      ...poolInfo,
      baseReserve,
      quoteReserve,
      status,
      version: 4,
    },
    amountIn: amountInRaw,
    mintIn: mintIn.address,
    mintOut: mintOut.address,
    slippage,
  });

  console.log(`Computed swap: ${amount} ${mintIn.symbol} → ${out.amountOut.toString()} ${mintOut.symbol}`);

  // Build the swap transaction
  const { transaction, execute } = await raydium.liquidity.swap({
    poolInfo,
    poolKeys,
    amountIn: amountInRaw,
    amountOut: out.minAmountOut,
    fixedSide: 'in',
    inputMint: mintIn.address,
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      units: 400000,
      microLamports: 100000,
    },
  });

  if (!transaction) {
    throw new Error('Failed to build swap transaction');
  }

  // Serialize to base64 (unsigned - user will sign)
  const serialized = Buffer.from(transaction.serialize()).toString('base64');

  return serialized;
}
