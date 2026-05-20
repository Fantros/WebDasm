import React, { Component } from 'react';
import type { ErrorInfo } from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name ?? 'unknown'}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          className="flex-1 flex flex-col items-center justify-center p-6 bg-[var(--ida-bg)] text-center font-mono"
          role="alert"
        >
          <div className="text-4xl mb-3">⚠️</div>
          <div className="text-[var(--ida-red)] font-bold text-xs mb-1 uppercase tracking-wider">
            {this.props.name ? `${this.props.name} — ` : ''}Component Error
          </div>
          <div className="text-[var(--ida-text-dim)] text-[10px] max-w-[400px] leading-relaxed mb-4 break-all">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </div>
          <button
            className="px-3 py-1 bg-[var(--ida-panel-2)] hover:bg-[var(--ida-menu-hover)] border border-[var(--ida-border)] text-[var(--ida-text)] rounded text-[10px] font-bold cursor-pointer transition-colors duration-100"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            🔄 Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
