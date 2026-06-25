import "../acompanhamento/_group.css";
import { useMemo, useState } from "react";
import { FlaskConical, Plus, Settings2, Sliders } from "lucide-react";

/* ---------- modelo ---------- */
type ZonaNome = "ruim" | "alerta" | "atencao" | "aceitavel" | "excelente";
type Faixa = { nome: ZonaNome; rotulo: string; de: number; ate: number };
type Direcao = "Quanto maior, melhor" | "Quanto menor, melhor";
type ExameCad = {
  nome: string;
  unidade: string;
  direcao: Direcao;
  vmin: number;
  vmax: number;
  valorAtual: number;
  faixas: Faixa[];
};

const ZCOR: Record<ZonaNome, { cor: string; rotulo: string }> = {
  ruim: { cor: "#c0392b", rotulo: "Ruim" },
  alerta: { cor: "#e07b39", rotulo: "Alerta" },
  atencao: { cor: "#d4a72c", rotulo: "Atenção" },
  aceitavel: { cor: "#6fae5f", rotulo: "Aceitável" },
  excelente: { cor: "#2f8f4e", rotulo: "Excelente" },
};

const ORDEM_FAIXA: ZonaNome[] = ["ruim", "alerta", "atencao", "aceitavel", "excelente"];

/* exames cadastrados (mesmo conjunto da tela de Exames) */
const EXAMES_INICIAIS: ExameCad[] = [
  {
    nome: "Ferritina (estoque de ferro)",
    unidade: "ng/mL",
    direcao: "Quanto maior, melhor",
    vmin: 0,
    vmax: 200,
    valorAtual: 110,
    faixas: [
      { nome: "ruim", rotulo: "Deficiência grave", de: 0, ate: 15 },
      { nome: "alerta", rotulo: "Estoque baixo", de: 15, ate: 30 },
      { nome: "atencao", rotulo: "Estoque limítrofe", de: 30, ate: 70 },
      { nome: "aceitavel", rotulo: "Estoque adequado", de: 70, ate: 100 },
      { nome: "excelente", rotulo: "Estoque ótimo", de: 100, ate: 200 },
    ],
  },
  {
    nome: "Vitamina D",
    unidade: "ng/mL",
    direcao: "Quanto maior, melhor",
    vmin: 0,
    vmax: 100,
    valorAtual: 32,
    faixas: [
      { nome: "ruim", rotulo: "Deficiência", de: 0, ate: 10 },
      { nome: "alerta", rotulo: "Insuficiência", de: 10, ate: 20 },
      { nome: "atencao", rotulo: "Limítrofe", de: 20, ate: 30 },
      { nome: "aceitavel", rotulo: "Suficiente", de: 30, ate: 50 },
      { nome: "excelente", rotulo: "Nível ótimo", de: 50, ate: 100 },
    ],
  },
  {
    nome: "Hemoglobina glicada (HbA1c)",
    unidade: "%",
    direcao: "Quanto menor, melhor",
    vmin: 4,
    vmax: 9,
    valorAtual: 5.8,
    faixas: [
      { nome: "excelente", rotulo: "Normal", de: 4, ate: 5.4 },
      { nome: "aceitavel", rotulo: "Ótimo controle", de: 5.4, ate: 5.7 },
      { nome: "atencao", rotulo: "Pré-diabetes inicial", de: 5.7, ate: 6.0 },
      { nome: "alerta", rotulo: "Pré-diabetes", de: 6.0, ate: 6.5 },
      { nome: "ruim", rotulo: "Faixa de diabetes", de: 6.5, ate: 9 },
    ],
  },
  {
    nome: "Proteína C reativa (PCR)",
    unidade: "mg/L",
    direcao: "Quanto menor, melhor",
    vmin: 0,
    vmax: 10,
    valorAtual: 2,
    faixas: [
      { nome: "excelente", rotulo: "Sem inflamação", de: 0, ate: 1 },
      { nome: "aceitavel", rotulo: "Inflamação baixa", de: 1, ate: 3 },
      { nome: "atencao", rotulo: "Inflamação moderada", de: 3, ate: 5 },
      { nome: "alerta", rotulo: "Inflamação alta", de: 5, ate: 8 },
      { nome: "ruim", rotulo: "Inflamação muito alta", de: 8, ate: 10 },
    ],
  },
  {
    nome: "Colesterol LDL",
    unidade: "mg/dL",
    direcao: "Quanto menor, melhor",
    vmin: 50,
    vmax: 220,
    valorAtual: 176,
    faixas: [
      { nome: "excelente", rotulo: "Ótimo", de: 50, ate: 100 },
      { nome: "aceitavel", rotulo: "Desejável", de: 100, ate: 130 },
      { nome: "atencao", rotulo: "Limítrofe alto", de: 130, ate: 160 },
      { nome: "alerta", rotulo: "Alto", de: 160, ate: 190 },
      { nome: "ruim", rotulo: "Muito alto", de: 190, ate: 220 },
    ],
  },
  {
    nome: "Glicemia em jejum",
    unidade: "mg/dL",
    direcao: "Quanto menor, melhor",
    vmin: 70,
    vmax: 140,
    valorAtual: 112,
    faixas: [
      { nome: "excelente", rotulo: "Normal", de: 70, ate: 90 },
      { nome: "aceitavel", rotulo: "Normal alto", de: 90, ate: 99 },
      { nome: "atencao", rotulo: "Glicemia alterada", de: 99, ate: 110 },
      { nome: "alerta", rotulo: "Pré-diabetes", de: 110, ate: 126 },
      { nome: "ruim", rotulo: "Faixa de diabetes", de: 126, ate: 140 },
    ],
  },
];

function faixaDoValor(ex: ExameCad, valor: number): Faixa {
  for (const f of ex.faixas) {
    if (valor >= f.de && valor < f.ate) return f;
  }
  return ex.faixas[ex.faixas.length - 1];
}

function Selo() {
  return (
    <span className="font-serif text-[19px] font-semibold tracking-[0.16em]" style={{ color: "#e7cd8f", textShadow: "0 1px 0 rgba(0,0,0,0.45)" }}>
      PAXTER
    </span>
  );
}

/* barra das faixas (ordenada do pior ao melhor) + marcador do valor atual */
function BarraFaixas({ ex }: { ex: ExameCad }) {
  const span = ex.vmax - ex.vmin || 1;
  const pos = Math.max(0, Math.min(100, ((ex.valorAtual - ex.vmin) / span) * 100));
  const ordenadas = [...ex.faixas].sort((a, b) => a.de - b.de);
  return (
    <div className="relative">
      <div className="flex h-7 w-full overflow-hidden rounded-[4px]">
        {ordenadas.map((f) => {
          const w = ((f.ate - f.de) / span) * 100;
          return (
            <div key={f.nome} className="flex items-center justify-center" style={{ width: `${w}%`, background: ZCOR[f.nome].cor }} title={f.rotulo} />
          );
        })}
      </div>
      <div className="absolute -top-1 h-9 w-[3px] rounded-full bg-[#16294a]" style={{ left: `calc(${pos}% - 1.5px)`, boxShadow: "0 0 0 2px #fff" }} />
    </div>
  );
}

export function SubcadastroExames() {
  const [exames, setExames] = useState<ExameCad[]>(EXAMES_INICIAIS);
  const [sel, setSel] = useState(0);
  const ex = exames[sel];

  const faixaAtual = useMemo(() => faixaDoValor(ex, ex.valorAtual), [ex]);

  function editarRotulo(faixaIdx: number, valor: string) {
    setExames((prev) => prev.map((e, i) => (i !== sel ? e : { ...e, faixas: e.faixas.map((f, j) => (j === faixaIdx ? { ...f, rotulo: valor } : f)) })));
  }

  return (
    <div className="cockpit-root min-h-screen w-full font-sans">
      {/* topo */}
      <header className="flex items-center justify-between px-7 py-3" style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)", borderBottom: "1px solid rgba(231,205,143,0.35)" }}>
        <div className="flex items-center gap-3">
          <Selo />
          <span className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Motor Clínico</span>
        </div>
        <span className="rounded-[5px] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#16294a]" style={{ background: "#e7cd8f" }}>
          Cadastro
        </span>
      </header>

      {/* trilha do cadastro */}
      <nav className="flex items-end gap-1 px-7 pt-3" style={{ background: "#13233f" }}>
        {["Clientes", "Profissionais", "Substâncias", "Exames", "Textos / Conteúdo"].map((t) => {
          const ativo = t === "Exames";
          return (
            <div key={t} className={`rounded-t-[5px] px-4 py-2 text-[12px] font-semibold uppercase tracking-wide ${ativo ? "text-[#16294a]" : "text-slate-300"}`} style={ativo ? { background: "hsl(40 33% 96%)", borderTop: "2px solid #e7cd8f" } : { background: "rgba(255,255,255,0.04)" }}>
              {t}
            </div>
          );
        })}
      </nav>

      <main className="px-7 py-6" style={{ background: "hsl(40 33% 96%)" }}>
        <div className="bevel-3d mb-5 inline-flex items-center gap-2 px-4 py-2">
          <Sliders className="h-4 w-4" style={{ color: "#9a7b32" }} />
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#16294a]">Cadastro de Exames — Faixas de Referência</span>
        </div>

        <div className="grid grid-cols-[300px_1fr] items-start gap-6">
          {/* ESQUERDA: lista de exames cadastrados */}
          <section className="panel-3d p-4">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
              <FlaskConical className="h-4 w-4" style={{ color: "#9a7b32" }} /> Exames cadastrados
            </div>
            <div className="space-y-2">
              {exames.map((e, i) => {
                const ativo = i === sel;
                return (
                  <button
                    key={e.nome}
                    type="button"
                    onClick={() => setSel(i)}
                    className="w-full rounded-[5px] px-3 py-2 text-left transition-shadow"
                    style={ativo ? { background: "#16294a", boxShadow: "0 0 0 2px #e7cd8f" } : { background: "rgba(22,41,74,0.06)" }}
                  >
                    <div className={`text-[12px] font-bold leading-tight ${ativo ? "text-white" : "text-[#16294a]"}`}>{e.nome}</div>
                    <div className={`text-[10px] ${ativo ? "text-[#e7cd8f]" : "text-[#647c97]"}`}>
                      {e.unidade} · {e.faixas.length} faixas
                    </div>
                  </button>
                );
              })}
            </div>
            <button type="button" className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[5px] border border-dashed border-[#16294a]/30 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#647c97] hover:text-[#16294a]">
              <Plus className="h-3.5 w-3.5" /> Novo exame
            </button>
          </section>

          {/* DIREITA: editor das faixas do exame selecionado */}
          <section className="panel-3d p-5">
            <div className="mb-4 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
              <Settings2 className="h-4 w-4" style={{ color: "#9a7b32" }} /> {ex.nome}
            </div>

            {/* meta do exame */}
            <div className="mb-5 grid grid-cols-[1fr_120px_1fr] gap-3">
              <Campo rotulo="Nome do exame" valor={ex.nome} />
              <Campo rotulo="Unidade" valor={ex.unidade} />
              <div>
                <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Direção</div>
                <div className="flex gap-1">
                  {(["Quanto maior, melhor", "Quanto menor, melhor"] as Direcao[]).map((d) => {
                    const ativo = ex.direcao === d;
                    return (
                      <span key={d} className="flex-1 rounded-[5px] px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide" style={ativo ? { background: "#16294a", color: "#fff" } : { background: "rgba(22,41,74,0.06)", color: "#647c97" }}>
                        {d.replace("Quanto ", "").replace(", melhor", "")}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* tabela de faixas */}
            <div className="mb-2 grid grid-cols-[120px_1fr_90px_90px] gap-2 px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">
              <span>Cor da faixa</span>
              <span>Nome da faixa (você escolhe)</span>
              <span>De</span>
              <span>Até</span>
            </div>
            <div className="space-y-2">
              {[...ex.faixas]
                .map((f, idx) => ({ f, idx }))
                .sort((a, b) => ORDEM_FAIXA.indexOf(a.f.nome) - ORDEM_FAIXA.indexOf(b.f.nome))
                .map(({ f, idx }) => (
                  <div key={f.nome} className="grid grid-cols-[120px_1fr_90px_90px] items-center gap-2">
                    <div className="flex items-center gap-2 rounded-[5px] px-2 py-2" style={{ background: "rgba(22,41,74,0.05)" }}>
                      <span className="inline-block h-4 w-4 shrink-0 rounded-[3px]" style={{ background: ZCOR[f.nome].cor }} />
                      <span className="text-[10px] font-bold uppercase" style={{ color: ZCOR[f.nome].cor }}>{ZCOR[f.nome].rotulo}</span>
                    </div>
                    <input
                      value={f.rotulo}
                      onChange={(e) => editarRotulo(idx, e.target.value)}
                      className="concave-3d w-full bg-transparent px-3 py-2 text-[13px] font-semibold text-[#16294a] outline-none"
                    />
                    <div className="concave-3d px-3 py-2 text-center text-[13px] font-semibold text-[#16294a]">{f.de}</div>
                    <div className="concave-3d px-3 py-2 text-center text-[13px] font-semibold text-[#16294a]">{f.ate}</div>
                  </div>
                ))}
            </div>
            <button type="button" className="mt-3 flex items-center gap-1.5 rounded-[5px] border border-dashed border-[#16294a]/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#647c97] hover:text-[#16294a]">
              <Plus className="h-3.5 w-3.5" /> Adicionar faixa
            </button>

            {/* prévia: como aparece no gráfico */}
            <div className="mt-6 border-t border-[#16294a]/10 pt-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">
                Prévia — como o nome da faixa aparece no gráfico
              </div>
              <BarraFaixas ex={ex} />
              <div className="concave-3d mt-3 px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Faixa cadastrada do valor atual</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: ZCOR[faixaAtual.nome].cor }} />
                  <span className="text-[14px] font-bold leading-tight" style={{ color: ZCOR[faixaAtual.nome].cor }}>{faixaAtual.rotulo}</span>
                  <span className="ml-auto text-[11px] font-semibold text-[#647c97]">{ex.valorAtual} {ex.unidade}</span>
                </div>
              </div>
            </div>

            <p className="mt-4 text-[11px] italic text-[#647c97]">
              Cada exame guarda suas próprias faixas e o nome que você escolher para cada uma. Quando o gráfico do exame é
              aberto, o sistema mostra, num campo rebaixado, o nome da faixa onde o valor atual se encontra.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">{rotulo}</div>
      <div className="concave-3d px-3 py-2 text-[13px] font-semibold text-[#16294a]">{valor}</div>
    </div>
  );
}

export default SubcadastroExames;
