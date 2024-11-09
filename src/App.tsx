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
import { 
  Transaction, 
  Connection, 
  Commitment,
  TransactionSignature,
  // PublicKey
} from '@solana/web3.js';
import { UniversalAddress } from "@wormhole-foundation/sdk";
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectButton } from './components/WalletConnectButton';

// RPC URL & WH Contract Details
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
const COMMITMENT: Commitment = 'confirmed';
// const WORMHOLE_BRIDGE_ADDRESS = 'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth';

// Devnet Program IDs
const DEVNET_CONTRACTS = {
  core: 'Bridge1p5gheXUvJ6jGWGeCsgPKgnE3YgdGKRVCMY9o', // Devnet Core Bridge
  token_bridge: 'B6RHG3mfcckmrYN1UhmJzyS1XX3fZKbkeUcpJe9Sy3FE', // Devnet Token Bridge
  nft_bridge: 'NFTWqJR8YnRVqPDvTJrYuLrQDitTG5AScqbeghi4zSA' // Devnet NFT Bridge
} as const; 


function App() {
  const { connected, publicKey } = useWallet();
  const [walletAddress, setWalletAddress] = useState('');
  const [messageHash, setMessageHash] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transaction retry ayarları
  const TX_RETRY_COUNT = 5;
  const TX_RETRY_DELAY = 2000;

  // Confirmation helper
  const confirmTransaction = async (
    connection: Connection,
    signature: TransactionSignature,
  ): Promise<void> => {
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      COMMITMENT
    );
  };

  const sendMessageViaWormhole = async (message: string): Promise<string> => {
    try {
      if (!connected || !publicKey) {
        throw new Error('Wallet not connected');
      }

      if (!isValidSolanaAddress(walletAddress)) {
        throw new Error('Invalid destination address');
      }

      console.log('Initializing connection and wormhole...');


      const connection = new Connection(SOLANA_RPC_URL, {
        commitment: COMMITMENT,
        confirmTransactionInitialTimeout: 60000,
        wsEndpoint: 'wss://api.devnet.solana.com/',
      });
      


// Wormhole Initialization
const wh = await wormhole('Devnet', [solana], {
  chains: {
    Solana: {
      rpc: SOLANA_RPC_URL,
      contracts: DEVNET_CONTRACTS,
    },
  },
});


const chain = wh.getChain('Solana');


// Core bridge initialization with retry mechanism
let coreBridge;
let retryCount = 3;
while (retryCount > 0) {
  try {
    coreBridge = await chain.getWormholeCore();
    if (!coreBridge) {
      throw new Error('Failed to initialize Wormhole core bridge');
    }
    break;
  } catch (error) {
    console.error(`Core bridge initialization attempt ${4 - retryCount} failed:`, error);
    retryCount--;
    if (retryCount === 0) {
      throw new Error('Failed to connect to Wormhole bridge after multiple attempts');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}



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
              
              let retries = TX_RETRY_COUNT;
              let blockhash;
              let lastValidBlockHeight;

              while (retries > 0) {
                try {
                  const latestBlockhash = await connection.getLatestBlockhash(COMMITMENT);
                  blockhash = latestBlockhash.blockhash;
                  lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
                  break;
                } catch (error) {
                  console.error('Failed to get blockhash, retrying...', error);
                  retries--;
                  if (retries === 0) throw error;
                  await new Promise(resolve => setTimeout(resolve, TX_RETRY_DELAY));
                }
              }

              transaction.recentBlockhash = blockhash!;
              transaction.lastValidBlockHeight = lastValidBlockHeight!;
              transaction.feePayer = publicKey;

              if (unsignedTx.instructions?.length) {
                console.log(`Adding ${unsignedTx.instructions.length} instructions`);
                transaction.add(...unsignedTx.instructions);
              } else {
                throw new Error('No instructions found in transaction');
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
              let signature: string | undefined;
              
              let retries = TX_RETRY_COUNT;
              while (retries > 0) {
                try {
                  signature = await connection.sendRawTransaction(rawTransaction, {
                    skipPreflight: true,
                    maxRetries: TX_RETRY_COUNT,
                    preflightCommitment: COMMITMENT,
                  });

                  console.log('Waiting for confirmation...');
                  await confirmTransaction(connection, signature);
                  
                  console.log('Transaction confirmed:', signature);
                  return signature;
                } catch (error) {
                  console.error(`Transaction attempt failed, ${retries} retries left:`, error);
                  retries--;
                  if (retries === 0) throw error;
                  await new Promise(resolve => setTimeout(resolve, TX_RETRY_DELAY));
                }
              }
              
              throw new Error('Transaction failed after all retries');
            })
          );

          return signatures.filter((sig): sig is string => sig !== undefined);
        }
      };

      console.log('Creating destination address...');
      const destinationAddress = new UniversalAddress(
        walletAddress,
        "base58"
      );

      console.log('Create publish message...');
      if (!coreBridge) {
        throw new Error('coreBridge not defined');
      }
      let publishTxs;
      try {
        publishTxs = await coreBridge.publishMessage(
          destinationAddress,
          payload,
          0,  // nonce
          1   
        );
      } catch (error) {
        console.error('Publish message Error:', error);
        throw error;
      }

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
    
    try {
      if (!connected) {
        throw new Error("Please connect your wallet first");
      }

      if (!walletAddress || !messageHash) {
        throw new Error("Please fill in all fields");
      }

      if (!isValidSolanaAddress(walletAddress)) {
        throw new Error("Invalid destination address");
      }

      setIsLoading(true);
      setError(null);
      
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
  const canSubmit = connected && 
                   isValidSolanaAddress(walletAddress) && 
                   messageHash.length > 0 && 
                   !isLoading;

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
