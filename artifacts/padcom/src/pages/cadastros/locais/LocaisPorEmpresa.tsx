import { useMemo, useState } from "react";
import "./locais.css";
import { Building2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, MapPin, Search, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LocalCard } from "./LocalCard";
import {
  MODO_META, ORDEM_MODOS, modoDoLocal, semAcento, compararEmpresas, ehInstitutoPadua,
  type LocalAtendimento, type ModoLocal,
} from "./locais-modo";

interface Props {
  locais: LocalAtendimento[];
  onEdit: (l: LocalAtendimento) => void;
  onToggleAtivo: (l: LocalAtendimento, ativo: boolean) => void;
}

/** "todas" ou chave da empresa ("e12" / "sem"). */
export type EmpresaFiltro = "todas" | string;

interface ListaProps extends Props {
  empresaFiltro: EmpresaFiltro;
  onEmpresaFiltro: (valor: EmpresaFiltro) => void;
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
function ArvoreGeografica({ locais, onEdit, onToggleAtivo }: Props) {
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
                  <div key={semAcento(cidade.nome)}>
                    <Cabecalho nivel={2} rotulo={cidade.nome} qtd={totalCidade} icone={<Building2 className="w-3.5 h-3.5 text-primary" />} />
                    <div className="space-y-4 pl-4 border-l-2 border-primary/10">
                      {[...cidade.zonas.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([zona, itens]) => (
                        <div key={zona}>
                          <Cabecalho nivel={3} rotulo={zona} qtd={itens.length} />
                          <div className={GRADE}>
                            {itens.map((l) => <LocalCard key={l.id} c={l} onEdit={() => onEdit(l)} onToggleAtivo={(v) => onToggleAtivo(l, v)} />)}
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

function PainelEmpresa({ grupo, aberto, onToggle, onEdit, onToggleAtivo }: { grupo: GrupoEmpresa; aberto: boolean; onToggle: () => void } & Pick<Props, "onEdit" | "onToggleAtivo">) {
  const contagem = useMemo(() => {
    const m: Record<ModoLocal, number> = { sede: 0, externo: 0, online: 0, definir: 0 };
    for (const l of grupo.locais) m[modoDoLocal(l)] += 1;
    return m;
  }, [grupo.locais]);

  const presenciais = grupo.locais.filter((l) => { const m = modoDoLocal(l); return m === "sede" || m === "externo"; });
  const online = grupo.locais.filter((l) => modoDoLocal(l) === "online");
  const definir = grupo.locais.filter((l) => modoDoLocal(l) === "definir");
  const padua = ehInstitutoPadua(grupo.nome);

  return (
    <section className={`panel-3d overflow-hidden ${padua ? "panel-3d-active" : ""}`} data-testid={`locais-empresa-${grupo.chave}`} aria-label={`Locais de ${grupo.nome}`}>
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-3">
          <div className="bevel-3d p-2 shrink-0"><Building2 className="w-4 h-4 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-[15px] uppercase tracking-tight leading-tight break-words" title={grupo.nome}>{grupo.nome}</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {padua ? "Empresa principal · " : ""}{grupo.locais.length} local{grupo.locais.length !== 1 ? "is" : ""} de atendimento
            </p>
          </div>
          <button type="button" onClick={onToggle} aria-expanded={aberto}
            aria-label={`${aberto ? "Recolher" : "Abrir"} locais de ${grupo.nome}`}
            data-testid={`locais-empresa-alternar-${grupo.chave}`}
            className="bevel-3d p-2 shrink-0">
            {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
        {/* Resumo: 4 posicoes fixas, mesma ordem, inclusive zero */}
        <ul className="pax-resumo" aria-label="Resumo por modalidade" data-testid={`locais-resumo-${grupo.chave}`}>
          {ORDEM_MODOS.map((m) => {
            const meta = MODO_META[m];
            return (
              <li key={m} data-modo={m} data-zero={contagem[m] === 0} data-testid={`locais-resumo-slot-${m}`}
                className="pax-resumo-slot min-h-7 py-1 min-w-0 flex items-center gap-1.5 rounded-[3px] border px-2 text-[9px] font-black uppercase tracking-wider"
                style={{ backgroundColor: meta.fundo, color: meta.texto, borderColor: meta.borda }} title={meta.explicacao}>
                <meta.Icon className="w-3 h-3 shrink-0" aria-hidden />
                <span className="tabular-nums shrink-0">{contagem[m]}</span>
                <span>{meta.rotulo}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {aberto && (
        <div className="px-4 pb-4 pt-1 space-y-6 border-t border-border/40">
          {presenciais.length > 0 && (
            <div className="pt-4">
              <ArvoreGeografica locais={presenciais} onEdit={onEdit} onToggleAtivo={onToggleAtivo} />
            </div>
          )}
          {online.length > 0 && (
            <div className={presenciais.length ? "" : "pt-4"}>
              <Cabecalho nivel={1} rotulo="Online · endereço só como referência" qtd={online.length} icone={<MODO_META.online.Icon className="w-3.5 h-3.5 text-primary" />} />
              <div className={GRADE}>
                {online.map((l) => <LocalCard key={l.id} c={l} onEdit={() => onEdit(l)} onToggleAtivo={(v) => onToggleAtivo(l, v)} />)}
              </div>
            </div>
          )}
          {definir.length > 0 && (
            <div className={presenciais.length || online.length ? "" : "pt-4"}>
              <Cabecalho nivel={1} rotulo="Indefinido · informe a modalidade" qtd={definir.length} icone={<MODO_META.definir.Icon className="w-3.5 h-3.5 text-primary" />} />
              <div className={GRADE}>
                {definir.map((l) => <LocalCard key={l.id} c={l} onEdit={() => onEdit(l)} onToggleAtivo={(v) => onToggleAtivo(l, v)} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function chaveEmpresa(l: LocalAtendimento): string { return l.empresaId ? `e${l.empresaId}` : "sem"; }

export function LocaisPorEmpresa({ locais, onEdit, onToggleAtivo, empresaFiltro, onEmpresaFiltro }: ListaProps) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<ModoLocal | "todos">("todos");
  const [fechadas, setFechadas] = useState<Set<string>>(() => new Set());

  const empresas = useMemo(() => {
    const map = new Map<string, { chave: string; id: number | null; nome: string; qtd: number }>();
    for (const l of locais) {
      const chave = chaveEmpresa(l);
      if (!map.has(chave)) map.set(chave, { chave, id: l.empresaId, nome: l.empresaNome ?? "Sem empresa vinculada", qtd: 0 });
      map.get(chave)!.qtd += 1;
    }
    return [...map.values()].sort(compararEmpresas);
  }, [locais]);

  const filtroEfetivo: EmpresaFiltro = empresaFiltro === "todas" || empresas.some((e) => e.chave === empresaFiltro) ? empresaFiltro : "todas";
  const escopo = useMemo(() => filtroEfetivo === "todas" ? locais : locais.filter((l) => chaveEmpresa(l) === filtroEfetivo), [locais, filtroEfetivo]);
  const nomeEscopo = filtroEfetivo === "todas" ? "Todas as empresas" : (empresas.find((e) => e.chave === filtroEfetivo)?.nome ?? "");

  const contagemGeral = useMemo(() => {
    const m: Record<ModoLocal, number> = { sede: 0, externo: 0, online: 0, definir: 0 };
    for (const l of escopo) m[modoDoLocal(l)] += 1;
    return m;
  }, [escopo]);

  const grupos = useMemo<GrupoEmpresa[]>(() => {
    const q = semAcento(busca);
    const map = new Map<string, GrupoEmpresa>();
    for (const l of escopo) {
      if (filtro !== "todos" && modoDoLocal(l) !== filtro) continue;
      if (q && !semAcento([l.name, l.cidade, l.bairro, l.zona, l.empresaNome].filter(Boolean).join(" ")).includes(q)) continue;
      const chave = chaveEmpresa(l);
      if (!map.has(chave)) map.set(chave, { chave, empresaId: l.empresaId, nome: l.empresaNome ?? "Sem empresa vinculada", locais: [] });
      map.get(chave)!.locais.push(l);
    }
    return [...map.values()].sort((a, b) => compararEmpresas({ nome: a.nome, id: a.empresaId }, { nome: b.nome, id: b.empresaId }));
  }, [escopo, busca, filtro]);

  const todasAbertas = grupos.every((g) => !fechadas.has(g.chave));
  const alternar = (chave: string) => setFechadas((prev) => {
    const n = new Set(prev); if (n.has(chave)) n.delete(chave); else n.add(chave); return n;
  });
  const trocarEmpresa = (valor: EmpresaFiltro) => { setFiltro("todos"); setBusca(""); onEmpresaFiltro(valor); };

  const linhas: Array<{ valor: ModoLocal | "todos"; rotulo: string; ajuda: string; qtd: number }> = [
    { valor: "todos", rotulo: "Todos", ajuda: "Todas as modalidades da empresa exibida", qtd: escopo.length },
    ...ORDEM_MODOS.map((m) => ({ valor: m, rotulo: MODO_META[m].rotulo, ajuda: MODO_META[m].explicacao, qtd: contagemGeral[m] })),
  ];

  return (
    <div className="space-y-5">
      <div className="panel-3d-sub p-4 space-y-4">
        {/* Empresa exibida: escolha explicita, nunca implicita */}
        <div className="grid gap-2 md:grid-cols-[14rem_minmax(0,1fr)] md:items-center">
          <label htmlFor="locais-empresa-filtro" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Empresa exibida</label>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <select id="locais-empresa-filtro" data-testid="locais-empresa-filtro" value={filtroEfetivo}
              onChange={(e) => trocarEmpresa(e.target.value)}
              className="field-engraved h-10 px-3 text-[12px] font-bold w-full sm:w-80 rounded-[6px]">
              <option value="todas">Todas as empresas ({locais.length} locais)</option>
              {empresas.map((e) => <option key={e.chave} value={e.chave}>{e.nome} ({e.qtd})</option>)}
            </select>
            <span className="text-[11px] text-muted-foreground" data-testid="locais-empresa-escopo">
              Exibindo: <b className="text-foreground">{nomeEscopo}</b>
            </span>
          </div>
        </div>

        {/* Modalidade: uma linha por significado, botao de largura fixa e ajuda a direita */}
        <div className="space-y-2" role="group" aria-label="Filtrar por modalidade" data-testid="locais-filtros">
          {linhas.map(({ valor, rotulo, ajuda, qtd }) => {
            const ativo = filtro === valor;
            const meta = valor === "todos" ? null : MODO_META[valor];
            return (
              <div key={valor} className="pax-filtro-linha">
                <button type="button" onClick={() => setFiltro(valor)} aria-pressed={ativo} data-testid={`locais-filtro-${valor}`}
                  className="bevel-3d pax-escolha h-10 w-full px-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                  {meta ? (
                    <span className="inline-flex items-center justify-center rounded-[3px] border w-6 h-6 shrink-0"
                      style={{ backgroundColor: meta.fundo, color: meta.texto, borderColor: meta.borda }}>
                      <meta.Icon className="w-3 h-3" aria-hidden />
                    </span>
                  ) : <span className="w-6 h-6 shrink-0 inline-flex items-center justify-center"><Building2 className="w-3.5 h-3.5" aria-hidden /></span>}
                  <span className="leading-tight text-left">{rotulo}</span>
                  <span className="ml-auto tabular-nums">{qtd}</span>
                </button>
                <span className="text-[11px] text-muted-foreground leading-snug min-w-0">{ajuda}</span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar local, cidade, empresa…" className="field-engraved pl-8 h-9 text-xs" aria-label="Buscar local" data-testid="locais-busca" />
          </div>
          <button type="button" onClick={() => setFechadas(todasAbertas ? new Set(grupos.map((g) => g.chave)) : new Set())}
            data-testid="locais-alternar-todas"
            className="bevel-3d h-9 px-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 sm:ml-auto">
            {todasAbertas ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
            {todasAbertas ? "Recolher todas" : "Abrir todas"}
          </button>
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="concave-3d text-center py-12 text-muted-foreground text-sm">Nenhum local encontrado com este filtro.</div>
      ) : grupos.map((g) => (
        <PainelEmpresa key={g.chave} grupo={g} aberto={!fechadas.has(g.chave)} onToggle={() => alternar(g.chave)} onEdit={onEdit} onToggleAtivo={onToggleAtivo} />
      ))}
    </div>
  );
}
