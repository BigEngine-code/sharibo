import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Catches render-time exceptions so a bug doesn't white-screen the demo for
// an audience that includes non-developers clicking through a ZK flow.
// Note: error boundaries only catch render-phase errors — they do NOT catch
// errors in async code or event handlers (those already flow through this
// app's own setError state in App.tsx).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="card hero">
            <h1 className="small">Something broke</h1>
            <p className="sub">
              The demo hit an unexpected error and can't continue safely from here.
            </p>
            <p className="error">{this.state.error.message}</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Start over
            </button>
            <p className="fineprint">
              If this keeps happening,{" "}
              <a
                className="link"
                href="https://github.com/crackedstudio/sharibo/issues/new"
                target="_blank"
                rel="noreferrer"
              >
                file a GitHub issue ↗
              </a>
              .
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
