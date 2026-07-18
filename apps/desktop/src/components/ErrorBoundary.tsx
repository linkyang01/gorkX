import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Prevent a render crash from blanking the whole desktop window. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[gorkX] UI crash', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            background: '#0e0f12',
            color: '#e8eaef',
            fontFamily: 'system-ui, sans-serif',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 480 }}>
            <h1 style={{ fontSize: 18, marginBottom: 8 }}>gorkX hit a UI error</h1>
            <pre
              style={{
                textAlign: 'left',
                background: '#15171c',
                border: '1px solid #2a2e38',
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
                overflow: 'auto',
                color: '#ff6b6b',
              }}
            >
              {this.state.error.message}
            </pre>
            <button
              type="button"
              style={{
                marginTop: 16,
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#c8f542',
                color: '#12140a',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
