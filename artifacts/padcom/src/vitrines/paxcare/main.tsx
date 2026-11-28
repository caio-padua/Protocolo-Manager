import { createRoot } from "react-dom/client";
import { StrictMode, useEffect } from "react";
import "./styles.css";
import { Index as Home, META as META_HOME } from "./pages/Home";
import { MedicosPage, META as META_MEDICOS } from "./pages/Medicos";

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

/** Páginas desta vitrine: "/" e "/medicos". Qualquer outro caminho é do Manager (decidido antes, em host-vitrine). */
function Vitrine() {
  const medicos = window.location.pathname.replace(/\/+$/, "") === "/medicos";
  useEffect(() => { aplicarMeta(medicos ? META_MEDICOS : META_HOME); }, [medicos]);
  return medicos ? <MedicosPage /> : <Home />;
}

/** Fontes do projeto de origem (Inter e EB Garamond). */
function carregarFontes(): void {
  for (const l of [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=EB+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap" },
  ]) {
    const el = document.createElement("link");
    el.rel = l.rel; el.href = l.href; if (l.crossOrigin) el.crossOrigin = l.crossOrigin;
    document.head.appendChild(el);
  }
}

export function montarVitrinePaxcare(): void {
  carregarFontes();
  document.documentElement.lang = "pt-BR";
  createRoot(document.getElementById("root")!).render(<StrictMode><Vitrine /></StrictMode>);
}
