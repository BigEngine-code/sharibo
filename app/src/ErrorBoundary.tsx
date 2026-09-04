import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./App.module.css";

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
        <div className={styles.page}>
          <div className={`${styles.card} ${styles.hero}`}>
            <h1 className={styles.h1Small}>Something broke</h1>
            <p className={styles.sub}>
              The demo hit an unexpected error and can't continue safely from here.
            </p>
            <p className={styles.error}>{this.state.error.message}</p>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => window.location.reload()}>
              Start over
            </button>
            <p className={styles.fineprint}>
              If this keeps happening,{" "}
              <a
                className={styles.link}
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
