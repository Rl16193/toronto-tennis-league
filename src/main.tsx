import { Component, StrictMode } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Unhandled error:', error, info);
    const meta = document.querySelector('meta[name="robots"]');
    if (meta) meta.setAttribute('content', 'noindex');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-tennis-dark px-4 text-center">
          <div className="space-y-4">
            <h1 className="text-2xl font-black text-white">Unable to load</h1>
            <p className="text-sm text-orange-500">Kindly refresh the page.</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-6 py-3 bg-clay text-white font-bold rounded-2xl"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
