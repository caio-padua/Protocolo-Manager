// Hub Central de Exames — landing page do ecossistema de exames
// Rota: /exames-hub
// Pedido CEO 24/07/2026.

import { Link } from "wouter";
import {
  TestTube,
  MapPin,
  ClipboardList,
  DownloadCloud,
  Radar,
  Activity,
  FlaskConical,
  Compass,
  Microscope,
  ExternalLink,
  ArrowRight,
} from "lucide-react";

const NAVY  = "#16294a";
const GOLD  = "#9a7b32";
const CREAM = "hsl(40 33% 96%)";

type Modulo = {
  icon: typeof TestTube;
  nome: string;
  descricao: string;
  href: string;
  external?: boolean;
  destaque?: boolean;
  grupo: "clinico" | "importacao" | "curadoria";
};

const MODULOS: Modulo[] = [
  {
    icon: TestTube,
    nome: "Exames do Cliente",
    descricao: "Mesa clínica — todos os analitos extraídos, série temporal e faixas de referência.",
    href: "/exames-cliente",
    grupo: "clinico",
  },
  {
    icon: MapPin,
    nome: "Procedência de Exames",
    descricao: "De onde veio cada laudo: Portal, Drive ou Admin. Status de processamento.",
    href: "/procedencia-exames",
    grupo: "clinico",
  },
  {
    icon: ClipboardList,
    nome: "Prescritor de Exames",
    descricao: "Solicite exames ao cliente, gere pedido e envie por WhatsApp ou e-mail.",
    href: "/exames",
    grupo: "clinico",
  },
  {
    icon: ExternalLink,
    nome: "Portal do Cliente",
    descricao: "Área pública — o cliente faz upload do exame em casa pelo celular ou PC.",
    href: "/portal",
    external: true,
    destaque: true,
    grupo: "importacao",
  },
  {
    icon: DownloadCloud,
    nome: "Importação do Drive",
    descricao: "Importe manualmente um arquivo já no Google Drive para extração imediata.",
    href: "/importar-drive",
    grupo: "importacao",
  },
  {
    icon: Radar,
    nome: "Vigilância Drive",
    descricao: "Painel automático — detecta arquivos novos nas pastas monitoradas a cada 4h.",
    href: "/arsenal/drive-watcher",
    grupo: "importacao",
  },
  {
    icon: Activity,
    nome: "Monitor do Motor",
    descricao: "Status do motor Gemini: processando, concluídos, erros. Acionar recovery manual.",
    href: "/exames/monitor",
    destaque: true,
    grupo: "importacao",
  },
  {
    icon: FlaskConical,
    nome: "Exames & Blocos",
    descricao: "Cadastro de exames, blocos de solicitação e curadoria do catálogo clínico.",
    href: "/cadastros/exames",
    grupo: "curadoria",
  },
  {
    icon: Compass,
    nome: "Console de Exames",
    descricao: "Triagem de analitos desconhecidos, deduplicação de nomes e mapeamento.",
    href: "/cadastros/console-exames",
    grupo: "curadoria",
  },
  {
    icon: Microscope,
    nome: "Configuração de Exames",
    descricao: "Parâmetros do motor: faixas de referência, direções e unidades canônicas.",
    href: "/cadastros/config-exames",
    grupo: "curadoria",
  },
];

const GRUPOS: { id: Modulo["grupo"]; label: string; cor: string }[] = [
  { id: "clinico",    label: "Uso Clínico",   cor: "#16294a" },
  { id: "importacao", label: "Importação & Motor", cor: "#7a3220" },
  { id: "curadoria",  label: "Curadoria do Catálogo", cor: "#1a4d3a" },
];

function Card({ m }: { m: Modulo }) {
  const Ic = m.icon;
  const inner = (
    <div
      className="panel-3d p-5 flex flex-col gap-3 h-full cursor-pointer transition-all duration-150 hover:scale-[1.015]"
      style={{
        borderLeft: `4px solid ${m.destaque ? GOLD : "rgba(22,41,74,0.3)"}`,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="concave-3d p-2 rounded-[6px] shrink-0">
          <Ic className="h-4 w-4" style={{ color: GOLD }} />
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="block text-[12px] font-black uppercase tracking-[0.06em] leading-tight"
            style={{ color: NAVY }}
          >
            {m.nome}
          </span>
          {m.external && (
            <span className="text-[10px] font-semibold" style={{ color: GOLD }}>
              Link externo
            </span>
          )}
        </div>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-300" />
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: "#475569" }}>
        {m.descricao}
      </p>
    </div>
  );

  if (m.external) {
    return (
      <a href={m.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {inner}
      </a>
    );
  }
  return (
    <Link href={m.href} className="block h-full">
      {inner}
    </Link>
  );
}

export default function ExamesHubPage() {
  return (
    <div className="min-h-screen font-sans" style={{ background: CREAM }}>
      {/* HEADER */}
      <header
        className="px-6 py-5"
        style={{
          background: "linear-gradient(180deg,#1e3668 0%,#16294a 100%)",
          borderBottom: "2px solid rgba(231,205,143,0.25)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex items-center gap-3">
          <Microscope className="h-5 w-5 shrink-0" style={{ color: GOLD }} />
          <h1
            className="text-[20px] font-black uppercase tracking-[0.10em]"
            style={{ color: "#e7cd8f", textShadow: "0 1px 8px rgba(0,0,0,0.55)" }}
          >
            Exames — Hub Central
          </h1>
        </div>
        <p className="mt-1 text-[12px] text-slate-400">
          Todos os módulos do ecossistema. Portal → Drive + Extração Gemini → Cockpit da Consulta.
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Blueprint do fluxo */}
        <div className="panel-3d p-4">
          <div
            className="mb-2 text-[10px] font-black uppercase tracking-[0.28em]"
            style={{ color: GOLD }}
          >
            Fluxo Completo — Ponta a Ponta
          </div>
          <div
            className="font-mono text-[11px] leading-6"
            style={{ color: "#334155" }}
          >
            <span className="font-semibold" style={{ color: NAVY }}>Portal do Cliente</span>
            {" → "}
            <span>Drive (arquivo salvo)</span>
            {" + "}
            <span className="font-semibold" style={{ color: "#7a3220" }}>Motor Gemini (extração)</span>
            {" → "}
            <span className="font-semibold" style={{ color: "#1a4d3a" }}>exam_documents + exam_results</span>
            {" → "}
            <span className="font-semibold" style={{ color: NAVY }}>Cockpit (aba Exames + Evolução)</span>
          </div>
        </div>

        {/* Módulos por grupo */}
        {GRUPOS.map((g) => {
          const items = MODULOS.filter((m) => m.grupo === g.id);
          return (
            <div key={g.id}>
              <div
                className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em]"
                style={{ color: g.cor }}
              >
                <div
                  className="h-0.5 w-4 rounded-full"
                  style={{ background: g.cor }}
                />
                {g.label}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((m) => (
                  <Card key={m.href} m={m} />
                ))}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
