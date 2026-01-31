import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  
  // Common token mints
  tokens: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  } as Record<string, string>,
  
  // Token symbols to mint mapping (case insensitive lookup)
  getTokenMint(symbol: string): string | undefined {
    const upper = symbol.toUpperCase();
    return this.tokens[upper];
  },
};
