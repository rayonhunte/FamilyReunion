import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary-shell">
          <div className="error-boundary-card">
            <p className="eyebrow">Family Reunion Portal</p>
            <h1>Something went wrong</h1>
            <p className="error-boundary-description">
              We hit an unexpected problem. Try reloading the page or going back to home.
            </p>
            <img
              src="/error_page.png"
              alt="Person looking confused next to a broken Something Went Wrong sign in the jungle"
              className="error-boundary-image"
            />
            <div className="error-boundary-actions">
              <button type="button" className="cta-button" onClick={this.handleReload}>
                Back to home
              </button>
              <button type="button" className="ghost-button" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
