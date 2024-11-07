import React from 'react';

interface WalletInputProps {
  value: string;
  onChange: (value: string) => void;
  isValid: boolean;
}

export function WalletInput({ value, onChange, isValid }: WalletInputProps) {
  return (
    <div className="space-y-2 w-full">
      <label className="block text-sm font-medium text-gray-700">Recipient Wallet Address</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-4 py-2 rounded-lg border ${
          isValid ? 'border-gray-300' : 'border-red-500'
        } focus:outline-none focus:ring-2 focus:ring-black bg-white/90`}
        placeholder="Enter Solana wallet address"
      />
      {!isValid && value && (
        <p className="text-red-500 text-sm">Please enter a valid Solana address</p>
      )}
    </div>
  );
}