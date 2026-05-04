'use client';

import { useState } from 'react';

interface Props {
  instanceId: string;
}

export function StepSuccess({ instanceId }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(instanceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
        <svg
          className="w-8 h-8 text-green-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Installation Complete!
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Hospital CMS has been successfully installed and configured.
      </p>

      <div className="text-left mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <span className="text-green-500">✓</span>
          MongoDB connected and indexed
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <span className="text-green-500">✓</span>
          Hospital profile created
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <span className="text-green-500">✓</span>
          SUPER_ADMIN account created
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <span className="text-green-500">✓</span>
          RSA key pair generated
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <span className="text-green-500">✓</span>
          Installer locked
        </div>
      </div>

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-blue-700">
            <strong>Instance ID:</strong>{' '}
            <code className="font-mono">{instanceId}</code>
          </p>
          <button
            onClick={handleCopy}
            className="text-xs font-medium text-blue-700 hover:text-blue-900 px-2 py-1 rounded border border-blue-300 bg-white"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-blue-600 mt-1">
          Your instance has been registered with the vendor control panel.
        </p>
      </div>

      <a
        href="/login"
        className="inline-flex items-center justify-center w-full px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
      >
        Proceed to Login
      </a>
    </div>
  );
}
