import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { isMobileApp } from "./mobile-product";
import { restoreSessionToken } from "./platform/native";
import "./styles.css";

if (isMobileApp) {
  // Draw under the iPhone status bar and notch; styles/mobile-app.css then
  // offsets top-anchored surfaces by env(safe-area-inset-top).
  document.documentElement.classList.add("mobile-app");
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, viewport-fit=cover",
    );
}

// Resolves immediately in the browser; in the app it restores a token that
// iOS may have cleared from WebView storage.
void restoreSessionToken().finally(() =>
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  ),
);
