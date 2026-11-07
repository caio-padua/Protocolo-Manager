import { useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, MapPin, Search, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LocalCard } from "./LocalCard";
import {
  MODO_META, ORDEM_MODOS, modoDoLocal, semAcento,
  type LocalAtendimento, type ModoLocal,
} from "./locais-modo";

interface Props {
  locais: LocalAtendimento[];
  onEdit: (l: LocalAtendimento) => void;
  onDelete: (l: LocalAtendimento) => void;
}

interface GrupoEmpresa {
  chave: string; empresaId: number | null; nome: string; locais: LocalAtendimento[];
}

const GRADE = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4";

function Cabecalho({ icone, rotulo, qtd, nivel }: { icone?: React.ReactNode; rotulo: string; qtd: number; nivel: 1 | 2 | 3 }) {
  if (nivel === 3) {
    return (
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-2 flex items-center gap-2">
        <Tag className="w-3 h-3" /> {rotulo} <span className="text-muted-foreground/60">{qtd}</span>
      </p>
    );
  }
  return (
    <div className={`flex items-center gap-3 ${nivel === 1 ? "mb-3" : "mb-3"}`}>
      <div className="bevel-3d px-3 py-1.5 flex items-center gap-2 shrink-0">
        {icone}
        <span className="font-black text-[11px] uppercase tracking-widest">{rotulo}</span>
        <span className="text-[9px] text-muted-foreground/70 font-bold">{qtd}</span>
      </div>
      <div className="h-px bg-primary/15 flex-1" />
    </div>
  );
}

// Presencial: Estado > Cidade > Região (zona). Nomes comparados sem acento ("Sao Paulo" = "São Paulo").
function ArvoreGeografica({ locais, onEdit, onDelete }: Props) {
  const arvore = useMemo(() => {
    const ufs = new Map<string, Map<string, { nome: string; zonas: Map<string, LocalAtendimento[]> }>>();
    for (const l of locais) {
      const uf = (l.estado || "—").toUpperCase();
      const cidadeNome = l.cidade || "Cidade não informada";
      const cidadeKey = semAcento(cidadeNome);
      const zona = l.zona || l.bairro || "Região não informada";
      if (!ufs.has(uf)) ufs.set(uf, new Map());
      const cidades = ufs.get(uf)!;
      if (!cidades.has(cidadeKey)) cidades.set(cidadeKey, { nome: cidadeNome, zonas: new Map() });
      const c = cidades.get(cidadeKey)!;
      if (!c.zonas.has(zona)) c.zonas.set(zona, []);
      c.zonas.get(zona)!.push(l);
    }
    return [...ufs.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [locais]);

  return (
    <div className="space-y-5">
      {arvore.map(([uf, cidades]) => {
        const totalUf = [...cidades.values()].reduce((n, c) => n + [...c.zonas.values()].reduce((m, z) => m + z.length, 0), 0);
        return (
          <div key={uf} className="space-y-4">
            <Cabecalho nivel={1} rotulo={`Estado · ${uf}`} qtd={totalUf} icone={<MapPin className="w-3.5 h-3.5 text-primary" />} />
            <div className="space-y-5 pl-4 border-l-2 border-primary/10">
              {[...cidades.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((cidade) => {
                const totalCidade = [...cidade.zonas.values()].reduce((m, z) => m + z.length, 0);
                return (
                  <div key={cidade.nome}>
                    <Cabecalho nivel={2} rotulo={cidade.nome} qtd={totalCidade} icone={<Building2 className="w-3.5 h-3.5 text-primary" />} />
                    <div className="space-y-4 pl-4 border-l-2 border-primary/10">
                      {[...cidade.zonas.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([zona, itens]) => (
                        <div key={zona}>
                          <Cabecalho nivel={3} rotulo={zona} qtd={itens.length} />
                          <div className={GRADE}>
                            {itens.map((l) => <LocalCard key={l.id} c={l} onEdit={() => onEdit(l)} onDelete={() => onDelete(l)} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PainelEmpresa({ grupo, aberto, onToggle, onEdit, onDelete }: { grupo: GrupoEmpresa; aberto: boolean; onToggle: () => void } & Pick<Props, "onEdit" | "onDelete">) {
  const contagem = useMemo(() => {
    const m: Record<ModoLocal, number> = { sede: 0, externo: 0, online: 0, definir: 0 };
    for (const l of grupo.locais) m[modoDoLocal(l)] += 1;
    return m;
  }, [grupo.locais]);

  const presenciais = grupo.locais.filter((l) => { const m = modoDoLocal(l); return m === "sede" || m === "externo"; });
  const online = grupo.locais.filter((l) => modoDoLocal(l) === "online");
  const definir = grupo.locais.filter((l) => modoDoLocal(l) === "definir");

  return (
    <section className="panel-3d overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <div className="bevel-3d p-2 shrink-0"><Building2 className="w-4 h-4 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-black text-[15px] uppercase tracking-tight truncate">{grupo.nome}</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {grupo.locais.length} local{grupo.locais.length !== 1 ? "is" : ""} de atendimento
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap" aria-label="Resumo por modalidade">
          {ORDEM_MODOS.filter((m) => contagem[m] > 0).map((m) => {
            const meta = MODO_META[m];
            return (
              <span key={m} className="inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
                style={{ backgroundColor: meta.fundo, color: meta.texto, borderColor: meta.borda }} title={meta.explicacao}>
                <meta.Icon className="w-3 h-3" aria-hidden /> {contagem[m]} {meta.rotulo}
              </span>
            );
          })}
        </div>
        <button type="button" onClick={onToggle} aria-expanded={aberto}
          aria-label={`${aberto ? "Recolher" : "Abrir"} locais de ${grupo.nome}`}
          className="bevel-3d p-2 shrink-0">
          {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {aberto && (
        <div className="px-4 pb-4 pt-1 space-y-6 border-t border-border/40">
          {presenciais.length > 0 && (
            <div className="pt-4">
              <ArvoreGeografica locais={presenciais} onEdit={onEdit} onDelete={onDelete} />
            </div>
          )}
          {online.length > 0 && (
            <div>
              <Cabecalho nivel={1} rotulo="Online · sem endereço físico" qtd={online.length} icone={<MODO_META.online.Icon className="w-3.5 h-3.5 text-primary" />} />
              <div className={GRADE}>
                {online.map((l) => <LocalCard key={l.id} c={l} onEdit={() => onEdit(l)} onDelete={() => onDelete(l)} />)}
              </div>
            </div>
          )}
          {definir.length > 0 && (
            <div>
              <Cabecalho nivel={1} rotulo="A definir · informe a modalidade" qtd={definir.length} icone={<MODO_META.definir.Icon className="w-3.5 h-3.5 text-primary" />} />
              <div className={GRADE}>
                {definir.map((l) => <LocalCard key={l.id} c={l} onEdit={() => onEdit(l)} onDelete={() => onDelete(l)} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function LocaisPorEmpresa({ locais, onEdit, onDelete }: Props) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<ModoLocal | "todos">("todos");
  const [fechadas, setFechadas] = useState<Set<string>>(() => new Set());

  const contagemGeral = useMemo(() => {
    const m: Record<ModoLocal, number> = { sede: 0, externo: 0, online: 0, definir: 0 };
    for (const l of locais) m[modoDoLocal(l)] += 1;
    return m;
  }, [locais]);

  const grupos = useMemo<GrupoEmpresa[]>(() => {
    const q = semAcento(busca);
    const map = new Map<string, GrupoEmpresa>();
    for (const l of locais) {
      if (filtro !== "todos" && modoDoLocal(l) !== filtro) continue;
      if (q && !semAcento([l.name, l.cidade, l.bairro, l.zona, l.empresaNome].filter(Boolean).join(" ")).includes(q)) continue;
      const chave = l.empresaId ? `e${l.empresaId}` : "sem";
      if (!map.has(chave)) map.set(chave, { chave, empresaId: l.empresaId, nome: l.empresaNome ?? "Sem empresa vinculada", locais: [] });
      map.get(chave)!.locais.push(l);
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [locais, busca, filtro]);

  const todasAbertas = grupos.every((g) => !fechadas.has(g.chave));
  const alternar = (chave: string) => setFechadas((prev) => {
    const n = new Set(prev); if (n.has(chave)) n.delete(chave); else n.add(chave); return n;
  });

  return (
    <div className="space-y-5">
      {/* Legenda + filtros: o olho entende cada selo antes de ler o texto */}
      <div className="panel-3d-sub p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por modalidade">
          {([["todos", `Todos · ${locais.length}`], ...ORDEM_MODOS.map((m) => [m, `${MODO_META[m].rotulo} · ${contagemGeral[m]}`])] as Array<[ModoLocal | "todos", string]>).map(([valor, texto]) => {
            const ativo = filtro === valor;
            const meta = valor === "todos" ? null : MODO_META[valor];
            return (
              <button key={valor} type="button" onClick={() => setFiltro(valor)} aria-pressed={ativo}
                className={`bevel-3d px-3 py-1.5 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors ${ativo ? "bg-primary text-primary-foreground ring-2 ring-[#b8892b]" : "text-muted-foreground"}`}>
                {meta && <meta.Icon className="w-3 h-3" aria-hidden />}
                {texto}
              </button>
            );
          })}
          <div className="relative ml-auto min-w-[200px] flex-1 sm:flex-none sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar local, cidade, empresa…" className="field-engraved pl-8 h-9 text-xs" aria-label="Buscar local" />
          </div>
          <button type="button" onClick={() => setFechadas(todasAbertas ? new Set(grupos.map((g) => g.chave)) : new Set())}
            className="bevel-3d px-3 py-1.5 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
            {todasAbertas ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
            {todasAbertas ? "Recolher todas" : "Abrir todas"}
          </button>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[10px] text-muted-foreground">
          {ORDEM_MODOS.map((m) => {
            const meta = MODO_META[m];
            return (
              <li key={m} className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center rounded-[3px] border w-6 h-6 shrink-0"
                  style={{ backgroundColor: meta.fundo, color: meta.texto, borderColor: meta.borda }}>
                  <meta.Icon className="w-3 h-3" aria-hidden />
                </span>
                <span className="min-w-0"><b className="text-foreground uppercase tracking-wider">{meta.rotulo}</b> — {meta.explicacao}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {grupos.length === 0 ? (
        <div className="concave-3d text-center py-12 text-muted-foreground text-sm">Nenhum local encontrado com este filtro.</div>
      ) : grupos.map((g) => (
        <PainelEmpresa key={g.chave} grupo={g} aberto={!fechadas.has(g.chave)} onToggle={() => alternar(g.chave)} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
