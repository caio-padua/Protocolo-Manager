// Entrada do LICENCIADO — Visao de Desejo (spec: specs/entrada-licenciado-visao-desejo.md)
//
// O licenciado ve a estrutura do sistema (mesma taxonomia de modulos de
// empresas.modulos_ativos / menuItems do servidor), porem TRAVADA: cada
// modulo mostra um cadeado e, ao clicar, abre a mensagem de desejo com a
// descricao, o valor promocional de 48 horas e a regra dos 10% de indicacao.
//
// Hoje somente o proprio CEO usa esta entrada (login proprio de licenciado)
// para sentir o produto como um licenciado sentiria.

import { useState } from "react";
import { useLocation } from "wouter";
import {
  Stethoscope,
  Calendar,
  Brain,
  Microscope,
  TrendingUp,
  Package,
  MessageSquare,
  FileBarChart,
  Beaker,
  FileText,
  Lock,
  Crown,
  Clock,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { PaxterLogo } from "@/components/layout/PaxterLogo";
import { clearCollabSession } from "@/lib/collab-auth";

// ─── Catalogo de modulos (mesmas chaves de empresas.modulos_ativos) ─────────
// VALORES: promocionais de lancamento, EDITAVEIS pelo CEO neste arquivo.
// adesao48h = valor de adesao valido por 48 horas; adesaoCheia = depois disso.
// mensalidade NUNCA muda com desconto de indicacao (regra do CEO 27/07/2026).

interface ModuloDesejo {
  key: string;
  nome: string;
  icon: LucideIcon;
  oQueFaz: string;
  beneficio: string;
  adesao48h: number;
  adesaoCheia: number;
  mensalidade: number;
}

const MODULOS: ModuloDesejo[] = [
  {
    key: "cockpit",
    nome: "Cockpit da Consulta",
    icon: Stethoscope,
    oQueFaz: "A consulta inteira numa tela so: prontuario, prescricao, exames, protocolos e documentos do cliente, sem trocar de janela.",
    beneficio: "Consultas mais rapidas e completas — o medico nunca sai do voo.",
    adesao48h: 1497, adesaoCheia: 1997, mensalidade: 297,
  },
  {
    key: "agenda",
    nome: "Agenda & Sessoes",
    icon: Calendar,
    oQueFaz: "Agenda espelhada no Google Calendar, marcacao pelo proprio cliente, sessoes de aplicacao e lembretes automaticos por WhatsApp e e-mail.",
    beneficio: "Menos falta, menos telefone tocando, recepcao respirando.",
    adesao48h: 997, adesaoCheia: 1397, mensalidade: 197,
  },
  {
    key: "protocolos",
    nome: "Protocolos & Receituario",
    icon: FileText,
    oQueFaz: "Protocolos injetaveis completos, prescricao assistida e receituario com assinatura digital ICP-Brasil emitido em segundos.",
    beneficio: "Padrao de excelencia clinica com papel timbrado digital proprio.",
    adesao48h: 1997, adesaoCheia: 2697, mensalidade: 347,
  },
  {
    key: "anamnese",
    nome: "Anamnese Inteligente",
    icon: Brain,
    oQueFaz: "Anamnese dinamica que o cliente responde do celular antes da consulta, com alertas clinicos e revisao pelo medico.",
    beneficio: "O cliente chega com a historia pronta; a consulta comeca no minuto um.",
    adesao48h: 1297, adesaoCheia: 1797, mensalidade: 247,
  },
  {
    key: "exames_lab",
    nome: "Motor de Exames",
    icon: Microscope,
    oQueFaz: "Leitura automatica de laudos em PDF (inclusive escaneados), evolucao de cada analito em graficos e importacao direta do Google Drive.",
    beneficio: "Anos de exames organizados sozinhos, sem digitacao.",
    adesao48h: 1797, adesaoCheia: 2397, mensalidade: 297,
  },
  {
    key: "financeiro",
    nome: "Financeiro & Cobranca",
    icon: TrendingUp,
    oQueFaz: "Cobranca por PIX, boleto e cartao (Asaas), conciliacao automatica, nota fiscal e metas da clinica em painel.",
    beneficio: "O dinheiro entra, concilia e aparece — sem planilha.",
    adesao48h: 1497, adesaoCheia: 1997, mensalidade: 297,
  },
  {
    key: "estoque",
    nome: "Estoque Clinico",
    icon: Package,
    oQueFaz: "Controle de insumos e injetaveis com baixa automatica por sessao e alerta de reposicao.",
    beneficio: "Nunca mais descobrir na hora que acabou o frasco.",
    adesao48h: 697, adesaoCheia: 997, mensalidade: 147,
  },
  {
    key: "comunicacao",
    nome: "Mensageria & Agentes",
    icon: MessageSquare,
    oQueFaz: "Lembretes de formulas por periodo do dia, mensagens de protocolo e agentes de WhatsApp trabalhando pela clinica.",
    beneficio: "A clinica conversa com o cliente todos os dias — sozinha.",
    adesao48h: 1297, adesaoCheia: 1797, mensalidade: 247,
  },
  {
    key: "ras",
    nome: "RAS & FAP",
    icon: FileBarChart,
    oQueFaz: "Registro de Assistencia Sistemico e Formulario de Auditoria de Procedimentos: a defesa documental da pratica clinica, gerada automaticamente.",
    beneficio: "Blindagem documental sem esforco manual.",
    adesao48h: 997, adesaoCheia: 1397, mensalidade: 197,
  },
  {
    key: "arsenal",
    nome: "Arsenal Clinico",
    icon: Beaker,
    oQueFaz: "Catalogo de substancias, formulas manipuladas, farmacias parceiras e orcamentos com console 3D de montagem.",
    beneficio: "Todo o arsenal terapeutico curado e precificado num lugar so.",
    adesao48h: 1497, adesaoCheia: 1997, mensalidade: 247,
  },
];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

export default function Licenciado() {
  const [aberto, setAberto] = useState<ModuloDesejo | null>(null);
  const [, setLocation] = useLocation();

  const sair = () => {
    clearCollabSession();
    setLocation("/entrada");
  };

  return (
    <div className="min-h-screen bg-[#0c1526] text-slate-100">
      {/* Faixa 1 — PAXTER (o sistema) */}
      <header className="border-b-4 border-[#e7cd8f]/40 bg-[#0a1120] px-6 py-4 flex items-center justify-between">
        <PaxterLogo />
        <button
          onClick={sair}
          className="text-xs uppercase tracking-widest text-slate-400 hover:text-slate-200 border border-slate-700 rounded-[6px] px-3 py-1.5"
        >
          Sair
        </button>
      </header>

      {/* Faixa 2 — identidade da entrada (nitidez CEO x licenciado) */}
      <div className="bg-[#101c33] border-b border-slate-800 px-6 py-3 flex items-center gap-3">
        <Users className="h-4 w-4 text-[#e7cd8f]" />
        <span className="text-sm font-semibold uppercase tracking-wide">
          Entrada do Licenciado
        </span>
        <span className="text-xs text-slate-400">
          Voce esta vendo o sistema como um medico licenciado. Os modulos abaixo sao ativados por adesao.
        </span>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Crown className="h-5 w-5 text-[#e7cd8f]" />
          <h1 className="text-lg font-bold uppercase tracking-widest">
            Modulos do Motor Clinico
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS.map((m) => (
            <button
              key={m.key}
              onClick={() => setAberto(m)}
              className="group relative rounded-[6px] border border-slate-700 bg-[#101c33] p-4 text-left transition hover:border-[#e7cd8f]/60"
            >
              <div className="flex items-center justify-between">
                <m.icon className="h-6 w-6 text-slate-300" />
                <Lock className="h-4 w-4 text-[#e7cd8f]" aria-label="Modulo travado" />
              </div>
              <div className="mt-3 text-sm font-semibold uppercase tracking-wide">
                {m.nome}
              </div>
              <div className="mt-1 text-xs text-slate-400 line-clamp-2">{m.beneficio}</div>
              <div className="mt-3 text-[10px] uppercase tracking-widest text-[#e7cd8f]/80">
                Toque para conhecer
              </div>
            </button>
          ))}
        </div>
      </main>

      {/* Modal de desejo */}
      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAberto(null)}
        >
          <div
            className="w-full max-w-md rounded-[6px] border-2 border-[#e7cd8f]/50 bg-[#0e1830] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <aberto.icon className="h-6 w-6 text-[#e7cd8f]" />
                <h2 className="text-base font-bold uppercase tracking-wide">{aberto.nome}</h2>
              </div>
              <button onClick={() => setAberto(null)} aria-label="Fechar">
                <X className="h-5 w-5 text-slate-400 hover:text-slate-200" />
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-300">{aberto.oQueFaz}</p>
            <p className="mt-2 text-sm font-medium text-[#e7cd8f]">{aberto.beneficio}</p>

            <div className="mt-5 rounded-[6px] border border-[#e7cd8f]/30 bg-[#101c33] p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#e7cd8f]">
                <Clock className="h-4 w-4" />
                Condicao de lancamento — valida por 48 horas
              </div>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-800">
                    <td className="py-1.5 text-slate-400">Adesao nas proximas 48h</td>
                    <td className="py-1.5 text-right font-bold text-[#e7cd8f]">{fmt(aberto.adesao48h)}</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-1.5 text-slate-400">Adesao apos o prazo</td>
                    <td className="py-1.5 text-right text-slate-300 line-through decoration-slate-500">
                      {fmt(aberto.adesaoCheia)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-400">Mensalidade</td>
                    <td className="py-1.5 text-right font-semibold">{fmt(aberto.mensalidade)}/mes</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Indicado por outro licenciado? <b className="text-[#e7cd8f]">10% de desconto na adesao</b>.
              A mensalidade permanece a mesma.
            </p>

            <button
              className="mt-5 w-full rounded-[6px] border-2 border-[#e7cd8f] bg-[#e7cd8f]/10 py-3 text-sm font-bold uppercase tracking-widest text-[#e7cd8f] hover:bg-[#e7cd8f]/20"
              onClick={() => setAberto(null)}
            >
              Quero ativar este modulo
            </button>
            <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-slate-500">
              A ativacao e concluida com a equipe PAXTER
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
