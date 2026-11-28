import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// PWA: registra o service worker (app instalavel) SO em build de producao
// (import.meta.env.PROD). Em desenvolvimento (vite dev) nao registra, para nao
// cachear o app shell e atrapalhar o hot-reload (R16 da spec).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const base = import.meta.env.BASE_URL || "/";
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch(() => {
        /* registro best-effort: o app funciona normalmente sem PWA */
      });
  });
}
