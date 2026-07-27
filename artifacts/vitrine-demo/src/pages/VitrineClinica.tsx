import "../components/paxter/paxter3d.css";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Building2,
  Calendar,
  ChevronRight,
  Crown,
  FileText,
  HeartPulse,
  MessageSquareText,
  Smartphone,
  Sparkles,
  Stethoscope,
  TestTube2,
  Wallet,
  X,
} from "lucide-react";
import { PaxterSymbolPremium } from "../components/paxter/PaxterSymbolPremium";
import { LOCKUP_STYLE, PaxterWord } from "../components/paxter/paxterLockup";
import { AppPreview, VITRINE_STYLE } from "./VitrineDemo";

/* ----------------------------------------------------------------------------
   VITRINE PARA CLÍNICAS (B2B) — apresentação para o médico dono de clínica
   que quer saber se o sistema vale a pena. Página pública, SÓ LEITURA,
   dados de EXEMPLO, sem preços (valores tratados no contato comercial).
---------------------------------------------------------------------------- */

const DORES = [
  "Agenda espalhada entre papel, planilha e WhatsApp.",
  "Exames chegam por foto e se perdem na conversa.",
  "Receitas e termos refeitos à mão a cada protocolo.",
  "Paciente some entre uma sessão e outra — sem recorrência.",
];

const MOTORES = [
  { Icon: HeartPulse, t: "Motor de protocolos injetáveis", s: "Protocolo, sessões e evolução do paciente em um só lugar." },
  { Icon: Calendar, t: "Agenda inteligente", s: "Marcação, confirmação e lembretes automáticos por WhatsApp e e-mail." },
  { Icon: BrainCircuit, t: "Exames lidos por IA", s: "O laudo em PDF vira tabela de evolução — sem digitação." },
  { Icon: FileText, t: "Documentos e receituário", s: "Receitas, termos e laudos emitidos e assinados digitalmente." },
  { Icon: Wallet, t: "Orçamentos e financeiro", s: "Console de orçamento, cobrança e visão de caixa da clínica." },
  { Icon: MessageSquareText, t: "Mensageria da clínica", s: "Comunicação com a sua marca, no tom da sua clínica." },
];

const PASSOS = [
  { n: "1", t: "Conversa e diagnóstico", s: "Entendemos a rotina da sua clínica." },
  { n: "2", t: "Implantação assistida", s: "Sistema configurado com a sua equipe e a sua marca." },
  { n: "3", t: "Clínica no ar", s: "Equipe operando e pacientes com o aplicativo na mão." },
];

function ContatoSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(4,10,22,0.6)" }} onClick={onClose}>
      <div className="suit-navy-bg gold-hair w-full max-w-[430px] px-5 pb-6 pt-4 fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#e7cd8f]" />
            <span className="text-[14px] font-bold uppercase tracking-[0.1em] text-white">Falar com a PAXTER</span>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-slate-300"><X className="h-5 w-5" /></button>
        </div>
        <div className="gold-hair px-4 py-4" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="text-[13px] font-bold text-white">Demonstração para a sua clínica</div>
          <div className="mt-1 text-[11px] leading-snug text-slate-300">
            Esta é uma página de demonstração. Na versão publicada, este botão abre o canal
            comercial oficial (WhatsApp) para agendar a apresentação ao vivo com a sua equipe.
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[#cbb778]">
          <BadgeCheck className="h-4 w-4" /> Sem compromisso — valores tratados na conversa
        </div>
      </div>
    </div>
  );
}

export function VitrineClinica() {
  const [showContato, setShowContato] = useState(false);

  return (
    <div className="area-root suit-navy-bg min-h-screen w-full font-sans">
      <style>{LOCKUP_STYLE + VITRINE_STYLE}</style>

      <div className="relative mx-auto w-full max-w-[430px] overflow-hidden suit-navy-bg" style={{ boxShadow: "0 24px 60px -20px rgba(0,0,0,0.8)" }}>
        {/* FITA — APRESENTAÇÃO PARA CLÍNICAS */}
        <div className="flex items-center justify-center gap-2 px-4 py-[6px]" style={{ background: "linear-gradient(90deg,#e7cd8f,#c2a05a)" }}>
          <Building2 className="h-3.5 w-3.5 text-[#3a2c08]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#3a2c08]">Apresentação para clínicas — demonstração</span>
        </div>

        {/* FAIXA — PAXTER */}
        <div className="flex items-center justify-center gap-2 px-4 py-4 gold-hair" style={{ borderLeft: "none", borderRight: "none", borderTop: "none" }}>
          <PaxterSymbolPremium size={36} tone="dark" />
          <PaxterWord theme="dark" fontSize={24} />
        </div>

        {/* HERO */}
        <div className="px-5 pb-5 pt-6 text-center">
          <div className="font-serif text-[26px] font-bold leading-tight text-white">
            A sua clínica com o<br />próprio aplicativo
          </div>
          <div className="mx-auto mt-3 max-w-[330px] text-[12px] leading-snug text-slate-300">
            Um motor clínico completo para protocolos injetáveis — e um aplicativo que
            gera desejo nos seus pacientes. Veja se vale a pena para a sua clínica.
          </div>
        </div>

        <div className="px-4 pb-40">
          {/* DORES */}
          <div className="mb-3 mt-2 inline-flex items-center gap-2 bg-white/90 px-3 py-[6px]">
            <Stethoscope className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">A rotina que você conhece</span>
          </div>
          <div className="flex flex-col gap-2">
            {DORES.map((d) => (
              <div key={d} className="gold-hair flex items-center gap-3 px-3 py-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "#c2a05a" }} />
                <span className="text-[12px] leading-snug text-slate-200">{d}</span>
              </div>
            ))}
          </div>

          {/* MOTORES */}
          <div className="mb-3 mt-6 inline-flex items-center gap-2 bg-white/90 px-3 py-[6px]">
            <Sparkles className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">O que o sistema entrega</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {MOTORES.map((m) => (
              <div key={m.t} className="screen-3d px-3 py-3">
                <div className="concave-3d mb-2 flex h-9 w-9 items-center justify-center">
                  <m.Icon className="h-5 w-5" style={{ color: "#9a7b32" }} />
                </div>
                <div className="text-[12px] font-bold leading-tight text-[#16294a]">{m.t}</div>
                <div className="mt-1 text-[10px] leading-snug text-[#5b6b80]">{m.s}</div>
              </div>
            ))}
          </div>

          {/* MÓDULO DE DESEJO — o app do paciente */}
          <div className="mb-3 mt-6 inline-flex items-center gap-2 bg-white/90 px-3 py-[6px]">
            <Smartphone className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">O aplicativo do seu paciente</span>
          </div>
          <div className="mx-auto mt-1 max-w-[330px] text-center text-[11px] leading-snug text-slate-300">
            Este módulo gera desejo: o seu paciente vê o protocolo, a agenda, os exames e os
            documentos na palma da mão — com a marca da sua clínica.
          </div>
          <div className="mt-4">
            <AppPreview />
            <div className="mt-2 text-center text-[10px] uppercase tracking-[0.14em] text-[#cbb778]">Toque nas abas — é ao vivo</div>
          </div>
          <a href="/vitrine-demo/" className="gold-hair mt-3 flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#cbb778]" style={{ background: "rgba(255,255,255,0.05)" }}>
            Ver a vitrine completa do paciente <ChevronRight className="h-3.5 w-3.5" />
          </a>

          {/* CÍRCULOS — recorrência */}
          <div className="mt-6 flex items-center gap-3 px-4 py-3 gold-hair" style={{ background: "rgba(255,255,255,0.04)" }}>
            <Crown className="h-5 w-5 shrink-0 text-[#e7cd8f]" />
            <span className="text-[11px] leading-snug text-slate-300">
              Os Círculos PAXTER (Bronze, Ouro, Platina e Noir) transformam atendimento avulso
              em relação de longo prazo — recorrência para a clínica, pertencimento para o paciente.
            </span>
          </div>

          {/* COMO FUNCIONA */}
          <div className="mb-3 mt-6 inline-flex items-center gap-2 bg-white/90 px-3 py-[6px]">
            <TestTube2 className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">Como funciona</span>
          </div>
          <div className="flex flex-col gap-2">
            {PASSOS.map((p) => (
              <div key={p.n} className="gold-hair flex items-center gap-3 px-3 py-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-[15px] font-bold text-[#e7cd8f]" style={{ background: "rgba(231,205,143,0.12)" }}>
                  {p.n}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-white">{p.t}</div>
                  <div className="text-[11px] leading-snug text-slate-300">{p.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA FIXO */}
        <div className="sticky bottom-0 suit-navy-bg px-4 py-3 gold-hair" style={{ borderLeft: "none", borderRight: "none", borderBottom: "none", boxShadow: "0 -8px 22px -12px rgba(0,0,0,0.6)" }}>
          <button onClick={() => setShowContato(true)} className="btn-3d cta-glow flex w-full items-center justify-center gap-2 px-4 py-3 text-[14px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">
            <Building2 className="h-4 w-4" /> Quero para a minha clínica
          </button>
          <a href="/vitrine-demo/" className="mt-2 flex w-full items-center justify-center gap-2 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-white gold-hair" style={{ background: "rgba(255,255,255,0.06)" }}>
            Ver o aplicativo do paciente <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      {showContato && <ContatoSheet onClose={() => setShowContato(false)} />}
    </div>
  );
}
