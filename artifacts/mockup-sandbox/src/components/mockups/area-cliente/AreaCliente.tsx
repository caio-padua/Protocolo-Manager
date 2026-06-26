import "./_group.css";
import {
  CalendarClock,
  ClipboardList,
  ConciergeBell,
  Copy,
  FileText,
  FlaskConical,
  Lock,
  MessageCircle,
  Repeat,
  ScrollText,
  Send,
  Sparkles,
  TestTube2,
} from "lucide-react";

/* ----------------------------------------------------------------------------
   ÁREA DO CLIENTE — porta única do paciente (mockup, bancada de testes).
   3 botões principais: Remarcar Consulta · Meu Protocolo · Solicitações (novo).
   Classificação Hermès (4 categorias). Itens não construídos marcados PENDENTE.
---------------------------------------------------------------------------- */

const OURO = "#e7cd8f";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Selo() {
  return (
    <span
      className="font-serif text-[19px] font-semibold tracking-[0.16em]"
      style={{ color: OURO, textShadow: "0 1px 0 rgba(0,0,0,0.45)" }}
    >
      PAXTER
    </span>
  );
}

/* ---- Classificação Hermès (4 categorias, do topo para a base) ---- */
type Cat = {
  nome: string;
  faixa: string;
  regra: string;
  selo: string; // cor do selo
  texto: string; // cor do texto sobre o selo
};
const CATEGORIAS: Cat[] = [
  { nome: "NOIR", faixa: "1ª — Topo", regra: "Solicitações à vontade, sem custo (concierge ilimitado)", selo: "#16294a", texto: "#e7cd8f" },
  { nome: "PLATINA", faixa: "2ª", regra: "Cortesias mensais incluídas + excedente pago", selo: "#9aa3ad", texto: "#1b2533" },
  { nome: "OURO", faixa: "3ª", regra: "Todas as solicitações pagas (com desconto)", selo: "#c2a05a", texto: "#3a2c08" },
  { nome: "BRONZE", faixa: "4ª — Base", regra: "Todas as solicitações pagas (preço cheio)", selo: "#a9742f", texto: "#fff6e8" },
];

/* Cliente do exemplo: categoria NOIR (topo) → tudo INCLUSO. */
const CATEGORIA_DO_CLIENTE = CATEGORIAS[0];

/* ---- Solicitações (subtítulos do botão "Solicitações") ---- */
type Solic = {
  nome: string;
  sub: string;
  Icon: typeof FileText;
  precoBase: number; // preço cheio (BRONZE)
  pronto: boolean; // false = ainda não construído → PENDENTE
};
const SOLICITACOES: Solic[] = [
  { nome: "Solicitar Exames", sub: "Novos exames para o seu acompanhamento", Icon: TestTube2, precoBase: 90, pronto: true },
  { nome: "Encaminhamento", sub: "Indicação para outro especialista", Icon: Send, precoBase: 60, pronto: true },
  { nome: "Laudo Médico", sub: "Documento do seu estado de saúde", Icon: FileText, precoBase: 120, pronto: true },
  { nome: "Atestado", sub: "Comparecimento ou afastamento", Icon: ScrollText, precoBase: 60, pronto: true },
  { nome: "Fórmula à Parte", sub: "Manipulado para uma queixa específica", Icon: FlaskConical, precoBase: 80, pronto: true },
  { nome: "Abrir Queixa / Pedir Contato", sub: "A equipe entra em contato com você", Icon: MessageCircle, precoBase: 0, pronto: false },
  { nome: "Renovar Receita", sub: "Continuidade do seu tratamento", Icon: Repeat, precoBase: 50, pronto: false },
  { nome: "2ª Via de Documento", sub: "Reemitir um documento já gerado", Icon: Copy, precoBase: 30, pronto: false },
];

const ehNoir = CATEGORIA_DO_CLIENTE.nome === "NOIR";

function ChipStatus({ pronto }: { pronto: boolean }) {
  if (pronto) {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] border border-emerald-300 bg-emerald-50 px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700">
        Disponível
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-[4px] border border-amber-400 bg-amber-50 px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.12em] text-amber-700">
      <Lock className="h-3 w-3" /> Pendente
    </span>
  );
}

export function AreaCliente() {
  return (
    <div className="area-root min-h-screen w-full font-sans">
      {/* Barra de topo (azul-marinho) */}
      <header
        className="flex items-center justify-between px-7 py-3"
        style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)", borderBottom: "1px solid rgba(231,205,143,0.35)" }}
      >
        <div className="flex items-center gap-3">
          <Selo />
          <span className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Área do Cliente</span>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-white">Maria Silva Santos</div>
          <div className="text-[11px] text-slate-300">CPF 123.456.789-00 · 47 anos</div>
        </div>
      </header>

      <main className="mx-auto max-w-[980px] px-7 py-6" style={{ background: "hsl(40 33% 96%)" }}>
        {/* Faixa da categoria do cliente (selo Hermès) */}
        <div className="panel-3d mb-6 flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 flex-col items-center justify-center rounded-[6px]"
              style={{ background: CATEGORIA_DO_CLIENTE.selo, boxShadow: "inset 0 2px 0 rgba(255,255,255,0.25), 0 8px 16px -6px rgba(7,22,43,0.5)" }}
            >
              <Sparkles className="h-4 w-4" style={{ color: CATEGORIA_DO_CLIENTE.texto }} />
              <span className="mt-[2px] text-[10px] font-bold tracking-[0.14em]" style={{ color: CATEGORIA_DO_CLIENTE.texto }}>
                {CATEGORIA_DO_CLIENTE.nome}
              </span>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#647c97]">Seu plano</div>
              <div className="text-[17px] font-bold text-[#16294a]">Categoria {CATEGORIA_DO_CLIENTE.nome}</div>
              <div className="text-[12px] text-[#5b6b80]">{CATEGORIA_DO_CLIENTE.regra}</div>
            </div>
          </div>
          <div className="bevel-3d hidden items-center gap-2 px-3 py-2 md:flex">
            <ConciergeBell className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#16294a]">Concierge Clínico</span>
          </div>
        </div>

        {/* 3 botões principais */}
        <div className="mb-7 grid grid-cols-3 gap-4">
          {/* Remarcar Consulta */}
          <button className="btn-3d-soft flex flex-col items-start gap-2 px-5 py-4 text-left">
            <CalendarClock className="h-6 w-6" style={{ color: "#9a7b32" }} />
            <span className="text-[14px] font-bold uppercase tracking-[0.08em] text-[#16294a]">Remarcar Consulta</span>
            <span className="text-[11px] text-[#5b6b80]">Escolher novo dia e horário</span>
          </button>
          {/* Meu Protocolo */}
          <button className="btn-3d-soft flex flex-col items-start gap-2 px-5 py-4 text-left">
            <ClipboardList className="h-6 w-6" style={{ color: "#9a7b32" }} />
            <span className="text-[14px] font-bold uppercase tracking-[0.08em] text-[#16294a]">Meu Protocolo</span>
            <span className="text-[11px] text-[#5b6b80]">Substâncias, sessões e evolução</span>
          </button>
          {/* Solicitações (NOVO) */}
          <button className="btn-3d relative flex flex-col items-start gap-2 px-5 py-4 text-left">
            <span className="absolute right-3 top-3 rounded-[4px] bg-[#16294a] px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.12em] text-[#e7cd8f]">
              Novo
            </span>
            <ConciergeBell className="h-6 w-6" style={{ color: "#5a4209" }} />
            <span className="text-[14px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">Solicitações</span>
            <span className="text-[11px] text-[#5a4209]">Exames, laudos, atestados e mais</span>
          </button>
        </div>

        {/* Seção SOLICITAÇÕES — subtítulos */}
        <div className="mb-3 flex items-center justify-between">
          <div className="bevel-3d inline-flex items-center gap-2 px-4 py-2">
            <ConciergeBell className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#16294a]">O que você pode solicitar</span>
          </div>
          {ehNoir && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-emerald-700">
              Plano NOIR · tudo incluso
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {SOLICITACOES.map((s) => {
            const incluso = ehNoir; // NOIR = sem custo
            return (
              <div key={s.nome} className="screen-3d flex items-center gap-4 px-4 py-3">
                <div className="concave-3d flex h-11 w-11 shrink-0 items-center justify-center">
                  <s.Icon className="h-5 w-5" style={{ color: "#9a7b32" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-bold text-[#16294a]">{s.nome}</span>
                    <ChipStatus pronto={s.pronto} />
                  </div>
                  <div className="truncate text-[11px] text-[#5b6b80]">{s.sub}</div>
                </div>
                <div className="shrink-0 text-right">
                  {incluso ? (
                    <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-emerald-700">Incluso</span>
                  ) : (
                    <span className="text-[13px] font-bold text-[#16294a]">{s.precoBase > 0 ? brl(s.precoBase) : "Grátis"}</span>
                  )}
                  {incluso && s.precoBase > 0 && (
                    <div className="text-[9px] uppercase tracking-[0.10em] text-[#9aa6b4]">Bronze {brl(s.precoBase)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legenda das 4 categorias (classificação Hermès) */}
        <div className="bevel-3d mb-3 mt-7 inline-flex items-center gap-2 px-4 py-2">
          <Sparkles className="h-4 w-4" style={{ color: "#9a7b32" }} />
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#16294a]">Classificação dos clientes</span>
        </div>
        <div className="panel-3d overflow-hidden">
          <div className="grid grid-cols-[120px_120px_1fr] items-center gap-0 bg-[#16294a] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#e7cd8f]">
            <span>Categoria</span>
            <span>Faixa</span>
            <span>Regra de solicitações</span>
          </div>
          {CATEGORIAS.map((c, i) => (
            <div
              key={c.nome}
              className="grid grid-cols-[120px_120px_1fr] items-center gap-0 px-4 py-3"
              style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.6)" : "rgba(244,238,223,0.6)", borderTop: "1px solid rgba(184,146,77,0.25)" }}
            >
              <span>
                <span
                  className="inline-block rounded-[4px] px-2 py-[3px] text-[11px] font-bold tracking-[0.10em]"
                  style={{ background: c.selo, color: c.texto }}
                >
                  {c.nome}
                </span>
              </span>
              <span className="text-[11px] font-semibold text-[#5b6b80]">{c.faixa}</span>
              <span className="text-[12px] text-[#16294a]">{c.regra}</span>
            </div>
          ))}
        </div>

        {/* Nota PENDENTE de pagamento */}
        <div className="mt-5 flex items-start gap-2 rounded-[5px] border border-amber-300 bg-amber-50 px-4 py-3">
          <Lock className="mt-[2px] h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-[12px] text-amber-800">
            <span className="font-bold uppercase tracking-[0.08em]">Pendente — cobrança:</span> o link de pagamento das
            solicitações pagas (categorias PLATINA, OURO e BRONZE) entra quando o provedor for escolhido. Os itens com
            selo <span className="font-bold">PENDENTE</span> ainda não estão construídos no sistema.
          </div>
        </div>

        {/* Rodapé de marca */}
        <div className="mt-7 flex items-center justify-center gap-2 opacity-70">
          <span className="font-serif text-[13px] font-semibold tracking-[0.16em] text-[#16294a]">PAXTER</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-[#5b6b80]">Motor Clínico</span>
        </div>
      </main>
    </div>
  );
}
