import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Codex Skill Manager UI crashed.", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="error-boundary" role="alert">
        <div className="error-boundary-panel">
          <span className="confirm-icon danger">
            <CircleAlert size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">UI error</p>
            <h1>Something went wrong</h1>
            <p>{this.state.error.message || "The interface hit an unexpected error."}</p>
            <Button type="button" variant="primary" onClick={() => window.location.reload()}>
              <RefreshCw size={15} aria-hidden="true" />
              Reload
            </Button>
          </div>
        </div>
      </main>
    );
  }
}
