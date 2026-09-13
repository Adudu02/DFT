import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  attempt: number;
}

/**
 * Acota las excepciones de render de una página: muestra un panel con el
 * mensaje y «Reintentar», que remonta los hijos (attempt como key) para
 * re-ejecutar sus cargas de datos.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
  }

  retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="bg-term-panel border border-term-border rounded p-6 max-w-xl mx-auto mt-8">
          <div className="text-term-red text-sm font-bold uppercase tracking-widest">La página falló</div>
          <p className="text-term-text text-sm mt-2 break-words">{this.state.error.message}</p>
          <button type="button" onClick={this.retry} className="btn mt-4">
            Reintentar
          </button>
        </div>
      );
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
