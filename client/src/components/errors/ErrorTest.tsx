
import React, { useState } from 'react';
import { ErrorDisplay } from '@/components/errors/error-display';

export default function ErrorTest() {
  const [showError, setShowError] = useState(true);
  
  const testError = new Error("This is a test error to demonstrate the new styling");
  
  const handleRetry = () => {
    setShowError(false);
    setTimeout(() => setShowError(true), 1000);
  };

  if (showError) {
    return (
      <ErrorDisplay 
        error={testError}
        title="Test Error Display"
        onRetry={handleRetry}
        showDetails={true}
      />
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Error Display Test</h1>
      <button 
        onClick={() => setShowError(true)}
        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
      >
        Trigger Error Display
      </button>
    </div>
  );
}
