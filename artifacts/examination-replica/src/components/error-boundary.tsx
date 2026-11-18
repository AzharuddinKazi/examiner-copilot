import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (this.state.failed) return <main role="alert"><h1>Development preview unavailable</h1><p>The unfinished replica encountered an error. The main application is separate.</p><button onClick={() => window.location.reload()}>Reload preview</button></main>;
    return this.props.children;
  }
}
