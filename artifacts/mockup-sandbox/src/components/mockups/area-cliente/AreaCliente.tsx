import "./_group.css";
import { useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Clock,
  ConciergeBell,
  Copy,
  Crown,
  FileText,
  FlaskConical,
  Home,
  KeyRound,
  Lock,
  LogOut,
  MessageCircle,
  Repeat,
  ScrollText,
  Send,
  Sparkles,
  TestTube2,
  X,
} from "lucide-react";
import { PaxterSymbolPremium } from "../_shared/PaxterSymbolPremium";
import { LOCKUP_STYLE, PaxterWord } from "../_shared/paxterLockup";

/* ----------------------------------------------------------------------------
   ÁREA DO CLIENTE — porta única (mockup mobile). Correções do CEO 26/06/2026:
   - DESEJO IMPLÍCITO: planos viram um ÍCONE-COROA. Ao TOCAR, revela os "Círculos
     PAXTER" (descoberta) — sem comparativo aberto, sem preço, sem upsell.
   - Categoria do cliente VISÍVEL e discreta (selo "MEMBRO OURO").
   - Saudação "Senhor Ricardo" (sempre senhor/senhora).
   - PAXTER com o "R" renderizado OFICIAL (PaxterSymbolPremium + PaxterWord).
   - Três FAIXAS separadas em retângulos: PAXTER · nome+CPF · Bem-vindo.
   - Protocolos em PARALELO; progresso em segmentos retangulares (sem pill).
   - Textura de alfaiataria navy (terno escuro). Pagamento: Asaas.
---------------------------------------------------------------------------- */

const CATEGORIA = "OURO"; // categoria do cliente exemplo

const SUIT_STYLE = `
.suit-navy{
  background-color:#16294a;
  background-image:
    repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 1.5px, transparent 1.5px 4px),
    repeating-linear-gradient(-45deg, rgba(0,0,0,0.14) 0 1.5px, transparent 1.5px 4px),
    linear-gradient(180deg,#1d3565 0%,#16294a 58%,#101f3a 100%);
  border:1px solid rgba(231,205,143,0.30);
}
.suit-light{
  background-color:hsl(40 33% 96%);
  background-image:
    repeating-linear-gradient(45deg, rgba(120,90,30,0.05) 0 1.5px, transparent 1.5px 4px),
    repeating-linear-gradient(-45deg, rgba(120,90,30,0.04) 0 1.5px, transparent 1.5px 4px);
}
@keyframes crownGlow{0%,100%{box-shadow:0 0 0 0 rgba(231,205,143,0.0),inset 0 1px 0 rgba(255,255,255,0.3)}50%{box-shadow:0 0 14px 2px rgba(231,205,143,0.45),inset 0 1px 0 rgba(255,255,255,0.3)}}
.crown-pulse{animation:crownGlow 3600ms ease-in-out infinite}
@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.sheet-up{animation:sheetUp 320ms cubic-bezier(.2,.8,.2,1)}
@media (prefers-reduced-motion: reduce){.crown-pulse,.sheet-up{animation:none}}
`;

/* ---- Protocolos em paralelo (vários ao mesmo tempo) ---- */
type Proto = { nome: string; feitas: number; total: number };
const PROTOCOLOS: Proto[] = [
  { nome: "Longevidade & Energia", feitas: 4, total: 8 },
  { nome: "Performance & Imunidade", feitas: 2, total: 6 },
];

/* ---- Benefícios que o cliente pode solicitar (premium = cadeado discreto) ---- */
type Benef = {
  nome: string;
  sub: string;
  Icon: typeof FileText;
  premium: boolean;
  emBreve?: boolean;
};
const BENEFICIOS: Benef[] = [
  { nome: "Solicitar Exames", sub: "Novos exames para o acompanhamento", Icon: TestTube2, premium: false },
  { nome: "Atestado", sub: "Comparecimento ou afastamento", Icon: ScrollText, premium: false },
  { nome: "Encaminhamento", sub: "Indicação para outro especialista", Icon: Send, premium: true },
  { nome: "Laudo Médico", sub: "Documento do seu estado de saúde", Icon: FileText, premium: true },
  { nome: "Fórmula à Parte", sub: "Manipulado para uma queixa", Icon: FlaskConical, premium: true },
  { nome: "Renovar Receita", sub: "Continuidade do tratamento", Icon: Repeat, premium: true, emBreve: true },
  { nome: "Falar com a Equipe", sub: "Pedir contato ou abrir uma queixa", Icon: MessageCircle, premium: false, emBreve: true },
  { nome: "2ª Via de Documento", sub: "Reemitir um documento já gerado", Icon: Copy, premium: true, emBreve: true },
];

/* ---- Círculos PAXTER (revelados ao tocar a coroa) — implícitos, sem preço ---- */
type Tier = { nome: string; essencia: string };
const TIERS: Tier[] = [
  { nome: "BRONZE", essencia: "O cuidado essencial do seu protocolo." },
  { nome: "OURO", essencia: "Acompanhamento ampliado e prioridade no atendimento." },
  { nome: "PLATINA", essencia: "Concierge dedicada e mais solicitações inclusas." },
  { nome: "NOIR", essencia: "Tudo incluso. O círculo mais reservado." },
];

/* Progresso em RETÂNGULOS segmentados (sem barra arredondada) */
function Segmentos({ feitas, total }: { feitas: number; total: number }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-[10px] flex-1"
          style={{
            background: i < feitas ? "linear-gradient(180deg,#e7cd8f,#c2a05a)" : "rgba(7,22,43,0.12)",
            boxShadow: i < feitas ? "inset 0 1px 0 rgba(255,255,255,0.4)" : "inset 0 1px 2px rgba(7,22,43,0.18)",
          }}
        />
      ))}
    </div>
  );
}

/* Gaveta de descoberta dos Círculos PAXTER (abre ao tocar a coroa) */
function CirculosSheet({ onClose }: { onClose: () => void }) {
  const atualIdx = TIERS.findIndex((t) => t.nome === CATEGORIA);
  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-end" style={{ background: "rgba(7,16,32,0.55)" }} onClick={onClose}>
      <div
        className="sheet-up suit-navy w-full max-w-[430px] max-h-[86vh] overflow-y-auto px-4 pb-6 pt-4"
        style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "#e7cd8f" }} />
            <span className="font-serif text-[18px] font-bold text-white">Os Círculos PAXTER</span>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[6px]" style={{ background: "rgba(255,255,255,0.10)" }} aria-label="Fechar">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
        <div className="mb-4 text-[11px] leading-snug text-slate-300">
          Cada círculo abre mais portas no seu cuidado. Você está no <b className="text-[#e7cd8f]">OURO</b>.
        </div>

        <div className="flex flex-col gap-2">
          {TIERS.map((t, i) => {
            const atual = i === atualIdx;
            const acima = i > atualIdx;
            return (
              <div
                key={t.nome}
                className="flex items-center gap-3 px-3 py-3"
                style={{
                  background: atual ? "linear-gradient(180deg,#243f73,#1a3060)" : "rgba(255,255,255,0.05)",
                  border: atual ? "1.5px solid #e7cd8f" : "1px solid rgba(231,205,143,0.18)",
                }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px]" style={{ background: "rgba(231,205,143,0.12)" }}>
                  {acima ? <Crown className="h-5 w-5" style={{ color: "#e7cd8f" }} /> : <Sparkles className="h-4 w-4" style={{ color: "#cbb778" }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold tracking-[0.06em] text-white">{t.nome}</span>
                    {atual && (
                      <span className="rounded-[3px] px-[6px] py-[1px] text-[8px] font-bold uppercase tracking-[0.10em]" style={{ background: "#e7cd8f", color: "#3a2c08" }}>
                        Seu círculo
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] leading-snug text-slate-300">{t.essencia}</div>
                </div>
                {acima && <Lock className="h-4 w-4 shrink-0" style={{ color: "#c2a05a" }} />}
              </div>
            );
          })}
        </div>

        <button className="btn-3d mt-5 w-full px-4 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">
          Falar com a concierge
        </button>
        <div className="mt-2 text-center text-[10px] text-slate-400">Sem compromisso. Você decide quando evoluir.</div>
      </div>
    </div>
  );
}

export function AreaCliente() {
  const [descobrir, setDescobrir] = useState(false);

  return (
    <div className="area-root min-h-screen w-full font-sans" style={{ background: "#0d182b" }}>
      <style>{LOCKUP_STYLE + SUIT_STYLE}</style>

      <div
        className="relative mx-auto w-full max-w-[430px] overflow-hidden suit-light"
        style={{ boxShadow: "0 24px 60px -20px rgba(0,0,0,0.7)" }}
      >
        {/* ===== FAIXA 1 — PAXTER (o SISTEMA) ===== */}
        <div className="suit-navy flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <PaxterSymbolPremium size={34} tone="dark" />
            <PaxterWord theme="dark" fontSize={22} />
          </div>
          <button className="btn-3d-soft flex items-center gap-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#16294a]">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>

        {/* ===== FAIXA 2 — NOME + CPF ===== */}
        <div className="suit-light flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(184,146,77,0.30)" }}>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#9a7b32]">Senhor</div>
            <div className="text-[15px] font-bold uppercase tracking-[0.04em] text-[#16294a]">Ricardo Almeida Ferreira</div>
          </div>
          <div className="text-right text-[11px] leading-tight text-[#5b6b80]">
            <div>CPF 123.456.789-00</div>
            <div>47 anos</div>
          </div>
        </div>

        {/* ===== FAIXA 3 — BEM-VINDO (+ categoria visível + ícone-coroa) ===== */}
        <div className="suit-navy flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-300">Bem-vindo</div>
            <div className="font-serif text-[24px] font-bold leading-tight text-white">Senhor Ricardo</div>
            {/* categoria VISÍVEL e discreta (sem comparativo) */}
            <span
              className="mt-2 inline-flex items-center gap-1 rounded-[4px] px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ border: "1px solid rgba(231,205,143,0.6)", color: "#e7cd8f" }}
            >
              <Crown className="h-3 w-3" /> Membro {CATEGORIA}
            </span>
          </div>
          {/* ÍCONE-COROA: porta de descoberta dos planos. Sem texto, sem upsell. */}
          <button
            onClick={() => setDescobrir(true)}
            className="crown-pulse flex h-12 w-12 items-center justify-center rounded-[8px]"
            style={{ background: "linear-gradient(180deg,#1f3a6b,#15284a)", border: "1px solid rgba(231,205,143,0.55)" }}
            aria-label="Descobrir os Círculos PAXTER"
          >
            <Crown className="h-6 w-6" style={{ color: "#e7cd8f" }} />
          </button>
        </div>

        <div className="px-4 pb-24 pt-5">
          {/* ===== PROTOCOLOS EM PARALELO (retângulos) ===== */}
          <div className="bevel-3d mb-3 inline-flex items-center gap-2 px-3 py-[6px]">
            <ClipboardList className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">Meus protocolos</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {PROTOCOLOS.map((p) => (
              <div key={p.nome} className="screen-3d px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-[#16294a]">{p.nome}</span>
                  <span className="text-[12px] font-bold text-[#9a7b32]">
                    {p.feitas}/{p.total}
                  </span>
                </div>
                <div className="mt-2">
                  <Segmentos feitas={p.feitas} total={p.total} />
                </div>
              </div>
            ))}
          </div>

          {/* Próximo atendimento */}
          <div className="concave-3d mt-4 flex items-center gap-2 px-4 py-3">
            <Clock className="h-4 w-4 text-[#9a7b32]" />
            <span className="text-[12px] text-[#5b6b80]">Nenhum atendimento futuro agendado.</span>
          </div>

          {/* ===== VALIDAR PRESENÇA ===== */}
          <div className="mb-3 mt-6 flex items-center justify-between">
            <div className="bevel-3d inline-flex items-center gap-2 px-3 py-[6px]">
              <KeyRound className="h-4 w-4" style={{ color: "#9a7b32" }} />
              <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">Validar presença</span>
            </div>
            <span className="concave-3d px-2 py-[4px] text-[9px] font-bold uppercase tracking-[0.10em] text-[#647c97]">Código do dia</span>
          </div>
          <div className="panel-3d px-4 py-4">
            <div className="text-[11px] text-[#5b6b80]">Digite o código do WhatsApp ou sua senha permanente do protocolo.</div>
            <div className="mt-2 flex gap-2">
              <div className="concave-3d flex-1 px-3 py-3 text-[14px] tracking-[0.18em] text-[#9aa6b4]">Ex: A7K3M2</div>
              <button className="btn-3d px-5 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">OK</button>
            </div>
          </div>

          {/* ===== ACESSO RÁPIDO (botões — o CEO gosta) ===== */}
          <div className="bevel-3d mb-3 mt-6 inline-flex items-center gap-2 px-3 py-[6px]">
            <Home className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">Acesso rápido</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-3d-soft flex flex-col items-start gap-1 px-4 py-3 text-left">
              <ClipboardList className="h-5 w-5 text-[#9a7b32]" />
              <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-[#16294a]">Protocolos</span>
            </button>
            <button className="btn-3d-soft flex flex-col items-start gap-1 px-4 py-3 text-left">
              <FileText className="h-5 w-5 text-[#9a7b32]" />
              <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-[#16294a]">Documentos</span>
            </button>
            <button className="btn-3d relative col-span-2 flex items-center gap-3 px-4 py-3 text-left">
              <ConciergeBell className="h-6 w-6 text-[#5a4209]" />
              <div>
                <div className="text-[14px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">Solicitações</div>
                <div className="text-[11px] text-[#5a4209]">Exames, laudos, atestados, receitas e mais</div>
              </div>
            </button>
          </div>

          {/* ===== BENEFÍCIOS (visíveis; premium com cadeado discreto) ===== */}
          <div className="bevel-3d mb-3 mt-6 inline-flex items-center gap-2 px-3 py-[6px]">
            <ConciergeBell className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">O que você pode solicitar</span>
          </div>
          <div className="flex flex-col gap-2">
            {BENEFICIOS.map((b) => (
              <div key={b.nome} className="screen-3d flex items-center gap-3 px-3 py-3">
                <div className="concave-3d flex h-10 w-10 shrink-0 items-center justify-center">
                  <b.Icon className="h-5 w-5" style={{ color: "#9a7b32" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-bold text-[#16294a]">{b.nome}</span>
                    {b.emBreve && (
                      <span className="rounded-[3px] border border-amber-300 bg-amber-50 px-[5px] py-[1px] text-[8px] font-bold uppercase tracking-[0.08em] text-amber-700">
                        Em breve
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-[#5b6b80]">{b.sub}</div>
                </div>
                {b.premium && <Lock className="h-4 w-4 shrink-0" style={{ color: "#c2a05a" }} aria-label="Recurso premium" />}
              </div>
            ))}
          </div>
        </div>

        {/* ===== NAVEGAÇÃO INFERIOR (igual ao app real) ===== */}
        <nav
          className="sticky bottom-0 grid grid-cols-5 gap-1 px-2 py-2 suit-light"
          style={{ borderTop: "1px solid rgba(184,146,77,0.35)", boxShadow: "0 -8px 20px -12px rgba(7,22,43,0.4)" }}
        >
          {[
            { Icon: Home, label: "Início", on: true },
            { Icon: ClipboardList, label: "Protocolos", on: false },
            { Icon: CalendarDays, label: "Agenda", on: false },
            { Icon: FileText, label: "Documentos", on: false },
            { Icon: Send, label: "Enviar", on: false },
          ].map((n) => (
            <button key={n.label} className="flex flex-col items-center gap-1 py-1">
              <n.Icon className="h-5 w-5" style={{ color: n.on ? "#9a7b32" : "#9aa6b4" }} />
              <span className="text-[9px] font-bold uppercase tracking-[0.06em]" style={{ color: n.on ? "#16294a" : "#9aa6b4" }}>
                {n.label}
              </span>
            </button>
          ))}
        </nav>

        {/* Gaveta de descoberta dos Círculos PAXTER */}
        {descobrir && <CirculosSheet onClose={() => setDescobrir(false)} />}
      </div>
    </div>
  );
}
