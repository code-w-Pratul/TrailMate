import { Component } from 'react';
import { WarningIcon } from './ui/Icons.jsx';

/**
 * Last line of defence.
 *
 * Per-card errors are handled by `SectionCard`; this catches the class of bug
 * that would otherwise unmount the whole tree and leave a blank page — a render
 * error in a component, a malformed payload no one anticipated. The user gets a
 * recoverable screen instead of a white void.
 *
 * Class component because error boundaries have no hook equivalent.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In a real deployment this is where Sentry et al. would be called.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="tm-card tm-card-pad max-w-lg text-center">
          <WarningIcon className="mx-auto size-10 text-amber-500" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Something went wrong in the interface
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Your saved trips are unaffected. Reloading usually clears it.
          </p>

          {import.meta.env.DEV ? (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-rose-700 dark:bg-slate-950 dark:text-rose-300">
              {error.message}
              {'\n'}
              {error.stack?.split('\n').slice(1, 5).join('\n')}
            </pre>
          ) : null}

          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              className="tm-btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload the page
            </button>
            <button type="button" className="tm-btn-secondary" onClick={this.handleReset}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
