import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui";
class PageErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page render failed", error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <main className="loading-shell">
        <div role="alert">
          <h2>Не удалось открыть страницу</h2>
          <p>Обновите приложение. Сохранённые данные останутся на месте.</p>
          <Button onClick={() => location.reload()}>Обновить страницу</Button>
        </div>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function PageBoundary({ children }: { children: ReactNode }) {
  return (
    <PageErrorBoundary>
      <Suspense
        fallback={
          <div className="ui-empty" role="status">
            Загрузка страницы…
          </div>
        }
      >
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}
