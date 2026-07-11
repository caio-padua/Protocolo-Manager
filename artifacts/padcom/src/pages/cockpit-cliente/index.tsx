import { useMemo, useState } from "react";
import { useListClients } from "@workspace/api-client-react";
import { ClientPicker } from "@/components/ClientPicker";
import {
  FlaskConical,
  Syringe,
  Gem,
  ClipboardList,
  TrendingUp,
  FileText,
  UserRound,
} from "lucide-react";
import EvolucaoExamesPanel from "@/pages/cockpit/panels/EvolucaoExamesPanel";
import PedidosExamesPanel from "@/pages/cockpit/panels/PedidosExamesPanel";
import PrescricaoFormulasPanel from "@/pages/cockpit/panels/PrescricaoFormulasPanel";
import Injetaveis from "@/pages/cockpit/panels/Injetaveis";
import LancadorInline from "./panels/LancadorInline";
import DocumentosPanel from "./panels/DocumentosPanel";
import AvisoSemAnamnese from "./panels/AvisoSemAnamnese";

// ===========================================================================
// COCKPIT DO CLIENTE (Cockpit da Consulta — formato do print do CEO):
// faixa superior navy + regua de abas + conteudo CLARO (skill-layout-paxter).
// Seleciona o cliente UMA vez; todas as ferramentas inline, sem trocar de tela.
// Spec: specs/cockpit-cliente-abas.md
// ===========================================================================

const NAVY = "#16294a";
const CREAM = "hsl(40 33% 96%)";

type AbaId =
  | "prescricao"
  | "injetaveis"
  | "implantes"
  | "exames"
  | "evolucao"
  | "documentos";

const ABAS: { id: AbaId; rotulo: string; Icon: typeof FlaskConical }[] = [
  { id: "prescricao", rotulo: "Prescrição", Icon: FlaskConical },
  { id: "injetaveis", rotulo: "Injetáveis", Icon: Syringe },
  { id: "implantes", rotulo: "Implantes", Icon: Gem },
  { id: "exames", rotulo: "Exames", Icon: ClipboardList },
  { id: "evolucao", rotulo: "Evolução", Icon: TrendingUp },
  { id: "documentos", rotulo: "Documentos", Icon: FileText },
];

function idade(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const d = new Date(`${birthDate}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos;
}

export default function CockpitCliente() {
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [aba, setAba] = useState<AbaId>("prescricao");

  const { data: clients } = useListClients();
  const opcoes = useMemo(
    () => (clients ?? []).map((c) => ({ id: c.id, name: c.name })),
    [clients],
  );
  const cliente = useMemo(
    () => (clients ?? []).find((c) => c.id === clienteId) ?? null,
    [clients, clienteId],
  );
  const anos = idade(cliente?.birthDate);

  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM }}>
      {/* Faixa de topo navy */}
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-7 py-3"
        style={{
          background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)",
          borderBottom: "1px solid rgba(231,205,143,0.35)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-serif text-[19px] font-semibold tracking-[0.16em]"
            style={{ color: "#e7cd8f", textShadow: "0 1px 0 rgba(0,0,0,0.45)" }}
          >
            PAXTER
          </span>
          <span className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
            Cockpit da Consulta
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ClientPicker
            clientes={opcoes}
            value={clienteId}
            onChange={(id) => setClienteId(id)}
            placeholder="Selecionar cliente…"
            triggerClassName="min-w-[240px] bg-white/95 text-[#16294a]"
          />
          <div className="text-right leading-tight">
            {cliente ? (
              <>
                <div className="text-[13px] font-semibold uppercase tracking-wide text-white">
                  {cliente.name}
                </div>
                <div className="text-[11px] text-slate-300">
                  {cliente.cpf ? `CPF ${cliente.cpf}` : "CPF não informado"}
                  {anos != null ? ` · ${anos} anos` : ""}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-[12px] text-slate-300">
                <UserRound className="h-4 w-4" /> Nenhum cliente selecionado
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Régua de abas */}
      <nav className="flex flex-wrap items-end gap-1 px-7 pt-3" style={{ background: "#13233f" }}>
        {ABAS.map(({ id, rotulo, Icon }) => {
          const ativo = aba === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className={`flex items-center gap-1.5 rounded-t-[5px] px-4 py-2 text-[12px] font-semibold uppercase tracking-wide ${
                ativo ? "text-[#16294a]" : "text-slate-300 hover:text-white"
              }`}
              style={
                ativo
                  ? { background: CREAM, borderTop: "2px solid #e7cd8f" }
                  : { background: "rgba(255,255,255,0.04)" }
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {rotulo}
            </button>
          );
        })}
      </nav>

      {/* Conteúdo claro */}
      <main className="px-7 py-6">
        {clienteId == null ? (
          <div className="panel-3d mx-auto mt-10 max-w-xl p-8 text-center">
            <UserRound className="mx-auto mb-3 h-8 w-8" style={{ color: "#9a7b32" }} />
            <div className="text-[15px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
              Selecione o cliente
            </div>
            <p className="mt-2 text-sm text-[#647c97]">
              Escolha o cliente na faixa superior. Todas as ferramentas da consulta
              (prescrição, injetáveis, implantes, exames, evolução e documentos)
              ficam nesta tela, sem trocar de página.
            </p>
          </div>
        ) : (
          <div key={clienteId}>
            {aba === "prescricao" && <PrescricaoFormulasPanel clientId={clienteId} />}
            {aba === "injetaveis" && (
              <div className="space-y-6">
                <LancadorInline clientId={clienteId} tipo="injetavel" />
                <Injetaveis
                  clientId={clienteId}
                  filtroProcedimento="injetavel"
                  ocultarBotaoNovo
                />
              </div>
            )}
            {aba === "implantes" && (
              <div className="space-y-6">
                <LancadorInline clientId={clienteId} tipo="implante" />
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
                <PedidosExamesPanel clientId={clienteId} />
              </div>
            )}
            {aba === "evolucao" && <EvolucaoExamesPanel clientId={clienteId} />}
            {aba === "documentos" && <DocumentosPanel clientId={clienteId} />}
          </div>
        )}
      </main>
    </div>
  );
}
