import { useEffect, useMemo, useState } from "react";
import { useListClients } from "@workspace/api-client-react";
import { ClientPicker } from "@/components/ClientPicker";
import {
  FlaskConical,
  Syringe,
  Gem,
  ClipboardList,
  ClipboardCheck,
  TrendingUp,
  FileText,
  UserRound,
} from "lucide-react";
import EvolucaoExamesPanel from "@/pages/cockpit/panels/EvolucaoExamesPanel";
import Injetaveis from "@/pages/cockpit/panels/Injetaveis";
import PrescricaoPage from "@/pages/prescricao";
import NovoProtocolo from "@/pages/protocols/new";
import ExamesPage from "@/pages/exames";
import DocumentosPanel from "./panels/DocumentosPanel";
import AvisoSemAnamnese from "./panels/AvisoSemAnamnese";
import AnamnesePreviaPanel from "./panels/AnamnesePreviaPanel";
import ExamesEnviadosPanel from "./panels/ExamesEnviadosPanel";
import ContratosTimelineInline from "./panels/ContratosTimelineInline";
import ClienteCracha from "./panels/ClienteCracha";
import AcompanhamentoDiarioPanel from "./panels/AcompanhamentoDiarioPanel";

// ===========================================================================
// COCKPIT DO CLIENTE (Cockpit da Consulta — Onda 3, 14/07/2026):
// faixa superior navy + regua de abas + conteudo CLARO (skill-layout-paxter).
// Seleciona o cliente UMA vez e persiste (localStorage + URL ?cliente=ID) para
// sobreviver ao sair/voltar. As abas Prescricao/Injetaveis/Implantes/Exames
// renderizam as TELAS ORIGINAIS embutidas (fonte unica), nao copias divergentes.
// Um crachá clinico rico (cadastro + quadro clinico) abre o cabeçalho.
// Spec: specs/cockpit-cliente-onda3-consolidacao.md
// ===========================================================================

const NAVY = "#16294a";
const GOLD = "#9a7b32";
const CREAM = "hsl(40 33% 96%)";

type AbaId =
  | "prescricao"
  | "injetaveis"
  | "implantes"
  | "exames"
  | "evolucao"
  | "anamnese"
  | "documentos";

const ABAS: { id: AbaId; rotulo: string; Icon: typeof FlaskConical }[] = [
  { id: "prescricao", rotulo: "Prescrição", Icon: FlaskConical },
  { id: "injetaveis", rotulo: "Injetáveis", Icon: Syringe },
  { id: "implantes", rotulo: "Implantes", Icon: Gem },
  { id: "exames", rotulo: "Exames", Icon: ClipboardList },
  { id: "evolucao", rotulo: "Evolução", Icon: TrendingUp },
  { id: "documentos", rotulo: "Documentos", Icon: FileText },
  { id: "anamnese", rotulo: "Anamnese Prévia", Icon: ClipboardCheck },
];

const LS_CLIENTE = "cockpit.clienteId";
const LS_ABA = "cockpit.aba";

// Persistencia (BUG da Onda 3): cliente selecionado sobrevive ao sair/voltar.
// Le da URL (?cliente=ID) primeiro; depois do localStorage.
function lerClienteInicial(): number | null {
  try {
    const q = new URLSearchParams(window.location.search).get("cliente");
    if (q && /^\d+$/.test(q)) return Number(q);
    const ls = localStorage.getItem(LS_CLIENTE);
    if (ls && /^\d+$/.test(ls)) return Number(ls);
  } catch {
    /* ambiente sem window/localStorage: segue sem persistencia */
  }
  return null;
}

function lerAbaInicial(): AbaId {
  try {
    const q = new URLSearchParams(window.location.search).get("aba");
    if (q && ABAS.some((a) => a.id === q)) return q as AbaId;
    const s = localStorage.getItem(LS_ABA);
    if (s && ABAS.some((a) => a.id === s)) return s as AbaId;
  } catch {
    /* ignore */
  }
  return "prescricao";
}

export default function CockpitCliente() {
  const [clienteId, setClienteIdState] = useState<number | null>(lerClienteInicial);
  const [aba, setAbaState] = useState<AbaId>(lerAbaInicial);

  function selecionarCliente(id: number | null) {
    setClienteIdState(id);
    try {
      if (id == null) localStorage.removeItem(LS_CLIENTE);
      else localStorage.setItem(LS_CLIENTE, String(id));
      const url = new URL(window.location.href);
      if (id == null) url.searchParams.delete("cliente");
      else url.searchParams.set("cliente", String(id));
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }

  function selecionarAba(a: AbaId) {
    setAbaState(a);
    try {
      localStorage.setItem(LS_ABA, a);
      const url = new URL(window.location.href);
      url.searchParams.set("aba", a);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }

  const { data: clients } = useListClients();
  const opcoes = useMemo(
    () => (clients ?? []).map((c) => ({ id: c.id, name: c.name })),
    [clients],
  );

  // Se o cliente persistido nao existir mais no banco, limpa a selecao.
  useEffect(() => {
    if (clienteId != null && clients && !clients.some((c) => c.id === clienteId)) {
      selecionarCliente(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, clienteId]);

  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM }}>
      {/* Faixa de topo navy — sem wordmark PAXTER (o sidebar ja carrega a marca) */}
      <header
        className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
        style={{
          background: "linear-gradient(180deg,#1e3668 0%,#16294a 55%,#0f1e3a 100%)",
          borderBottom: "2px solid rgba(231,205,143,0.45)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.30em] text-slate-400"
          >
            Padcon Conect
          </span>
          <span
            className="text-[22px] font-bold leading-tight tracking-[0.08em] uppercase"
            style={{
              fontFamily: "var(--app-font-display)",
              color: "#e7cd8f",
              textShadow: "0 1px 8px rgba(0,0,0,0.55)",
            }}
          >
            Cockpit da Consulta
          </span>
        </div>
        <ClientPicker
          clientes={opcoes}
          value={clienteId}
          onChange={(id) => selecionarCliente(id)}
          placeholder="Selecionar cliente…"
          triggerClassName="min-w-[280px] bg-white/95 text-[#16294a] font-semibold shadow-lg"
        />
      </header>

      {/* Régua de abas */}
      <nav
        className="flex flex-wrap items-end gap-1 px-5 pt-2"
        style={{
          background: "linear-gradient(180deg,#0f1e3a 0%,#13233f 100%)",
          borderBottom: "1px solid rgba(231,205,143,0.18)",
        }}
      >
        {ABAS.map(({ id, rotulo, Icon }) => {
          const ativo = aba === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selecionarAba(id)}
              className={`flex items-center gap-1.5 rounded-t-[7px] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide transition-all duration-150 ${
                ativo ? "-translate-y-0.5 text-[#16294a]" : "text-slate-400 hover:text-slate-200"
              }`}
              style={
                ativo
                  ? {
                      background: "linear-gradient(180deg,#fffbf0 0%,#f1e7cf 100%)",
                      borderTop: `2px solid ${GOLD}`,
                      boxShadow:
                        "0 -4px 14px -2px rgba(231,205,143,0.45), 0 4px 0 #f1e7cf, inset 0 2px 0 rgba(255,255,255,0.95)",
                    }
                  : {
                      background: "rgba(255,255,255,0.04)",
                      boxShadow: "inset 0 2px 6px rgba(0,0,0,0.32), inset 0 -1px 0 rgba(255,255,255,0.04)",
                    }
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {rotulo}
            </button>
          );
        })}
      </nav>

      {/* Conteúdo claro */}
      <main className="px-4 py-6">
        {clienteId == null ? (
          <div className="panel-3d mx-auto mt-10 max-w-xl p-8 text-center">
            <UserRound className="mx-auto mb-3 h-8 w-8" style={{ color: "#9a7b32" }} />
            <div className="text-[15px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
              Selecione o cliente
            </div>
            <p className="mt-2 text-sm text-[#647c97]">
              Escolha o cliente na faixa superior. Todas as ferramentas da consulta
              (prescrição, injetáveis, implantes, exames, evolução, anamnese prévia
              e documentos) ficam nesta tela, sem trocar de página.
            </p>
          </div>
        ) : (
          <div key={clienteId}>
            {/* Crachá clínico rico (cadastro + quadro clínico) */}
            <ClienteCracha clientId={clienteId} />

            {/* Faixa de acompanhamento diário reportado pelo cliente */}
            <AcompanhamentoDiarioPanel clientId={clienteId} />

            {aba === "prescricao" && <PrescricaoPage clientId={clienteId} embedded />}
            {aba === "injetaveis" && (
              <div className="space-y-6">
                <NovoProtocolo clientId={clienteId} embedded />
                <Injetaveis
                  clientId={clienteId}
                  filtroProcedimento="injetavel"
                  ocultarBotaoNovo
                />
              </div>
            )}
            {aba === "implantes" && (
              <div className="space-y-6">
                <NovoProtocolo clientId={clienteId} embedded />
                <Injetaveis
                  clientId={clienteId}
                  filtroProcedimento="implante"
                  ocultarBotaoNovo
                />
              </div>
            )}
            {aba === "exames" && (
              <div className="space-y-4">
                <AvisoSemAnamnese clientId={clienteId} />
                <ExamesPage clientId={clienteId} embedded />
                <ExamesEnviadosPanel clientId={clienteId} />
              </div>
            )}
            {aba === "evolucao" && <EvolucaoExamesPanel clientId={clienteId} />}
            {aba === "anamnese" && <AnamnesePreviaPanel clientId={clienteId} />}
            {aba === "documentos" && (
              <div className="space-y-6">
                <DocumentosPanel clientId={clienteId} />
                <ContratosTimelineInline clientId={clienteId} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
