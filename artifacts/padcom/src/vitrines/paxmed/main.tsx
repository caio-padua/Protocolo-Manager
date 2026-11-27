import { createRoot } from "react-dom/client";
import { StrictMode, useEffect } from "react";
import "./styles.css";
import { Index, META } from "./pages/Home";
import { Convite, META_CONVITE } from "./pages/Convite";
import { LanguageProvider } from "@paxmed/contexts/LanguageContext";
import { Toaster } from "@paxmed/components/Sonner";

type Meta = { title?: string; name?: string; property?: string; content?: string }[];

function aplicarMeta(meta: Meta): void {
  for (const m of meta) {
    if (m.title) { document.title = m.title; continue; }
    const chave = m.name ? `name="${m.name}"` : `property="${m.property}"`;
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${chave}]`);
    if (!el) { el = document.createElement("meta"); if (m.name) el.name = m.name; else el.setAttribute("property", m.property!); document.head.appendChild(el); }
    el.content = m.content ?? "";
  }
}

/** Fontes do projeto de origem da vitrine. */
function carregarFontes(): void {
  for (const l of [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&family=Michroma&display=swap" },
  ]) {
    const el = document.createElement("link");
    el.rel = l.rel; el.href = l.href; if (l.crossOrigin) el.crossOrigin = l.crossOrigin;
    document.head.appendChild(el);
  }
}

function Vitrine() {
  const convite = window.location.pathname.replace(/\/+$/, "") === "/convite";
  useEffect(() => { aplicarMeta(convite ? META_CONVITE : META); }, [convite]);
  return (
    <LanguageProvider>
      {convite ? <Convite /> : <Index />}
      <Toaster richColors position="top-center" />
    </LanguageProvider>
  );
}

export function montarVitrinePaxmed(): void {
  carregarFontes();
  createRoot(document.getElementById("root")!).render(<StrictMode><Vitrine /></StrictMode>);
}
