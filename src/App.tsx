import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { WalletInput } from './components/WalletInput';
import { HashInput } from './components/HashInput';
import { TransactionStatus } from './components/TransactionStatus';
import { simulateTransaction, isValidSolanaAddress } from './utils/mockTransaction';

function App() {
  const [walletAddress, setWalletAddress] = useState('');
  const [messageHash, setMessageHash] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const hash = await simulateTransaction(walletAddress, messageHash);
      setTxHash(hash);
    } catch (error) {
      console.error('Transaction failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isValidWallet = !walletAddress || isValidSolanaAddress(walletAddress);
  const canSubmit = isValidSolanaAddress(walletAddress) && messageHash.length > 0 && !isLoading;

  return (
    <div className="min-h-screen bg-[#FEFFAF] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Wormhole Bridge</h1>
          <p className="mt-2 text-gray-600">Send messages via Solana testnet</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-xl">
          <WalletInput
            value={walletAddress}
            onChange={setWalletAddress}
            isValid={isValidWallet}
          />

          <HashInput
            value={messageHash}
            onChange={setMessageHash}
          />

          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-white
              ${canSubmit 
                ? 'bg-black hover:bg-gray-800 cursor-pointer' 
                : 'bg-gray-400 cursor-not-allowed'
              } transition-colors duration-200`}
          >
            <Send className="w-5 h-5" />
            <span>Send Message</span>
          </button>

          <TransactionStatus txHash={txHash} isLoading={isLoading} />
        </form>
      </div>
    </div>
  );
}

export default App;