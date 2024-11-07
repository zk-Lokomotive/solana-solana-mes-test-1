import React from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';

interface TransactionStatusProps {
  txHash: string | null;
  isLoading: boolean;
}

export function TransactionStatus({ txHash, isLoading }: TransactionStatusProps) {
  if (!isLoading && !txHash) return null;

  return (
    <div className="mt-6 p-4 rounded-lg bg-white/90 border border-gray-200">
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <Loader2 className="w-5 h-5 animate-spin text-black" />
          <span>Processing transaction...</span>
        </div>
      ) : (
        txHash && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="font-medium">Transaction successful!</span>
            </div>
            <a
              href={`https://solscan.io/tx/${txHash}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-black hover:underline break-all"
            >
              View on Solscan: {txHash}
            </a>
          </div>
        )
      )}
    </div>
  );
}