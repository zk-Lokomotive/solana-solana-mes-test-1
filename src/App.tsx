
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

  const sendMessageViaWormhole = async (message: string): Promise<string> => {
    try {
      if (!connected || !publicKey) {
        throw new Error('Wallet not connected');
      }

      console.log('Initializing connection and wormhole...');
      const connection = new Connection(
        clusterApiUrl('devnet'),
        'confirmed'
      );

      const wh = await wormhole('Devnet', [solana]);
      const chain = wh.getChain('Solana');

      console.log('Getting core bridge...');
      const coreBridge = await chain.getWormholeCore();

      console.log('Preparing message payload...');
      const payload = encoding.bytes.encode(message);

      const customSigner: SignAndSendSigner<'Devnet', 'Solana'> = {
        chain: () => 'Solana',
        address: () => publicKey.toBase58(),
        signAndSend: async (
          unsignedTxs: UnsignedTransaction<'Devnet', 'Solana'>[]
        ): Promise<string[]> => {
          console.log('Preparing transactions...');
          
          const transactions = await Promise.all(
            unsignedTxs.map(async (unsignedTx: any) => {
              console.log('Processing transaction:', unsignedTx);
              
              const transaction = new Transaction();
              
              const { blockhash, lastValidBlockHeight } = 
                await connection.getLatestBlockhash('finalized');
              
              transaction.recentBlockhash = blockhash;
              transaction.lastValidBlockHeight = lastValidBlockHeight;
              transaction.feePayer = publicKey;

              // Instructions'ları ekle
              if (unsignedTx.instructions) {
                console.log('Found instructions:', unsignedTx.instructions);
                transaction.add(...unsignedTx.instructions);
              } else {
                console.log('Trying to extract instructions from tx data...');
                const txInstructions = (unsignedTx as any).data?.instructions || 
                                     (unsignedTx as any).message?.instructions ||
                                     unsignedTx.instructions;
                
                if (!txInstructions || txInstructions.length === 0) {
                  console.error('Transaction data:', unsignedTx);
                  throw new Error('No instructions found in transaction');
                }
                
                transaction.add(...txInstructions);
              }

              return transaction;
            })
          );

          console.log('Signing transactions...');
          const walletAdapter = new PhantomWalletAdapter();
          await walletAdapter.connect();
          const signedTxs = await walletAdapter.signAllTransactions(transactions);

          console.log('Sending transactions...');
          const signatures = await Promise.all(
            signedTxs.map(async (tx) => {
              const rawTransaction = tx.serialize();
              
              let retries = 3;
              while (retries > 0) {
                try {
                  const signature = await connection.sendRawTransaction(rawTransaction, {
                    skipPreflight: true,
                    maxRetries: 3,
                    preflightCommitment: 'confirmed'
                  });

                  console.log('Waiting for confirmation...');
                  await connection.confirmTransaction({
                    signature,
                    blockhash: tx.recentBlockhash!,
                    lastValidBlockHeight: tx.lastValidBlockHeight!,
                  }, 'confirmed');

                  console.log('Transaction confirmed:', signature);
                  return signature;
                } catch (error) {
                  console.error(`Transaction attempt failed, ${retries} retries left:`, error);
                  retries--;
                  if (retries === 0) throw error;
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              }
              throw new Error('Transaction failed after all retries');
            })
          );

          return signatures;
        }
      };

      console.log('Creating destination address...');
      const destinationAddress = new UniversalAddress(
        walletAddress,
        "base58"
      );

      console.log('Creating publish message transaction...');
      const publishTxs = await coreBridge.publishMessage(
        destinationAddress,
        payload,
        0,
        1
      );

      console.log('Sending and waiting for transaction...');
      const txids = await signSendWait(chain, publishTxs, customSigner);
      console.log('Transaction IDs:', txids);

      const finalTxId = txids[txids.length - 1]?.txid;
      if (!finalTxId) {
        throw new Error('Failed to get transaction ID');
      }

      console.log('Final transaction ID:', finalTxId);

      console.log('Parsing transaction...');
      const [whm] = await chain.parseTransaction(finalTxId);
      
      if (!whm) {
        throw new Error('Failed to parse Wormhole message');
      }

      console.log('Waiting for VAA...');
      await wh.getVaa(whm, 'Uint8Array', 60_000);
      
      console.log('Transaction completed successfully');
      return finalTxId;

    } catch (err) {
      console.error('Detailed error:', err);
      throw err;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!connected) {
      setError("Please connect your wallet first");
      return;
    }

    if (!walletAddress || !messageHash) {
      setError("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const hash = await sendMessageViaWormhole(messageHash);
      setTxHash(hash);
      console.log('Message sent successfully! Transaction hash:', hash);
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
          <p className="mt-2 text-gray-600">Send messages via Solana devnet</p>
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
