import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { WalletInput } from './components/WalletInput';
import { HashInput } from './components/HashInput';
import { TransactionStatus } from './components/TransactionStatus';
import { isValidSolanaAddress } from './utils/mockTransaction';
import { wormhole } from '@wormhole-foundation/sdk';
import { encoding, signSendWait } from '@wormhole-foundation/sdk';
import type { UnsignedTransaction, SignAndSendSigner } from '@wormhole-foundation/sdk';
import solana from '@wormhole-foundation/sdk/solana';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { Transaction, Connection, clusterApiUrl } from '@solana/web3.js';
import { UniversalAddress } from "@wormhole-foundation/sdk";
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectButton } from './components/WalletConnectButton';

function App() {
  const { connected, publicKey } = useWallet();
  const [walletAddress, setWalletAddress] = useState('');
  const [messageHash, setMessageHash] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessageViaWormhole = async (
    message: string
  ): Promise<string> => {
    try {
      if (!connected || !publicKey) {
        throw new Error('Wallet not connected');
      }

      // Initialize connection
      const connection = new Connection(
        import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet'),
        'confirmed'
      );

      const wh = await wormhole('Testnet', [solana], {
        chains: {
          Solana: {
            rpc: import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
          },
        },
      });

      const chain = wh.getChain('Solana');
      const walletAdapter = new PhantomWalletAdapter();
      await walletAdapter.connect();

      const coreBridge = await chain.getWormholeCore();
      const payload = encoding.bytes.encode(message);
      
      const customSigner: SignAndSendSigner<'Testnet', 'Solana'> = {
        chain: () => 'Solana',
        address: () => publicKey.toBase58(),
        signAndSend: async (
          unsignedTxs: UnsignedTransaction<'Testnet', 'Solana'>[]
        ): Promise<string[]> => {
          const transactions = await Promise.all(
            unsignedTxs.map(async (unsignedTx: any) => {
              const transaction = new Transaction();
              
              const latestBlockhash = await connection.getLatestBlockhash();
              transaction.recentBlockhash = latestBlockhash.blockhash;
              transaction.feePayer = publicKey;

              if (unsignedTx.instructions && unsignedTx.instructions.length > 0) {
                transaction.add(...unsignedTx.instructions);
              } else {
                throw new Error('No instructions found in transaction');
              }

              return transaction;
            })
          );

          const signedTxs = await walletAdapter.signAllTransactions(transactions);

          const signatures = await Promise.all(
            signedTxs.map(async (tx) => {
              const rawTransaction = tx.serialize();
              return await connection.sendRawTransaction(rawTransaction);
            })
          );

          return signatures;
        }
      };

      const destinationAddress = new UniversalAddress(
        walletAddress,
        "base58"
      );

      const publishTxs = coreBridge.publishMessage(
        destinationAddress,
        payload,
        0,
        0
      );

      const txids = await signSendWait(chain, publishTxs, customSigner);
      const finalTxId = txids[txids.length - 1]?.txid;
      
      if (!finalTxId) {
        throw new Error('Failed to get transaction ID');
      }

      const [whm] = await chain.parseTransaction(finalTxId);
      
      if (!whm) {
        throw new Error('Failed to parse Wormhole message');
      }

      await wh.getVaa(whm, 'TokenBridge:Transfer', 60_000);
      return finalTxId;

    } catch (err) {
      console.error('Wormhole transfer error:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!connected) {
      setError("Please connect your wallet first");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const hash = await sendMessageViaWormhole(messageHash);
      setTxHash(hash);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setError(errorMessage);
      console.error('Transaction failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const isValidWallet = !walletAddress || isValidSolanaAddress(walletAddress);
  const canSubmit = connected && isValidSolanaAddress(walletAddress) && messageHash.length > 0 && !isLoading;

  return (
    <div className="min-h-screen bg-[#FEFFAF] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Wormhole Bridge</h1>
          <p className="mt-2 text-gray-600">Send messages via Solana testnet</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-xl">
          <WalletConnectButton />
          
          <WalletInput
            value={walletAddress}
            onChange={setWalletAddress}
            isValid={isValidWallet}
          />
          
          <HashInput
            value={messageHash}
            onChange={setMessageHash}
          />

          {error && (
            <div className="text-red-500 text-sm mt-2">
              {error}
            </div>
          )}

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