
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export function WalletConnectButton() {
  const { connected } = useWallet();
  
  return (
    <div className="mb-4">
      <WalletMultiButton className="phantom-button" />
      {connected && (
        <p className="text-sm text-green-600 mt-2">
          Wallet Connected ✓
        </p>
      )}
    </div>
  );
}