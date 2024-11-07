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
import { Transaction, PublicKey } from '@solana/web3.js';

function App() {
  const [walletAddress, setWalletAddress] = useState('');
  const [messageHash, setMessageHash] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessageViaWormhole = async (
    message: string
  ): Promise<string> => {
    try {
      // Initialize Wormhole with Solana testnet
      const wh = await wormhole('Testnet', [solana], {
        chains: {
          Solana: {
            rpc: import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
          },
        },
      });

      // Get Solana chain context
      const chain = wh.getChain('Solana');
      
      // Initialize Phantom wallet adapter
      const walletAdapter = new PhantomWalletAdapter();
      await walletAdapter.connect();

      if (!walletAdapter.publicKey) {
        throw new Error('Wallet not connected');
      }

      // Get the core messaging bridge
      const coreBridge = await chain.getWormholeCore();

      // Prepare the message payload
      const payload = encoding.bytes.encode(message);
      
      // Create custom signer object that implements SignAndSendSigner
      const customSigner: SignAndSendSigner<'Testnet', 'Solana'> = {
        chain: () => 'Solana',
        address: () => walletAdapter.publicKey!.toBase58(),
        signAndSend: async (
          unsignedTxs: UnsignedTransaction<'Testnet', 'Solana'>[]
        ): Promise<string[]> => {
          const transactions = unsignedTxs.map(tx => {
            const solTx = new Transaction();
            // Handle instructions safely
            const instructions = (tx as any).instructions || [];
            solTx.add(...instructions);
            return solTx;
          });
          
          const signedTxs = await walletAdapter.signAllTransactions(transactions);
          
          return signedTxs.map(tx => {
            const signatures = tx.signatures[0];
            if (!signatures) throw new Error('No signature found');
            return signatures.toString();
          });
        }
      };

      // Convert public key to appropriate format for destination address
      const destinationAddress = new PublicKey(walletAddress).toBytes();

      // Generate publish message transaction
      const publishTxs = coreBridge.publishMessage(
        destinationAddress,
        payload,
        0,
        0
      );

      // Sign and send the transaction
      const txids = await signSendWait(chain, publishTxs, customSigner);
      
      // Get the last transaction ID
      const finalTxId = txids[txids.length - 1]?.txid;
      
      if (!finalTxId) {
        throw new Error('Failed to get transaction ID');
      }

      // Get the Wormhole message ID from the transaction
      const [whm] = await chain.parseTransaction(finalTxId);
      
      if (!whm) {
        throw new Error('Failed to parse Wormhole message');
      }

      // Wait for the VAA
      await wh.getVaa(whm, 'TokenBridge:Transfer', 60_000);

      return finalTxId;
    } catch (err) {
      console.error('Wormhole transfer error:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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