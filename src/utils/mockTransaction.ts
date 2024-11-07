// Simulates a transaction with a delay
export const simulateTransaction = async (wallet: string, hash: string): Promise<string> => {
  await new Promise(resolve => setTimeout(resolve, 2000));
  return '4AxafR2JbXZhF4f8vPZPuQEuHZ4resolve87PQUAkqhx9PDcXQKPfPEJ7' + Date.now().toString(36);
};

// Validates Solana wallet address format
export const isValidSolanaAddress = (address: string): boolean => {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};