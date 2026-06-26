import "./_group.css";
import {
  ArrowUpCircle,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  ConciergeBell,
  Copy,
  Crown,
  FileSignature,
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
} from "lucide-react";

/* ----------------------------------------------------------------------------
   ÁREA DO CLIENTE — porta única do cliente (mockup mobile, bancada de testes).
   Base: tela real /area (padcom). Acréscimos: motor de DESEJO (planos
   comparados, o do cliente em destaque, upgrade na hora c/ contrato + link de
   pagamento) e união com o upload de exames já existente (aba ENVIAR).
   Cliente do exemplo = OURO (3ª) de propósito, para mostrar o gatilho de subir.
---------------------------------------------------------------------------- */

const OURO = "#e7cd8f";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ---- Marca PAXTER (medalhão de vidro aproximado + wordmark serifado) ---- */
function PaxterMark() {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-[7px]"
        style={{
          background: "linear-gradient(150deg,#22365f 0%,#16294a 55%,#0f1d36 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 4px rgba(0,0,0,0.45), 0 4px 8px -3px rgba(7,22,43,0.6)",
          border: "1px solid rgba(231,205,143,0.45)",
        }}
      >
        <span
          className="font-serif text-[17px] font-bold leading-none"
          style={{ color: OURO, textShadow: "0 1px 1px rgba(0,0,0,0.6)" }}
        >
          R
        </span>
      </div>
      <span
        className="font-serif text-[18px] font-semibold tracking-[0.18em]"
        style={{ color: "#16294a", textShadow: "0 1px 0 rgba(255,255,255,0.6)" }}
      >
        PAXTER
      </span>
    </div>
  );
}

/* ---- Planos (topo → base). O do cliente é destacado. ---- */
type Plano = {
  nome: string;
  faixa: string;
  selo: string;
  texto: string;
  resumo: string;
};
const PLANOS: Plano[] = [
  { nome: "NOIR", faixa: "1ª — Topo", selo: "#16294a", texto: "#e7cd8f", resumo: "Todas as solicitações inclusas, sem custo (concierge ilimitado)" },
  { nome: "PLATINA", faixa: "2ª", selo: "#9aa3ad", texto: "#1b2533", resumo: "Cortesias mensais inclusas + excedente com desconto" },
  { nome: "OURO", faixa: "3ª", selo: "#c2a05a", texto: "#3a2c08", resumo: "Todas as solicitações pagas, com desconto" },
  { nome: "BRONZE", faixa: "4ª — Base", selo: "#a9742f", texto: "#fff6e8", resumo: "Todas as solicitações pagas, preço cheio" },
];
const IDX_CLIENTE = 2; // OURO
const PLANO_CLIENTE = PLANOS[IDX_CLIENTE];

/* ---- Solicitações (o que o cliente pode pedir) ---- */
type Solic = {
  nome: string;
  sub: string;
  Icon: typeof FileText;
  precoCheio: number; // BRONZE
  pronto: boolean; // false → PENDENTE (ainda não construído)
};
const SOLICITACOES: Solic[] = [
  { nome: "Solicitar Exames", sub: "Novos exames para o acompanhamento", Icon: TestTube2, precoCheio: 90, pronto: true },
  { nome: "Encaminhamento", sub: "Indicação para outro especialista", Icon: Send, precoCheio: 60, pronto: true },
  { nome: "Laudo Médico", sub: "Documento do seu estado de saúde", Icon: FileText, precoCheio: 120, pronto: true },
  { nome: "Atestado", sub: "Comparecimento ou afastamento", Icon: ScrollText, precoCheio: 60, pronto: true },
  { nome: "Fórmula à Parte", sub: "Manipulado para uma queixa", Icon: FlaskConical, precoCheio: 80, pronto: true },
  { nome: "Abrir Queixa / Contato", sub: "A equipe entra em contato", Icon: MessageCircle, precoCheio: 0, pronto: false },
  { nome: "Renovar Receita", sub: "Continuidade do tratamento", Icon: Repeat, precoCheio: 50, pronto: false },
  { nome: "2ª Via de Documento", sub: "Reemitir documento já gerado", Icon: Copy, precoCheio: 30, pronto: false },
];

/* Preço no plano OURO = 20% de desconto sobre o cheio. */
function precoOuro(cheio: number) {
  return Math.round(cheio * 0.8);
}

function ChipStatus({ pronto }: { pronto: boolean }) {
  if (pronto) {
    return (
      <span className="inline-flex items-center rounded-[4px] border border-emerald-300 bg-emerald-50 px-[6px] py-[1px] text-[8px] font-bold uppercase tracking-[0.10em] text-emerald-700">
        OK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-[2px] rounded-[4px] border border-amber-400 bg-amber-50 px-[6px] py-[1px] text-[8px] font-bold uppercase tracking-[0.10em] text-amber-700">
      <Lock className="h-[9px] w-[9px]" /> Pendente
    </span>
  );
}

function Secao({ icon: Icon, titulo, extra }: { icon: typeof FileText; titulo: string; extra?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between">
      <div className="bevel-3d inline-flex items-center gap-2 px-3 py-[6px]">
        <Icon className="h-4 w-4" style={{ color: "#9a7b32" }} />
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">{titulo}</span>
      </div>
      {extra}
    </div>
  );
}

export function AreaCliente() {
  return (
    <div className="area-root min-h-screen w-full font-sans" style={{ background: "#0d182b" }}>
      {/* Moldura de celular */}
      <div
        className="mx-auto w-full max-w-[430px] overflow-hidden"
        style={{ background: "hsl(40 33% 96%)", boxShadow: "0 24px 60px -20px rgba(0,0,0,0.7)" }}
      >
        {/* ---------- CABEÇALHO (marca = SISTEMA, não a clínica) ---------- */}
        <header className="flex items-center justify-between px-4 pb-3 pt-4">
          <div className="flex flex-col gap-2">
            <PaxterMark />
            <span className="concave-3d w-fit px-3 py-[5px] text-[11px] font-bold uppercase tracking-[0.10em] text-[#3a2c08]">
              Ricardo Almeida Ferreira
            </span>
          </div>
          <button className="btn-3d-soft flex items-center gap-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#16294a]">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </header>

        <div className="px-4 pb-24">
          {/* ---------- BOAS-VINDAS + INDICADORES (navy) ---------- */}
          <div
            className="panel-3d overflow-hidden p-4"
            style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)", border: "1px solid rgba(231,205,143,0.3)" }}
          >
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Bem-vindo(a)</div>
            <div className="font-serif text-[26px] font-bold leading-tight text-white">Ricardo</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-[6px] bg-white/8 px-3 py-2" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-300">Protocolos ativos</div>
                <div className="text-[20px] font-bold text-white">1</div>
              </div>
              <div className="rounded-[6px] bg-white/8 px-3 py-2" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-300">Atendimentos</div>
                <div className="text-[20px] font-bold text-white">4 / 8</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
              <span>Progresso do tratamento</span>
              <span style={{ color: OURO }}>50%</span>
            </div>
            <div className="mt-1 h-[10px] w-full overflow-hidden rounded-full bg-black/35">
              <div className="h-full rounded-full" style={{ width: "50%", background: "linear-gradient(90deg,#16294a,#c2a05a 70%,#e7cd8f)" }} />
            </div>
          </div>

          {/* Sem atendimento futuro */}
          <div className="concave-3d mt-4 flex items-center gap-2 px-4 py-3">
            <Clock className="h-4 w-4 text-[#9a7b32]" />
            <span className="text-[12px] text-[#5b6b80]">Nenhum atendimento futuro agendado.</span>
          </div>

          {/* ---------- SEU PLANO (categoria do cliente em DESTAQUE) ---------- */}
          <Secao icon={Crown} titulo="Seu plano" />
          <div
            className="panel-3d flex items-center justify-between px-4 py-4"
            style={{ border: "2px solid #c2a05a", boxShadow: "0 0 0 3px rgba(231,205,143,0.30), 0 10px 24px -10px rgba(7,22,43,0.5)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-14 w-14 flex-col items-center justify-center rounded-[7px]"
                style={{ background: PLANO_CLIENTE.selo, boxShadow: "inset 0 2px 0 rgba(255,255,255,0.3)" }}
              >
                <Sparkles className="h-4 w-4" style={{ color: PLANO_CLIENTE.texto }} />
                <span className="mt-[2px] text-[11px] font-bold tracking-[0.10em]" style={{ color: PLANO_CLIENTE.texto }}>
                  {PLANO_CLIENTE.nome}
                </span>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#647c97]">Plano atual</div>
                <div className="text-[16px] font-bold text-[#16294a]">Categoria {PLANO_CLIENTE.nome}</div>
                <div className="max-w-[170px] text-[11px] leading-tight text-[#5b6b80]">{PLANO_CLIENTE.resumo}</div>
              </div>
            </div>
          </div>

          {/* ---------- DESEJO: compare os planos (o seu destacado) ---------- */}
          <Secao icon={Sparkles} titulo="Compare os planos" />
          <div className="flex flex-col gap-2">
            {PLANOS.map((p, i) => {
              const ehDoCliente = i === IDX_CLIENTE;
              const acimaDoCliente = i < IDX_CLIENTE; // pode dar upgrade
              return (
                <div
                  key={p.nome}
                  className="screen-3d flex items-center gap-3 px-3 py-3"
                  style={
                    ehDoCliente
                      ? { border: "2px solid #c2a05a", boxShadow: "0 0 0 3px rgba(231,205,143,0.30)" }
                      : undefined
                  }
                >
                  <span
                    className="flex w-[64px] shrink-0 items-center justify-center rounded-[5px] px-2 py-[6px] text-[11px] font-bold tracking-[0.08em]"
                    style={{ background: p.selo, color: p.texto }}
                  >
                    {p.nome}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.10em] text-[#647c97]">{p.faixa}</div>
                    <div className="text-[11px] leading-tight text-[#16294a]">{p.resumo}</div>
                  </div>
                  {ehDoCliente ? (
                    <span className="shrink-0 rounded-[4px] bg-[#16294a] px-2 py-[3px] text-[8px] font-bold uppercase tracking-[0.10em] text-[#e7cd8f]">
                      Seu plano
                    </span>
                  ) : acimaDoCliente ? (
                    <button className="btn-3d flex shrink-0 items-center gap-1 px-2 py-[6px] text-[9px] font-bold uppercase tracking-[0.06em] text-[#3a2c08]">
                      <ArrowUpCircle className="h-[14px] w-[14px]" /> Subir
                    </button>
                  ) : (
                    <span className="shrink-0 text-[9px] uppercase tracking-[0.10em] text-[#9aa6b4]">—</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Gatilho de desejo + upgrade na hora */}
          <div
            className="mt-3 rounded-[6px] px-4 py-3"
            style={{ background: "linear-gradient(180deg,#fbf3dd,#f3e6c2)", border: "1px solid #d8bd80" }}
          >
            <div className="flex items-start gap-2">
              <ArrowUpCircle className="mt-[1px] h-5 w-5 shrink-0 text-[#9a7b32]" />
              <div className="text-[12px] leading-snug text-[#5a4209]">
                Subindo para <b>PLATINA</b> você deixa de pagar por cortesias mensais; no <b>NOIR</b>, tudo vira{" "}
                <b>incluso</b>. Estimativa de economia: <b>{brl(186)}/mês</b>.
              </div>
            </div>
            <button className="btn-3d mt-3 flex w-full items-center justify-center gap-2 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">
              <FileSignature className="h-4 w-4" /> Fazer upgrade agora
            </button>
            <div className="mt-2 flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.08em] text-[#8a7333]">
              <Lock className="h-3 w-3" /> Gera contrato + link de pagamento (provedor pendente)
            </div>
          </div>

          {/* ---------- VALIDAR PRESENÇA (mantido da tela real) ---------- */}
          <Secao
            icon={KeyRound}
            titulo="Validar presença"
            extra={
              <span className="concave-3d px-2 py-[4px] text-[9px] font-bold uppercase tracking-[0.10em] text-[#647c97]">
                Código do dia
              </span>
            }
          />
          <div className="panel-3d px-4 py-4">
            <div className="text-[11px] text-[#5b6b80]">Digite o código do WhatsApp ou sua senha permanente do protocolo.</div>
            <div className="mt-2 flex gap-2">
              <div className="concave-3d flex-1 px-3 py-3 text-[14px] tracking-[0.18em] text-[#9aa6b4]">Ex: A7K3M2</div>
              <button className="btn-3d px-5 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">OK</button>
            </div>
          </div>

          {/* ---------- AÇÕES (PROTOCOLOS · DOCUMENTOS · SOLICITAÇÕES novo) ---------- */}
          <Secao icon={ClipboardList} titulo="Acesso rápido" />
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
              <span className="absolute right-3 top-3 rounded-[4px] bg-[#16294a] px-2 py-[2px] text-[8px] font-bold uppercase tracking-[0.10em] text-[#e7cd8f]">
                Novo
              </span>
              <ConciergeBell className="h-6 w-6 text-[#5a4209]" />
              <div>
                <div className="text-[14px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">Solicitações</div>
                <div className="text-[11px] text-[#5a4209]">Exames, laudos, atestados, receitas e mais</div>
              </div>
            </button>
          </div>

          {/* ---------- LISTA DE SOLICITAÇÕES (incluso/preço no plano do cliente) ---------- */}
          <Secao
            icon={ConciergeBell}
            titulo="O que você pode solicitar"
            extra={
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a7b32]">Plano OURO · com desconto</span>
            }
          />
          <div className="flex flex-col gap-2">
            {SOLICITACOES.map((s) => {
              const cheio = s.precoCheio;
              const meu = precoOuro(cheio);
              return (
                <div key={s.nome} className="screen-3d flex items-center gap-3 px-3 py-3">
                  <div className="concave-3d flex h-10 w-10 shrink-0 items-center justify-center">
                    <s.Icon className="h-5 w-5" style={{ color: "#9a7b32" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-bold text-[#16294a]">{s.nome}</span>
                      <ChipStatus pronto={s.pronto} />
                    </div>
                    <div className="truncate text-[11px] text-[#5b6b80]">{s.sub}</div>
                    <div className="mt-[2px] flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] text-emerald-700">
                      <Check className="h-3 w-3" /> Grátis no NOIR
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {cheio > 0 ? (
                      <>
                        <div className="text-[13px] font-bold text-[#16294a]">{brl(meu)}</div>
                        <div className="text-[9px] text-[#9aa6b4] line-through">{brl(cheio)}</div>
                      </>
                    ) : (
                      <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-emerald-700">Grátis</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Nota PENDENTE de cobrança */}
          <div className="mt-4 flex items-start gap-2 rounded-[5px] border border-amber-300 bg-amber-50 px-3 py-3">
            <Lock className="mt-[2px] h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-[11px] text-amber-800">
              <span className="font-bold uppercase tracking-[0.06em]">Pendente — cobrança:</span> o link de pagamento entra quando
              você escolher o provedor. Itens com selo <b>PENDENTE</b> ainda não estão construídos.
            </div>
          </div>
        </div>

        {/* ---------- NAVEGAÇÃO INFERIOR (igual ao app real) ---------- */}
        <nav
          className="sticky bottom-0 grid grid-cols-5 gap-1 px-2 py-2"
          style={{ background: "hsl(40 33% 96%)", borderTop: "1px solid rgba(184,146,77,0.35)", boxShadow: "0 -8px 20px -12px rgba(7,22,43,0.4)" }}
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
      </div>
    </div>
  );
}
