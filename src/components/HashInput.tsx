import React from 'react';

interface HashInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function HashInput({ value, onChange }: HashInputProps) {
  return (
    <div className="space-y-2 w-full">
      <label className="block text-sm font-medium text-gray-700">Message Hash</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black bg-white/90"
        placeholder="Enter your unique hash"
      />
    </div>
  );
}