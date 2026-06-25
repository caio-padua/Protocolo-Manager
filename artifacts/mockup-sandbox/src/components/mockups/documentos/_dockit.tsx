import "../validacao/_group.css";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Plus,
  Search,
  Stethoscope,
  UploadCloud,
  User,
  X,
} from "lucide-react";

/* ============================================================
   Selo PAXTER
   ============================================================ */
export function Selo({ size = 18 }: { size?: number }) {
  return (
    <span
      className="font-serif font-semibold tracking-[0.16em]"
      style={{ fontSize: size, color: "#e7cd8f", textShadow: "0 1px 0 rgba(0,0,0,0.45)" }}
    >
      PAXTER
    </span>
  );
}

/* ============================================================
   Barra de topo navy
   ============================================================ */
export function BarraTopo({ titulo, Icon }: { titulo: string; Icon: typeof Stethoscope }) {
  return (
    <header
      className="flex items-center justify-between px-7 py-3"
      style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)", borderBottom: "1px solid rgba(231,205,143,0.35)" }}
    >
      <div className="flex items-center gap-4">
        <Selo />
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Documentos do cliente
        </span>
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-white">
          <Icon className="h-4 w-4 text-[#e7cd8f]" /> {titulo}
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-md bg-[#0e1c34] px-3 py-1.5" style={{ border: "1px solid rgba(231,205,143,0.30)" }}>
        <Stethoscope className="h-3.5 w-3.5 text-[#e7cd8f]" />
        <div className="leading-tight">
          <div className="text-[8px] uppercase tracking-wide text-slate-400">Médico responsável</div>
          <div className="text-[12px] font-semibold text-white">Dr. Caio Pádua</div>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </div>
    </header>
  );
}

/* ============================================================
   Cabecalho compacto do paciente
   ============================================================ */
function MetaField({ label, value, Icon }: { label: string; value: string; Icon?: typeof User }) {
  return (
    <div className="concave-3d min-w-0 px-2.5 py-1.5">
      <div className="mb-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-[#647c97]">{label}</div>
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold leading-none text-[#16294a]">
        {Icon && <Icon className="h-3 w-3 shrink-0 text-[#647c97]" />}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

export function CabecalhoPaciente({ doc }: { doc: string }) {
  return (
    <section className="panel-3d mb-5 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold tracking-wide text-[#16294a]">Maria Silva Santos</h1>
          <p className="mt-0.5 text-[11.5px] text-[#647c97]">{doc} · dados puxados do cadastro e da Mesa de Validação</p>
        </div>
        <span className="rounded bg-[#16294a] px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-[#e7cd8f]">#CL-0142</span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        <MetaField label="Cliente" value="Maria Silva Santos" Icon={User} />
        <MetaField label="Idade" value="47 anos" />
        <MetaField label="CPF" value="123.456.789-00" />
        <MetaField label="Data" value="25/06/2026" />
        <MetaField label="Médico" value="Dr. Caio Pádua" Icon={Stethoscope} />
      </div>
    </section>
  );
}

/* ============================================================
   Pilula de titulo de bloco
   ============================================================ */
export function TituloBloco({ Icon, texto, cor = "#16294a" }: { Icon: typeof User; texto: string; cor?: string }) {
  return (
    <div className="bevel-3d mb-3 inline-flex items-center gap-2 px-3 py-2">
      <Icon className="h-4 w-4" style={{ color: cor }} />
      <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: cor }}>
        {texto}
      </span>
    </div>
  );
}

/* ============================================================
   Base CID-10 (mock) + doencas confirmadas (data-bind da Mesa)
   ============================================================ */
export type Cid = { codigo: string; nome: string };

export const CID_DB: Cid[] = [
  { codigo: "E03.9", nome: "Hipotireoidismo não especificado" },
  { codigo: "E16.8", nome: "Resistência à insulina" },
  { codigo: "E78.5", nome: "Dislipidemia / hiperlipidemia mista" },
  { codigo: "E88.81", nome: "Síndrome metabólica" },
  { codigo: "G47.33", nome: "Apneia obstrutiva do sono" },
  { codigo: "E11.9", nome: "Diabetes mellitus tipo 2" },
  { codigo: "E10.9", nome: "Diabetes mellitus tipo 1" },
  { codigo: "I10", nome: "Hipertensão arterial essencial" },
  { codigo: "E66.9", nome: "Obesidade não especificada" },
  { codigo: "E66.01", nome: "Obesidade mórbida" },
  { codigo: "F41.1", nome: "Transtorno de ansiedade generalizada" },
  { codigo: "F33.9", nome: "Transtorno depressivo recorrente" },
  { codigo: "F32.9", nome: "Episódio depressivo" },
  { codigo: "G43.9", nome: "Enxaqueca" },
  { codigo: "M54.5", nome: "Dor lombar baixa (lombalgia)" },
  { codigo: "M51.1", nome: "Hérnia de disco lombar" },
  { codigo: "E55.9", nome: "Deficiência de vitamina D" },
  { codigo: "D50.9", nome: "Anemia por deficiência de ferro" },
  { codigo: "K21.9", nome: "Doença do refluxo gastroesofágico" },
  { codigo: "E05.9", nome: "Hipertireoidismo / tireotoxicose" },
  { codigo: "N39.0", nome: "Infecção do trato urinário" },
  { codigo: "J45.9", nome: "Asma" },
  { codigo: "M19.9", nome: "Artrose / osteoartrite" },
  { codigo: "E78.0", nome: "Hipercolesterolemia pura" },
  { codigo: "R53", nome: "Mal-estar e fadiga" },
];

export type Hd = { nome: string; codigo: string; tipo: "confirmado" | "hipotese" };

export const DOENCAS_CONFIRMADAS: Hd[] = [
  { nome: "Hipotireoidismo", codigo: "E03.9", tipo: "confirmado" },
  { nome: "Resistência à insulina", codigo: "E16.8", tipo: "confirmado" },
  { nome: "Dislipidemia", codigo: "E78.5", tipo: "confirmado" },
  { nome: "Síndrome metabólica", codigo: "E88.81", tipo: "hipotese" },
  { nome: "Apneia do sono", codigo: "G47.33", tipo: "hipotese" },
];

/* ============================================================
   FERRAMENTA HD + CID (interativa)
   - puxa doencas confirmadas da Mesa (CID ja casado)
   - busca por nome com autocomplete -> numero do CID aparece
   - acrescenta 1 a 1; lista acumulada
   ============================================================ */
export function FerramentaHdCid({ value, onChange }: { value: Hd[]; onChange: (next: Hd[]) => void }) {
  const lista = value;
  const [busca, setBusca] = useState("");

  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return CID_DB.filter(
      (c) => c.nome.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [busca]);

  function add(h: Hd) {
    if (lista.some((x) => x.codigo === h.codigo && x.nome === h.nome)) return;
    onChange([...lista, h]);
  }
  function remove(idx: number) {
    onChange(lista.filter((_, i) => i !== idx));
  }

  const disponiveis = DOENCAS_CONFIRMADAS.filter(
    (d) => !lista.some((x) => x.codigo === d.codigo && x.nome === d.nome),
  );

  return (
    <section className="panel-3d mb-5 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <TituloBloco Icon={Search} texto="Hipótese diagnóstica (HD) + CID" cor="#16294a" />
        <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide">
          <UploadCloud className="h-3.5 w-3.5" /> Atualizar tabela CID-10 ({CID_DB.length} códigos)
        </button>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-5">
        {/* coluna esquerda: fontes de HD */}
        <div className="flex flex-col gap-4">
          {/* data-bind: doencas confirmadas da Mesa */}
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">
              Vindas da Mesa de Validação (CID já casado)
            </div>
            <div className="concave-3d flex flex-wrap gap-2 p-2.5">
              {disponiveis.length === 0 && (
                <span className="px-1 py-1 text-[11px] italic text-[#9fb0c4]">Todas já adicionadas.</span>
              )}
              {disponiveis.map((d) => (
                <button
                  key={d.codigo + d.nome}
                  type="button"
                  onClick={() => add(d)}
                  className="bevel-3d group inline-flex items-center gap-2 px-2.5 py-1.5"
                >
                  <span className={`paxter-led ${d.tipo === "confirmado" ? "paxter-led-red" : "paxter-led-amber"} paxter-led-on`} />
                  <span className="text-[12px] font-semibold text-[#16294a]">{d.nome}</span>
                  <span className="rounded bg-[#eef2f8] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#1f618d]">{d.codigo}</span>
                  <Plus className="h-3.5 w-3.5 text-[#1e8449]" />
                </button>
              ))}
            </div>
          </div>

          {/* busca manual com autocomplete */}
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">
              Adicionar digitando o nome da doença
            </div>
            <div className="relative">
              <div className="field-engraved flex items-center gap-2 px-3 py-2">
                <Search className="h-4 w-4 text-[#647c97]" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="ex.: diabetes, lombar, ansiedade…"
                  className="w-full bg-transparent text-[13px] text-[#16294a] outline-none placeholder:text-[#a9b6c8]"
                />
                {busca && (
                  <button type="button" onClick={() => setBusca("")} className="text-[#647c97]">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {sugestoes.length > 0 && (
                <div className="panel-3d-sub absolute left-0 right-0 top-[calc(100%+4px)] z-10 flex flex-col gap-1 p-1.5">
                  {sugestoes.map((c) => (
                    <button
                      key={c.codigo}
                      type="button"
                      onClick={() => {
                        add({ nome: c.nome, codigo: c.codigo, tipo: "hipotese" });
                        setBusca("");
                      }}
                      className="flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left hover:bg-[#f2ede1]"
                    >
                      <span className="text-[12.5px] font-semibold text-[#16294a]">{c.nome}</span>
                      <span className="rounded bg-[#16294a] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#e7cd8f]">{c.codigo}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[10px] italic text-[#647c97]">
              Ao escolher, o número do CID entra sozinho. Você vai acrescentando uma a uma.
            </p>
          </div>
        </div>

        {/* coluna direita: lista acumulada */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">HD selecionadas (entram no documento)</span>
            <span className="concave-3d px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#647c97]">{lista.length} item(s)</span>
          </div>
          <div className="concave-3d flex flex-col gap-2 p-2.5" style={{ minHeight: 180 }}>
            {lista.length === 0 && (
              <span className="px-1 py-2 text-[11px] italic text-[#9fb0c4]">Nenhuma HD ainda. Clique nas doenças ao lado ou busque pelo nome.</span>
            )}
            {lista.map((h, i) => (
              <div key={h.codigo + h.nome + i} className="bevel-3d grid grid-cols-[16px_1fr_64px_24px] items-center gap-2 px-3 py-2">
                <span className={`paxter-led ${h.tipo === "confirmado" ? "paxter-led-red" : "paxter-led-amber"} paxter-led-on`} />
                <span className="min-w-0 truncate text-[12.5px] font-semibold text-[#16294a]">{h.nome}</span>
                <span className="rounded bg-[#16294a] px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-[#e7cd8f]">{h.codigo}</span>
                <button type="button" onClick={() => remove(i)} className="btn-3d-soft flex h-6 w-6 items-center justify-center">
                  <X className="h-3.5 w-3.5 text-[#c0392b]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Bloco de assinatura (rodape do documento)
   ============================================================ */
export function BlocoAssinatura() {
  return (
    <div className="mt-4 flex items-end justify-between">
      <div>
        <div className="font-[cursive] text-[18px] italic text-[#1b3a6b]">Caio Pádua</div>
        <div className="text-[10px] font-semibold text-[#16294a]">Dr. Caio Pádua</div>
        <div className="text-[9px] text-[#647c97]">CRM-SP 000000 · assinado digitalmente (ICP-Brasil)</div>
      </div>
      <Check className="h-9 w-9 text-[#1e8449]" />
    </div>
  );
}

/* ============================================================
   Rodape de acoes do documento
   ============================================================ */
export function RodapeDoc({ rotulo }: { rotulo: string }) {
  return (
    <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-[#9fb0c4]">
      Padcon Conect · Motor de Encantamento · {rotulo}
    </p>
  );
}
