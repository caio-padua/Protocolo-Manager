import { useMemo, useState } from "react";
import "./locais.css";
import { PlacaTitulo } from "@/components/ui/placa-titulo";
import { BarraGrupo } from "@/components/ui/barra-grupo";
import { SanfonaVertical } from "@/components/ui/sanfona-vertical";
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

const GRADE = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4";

/** Presencial: um grupo por "Cidade · UF" (nomes comparados sem acento), sem subdividir por região. */
function GruposPorCidade({ locais, onEdit, onToggleAtivo }: Props) {
  const grupos = useMemo(() => {
    const map = new Map<string, { rotulo: string; itens: LocalAtendimento[] }>();
    for (const l of locais) {
      const cidade = l.cidade || "Cidade não informada";
      const uf = (l.estado || "").toUpperCase();
      const chave = `${semAcento(cidade)}|${uf}`;
      if (!map.has(chave)) map.set(chave, { rotulo: uf ? `${cidade} · ${uf}` : cidade, itens: [] });
      map.get(chave)!.itens.push(l);
    }
    return [...map.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [locais]);

  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <div key={g.rotulo} className="space-y-3">
          <PlacaTitulo titulo={g.rotulo} testId="locais-cidade-rotulo" />
          <div className={GRADE}>
            {g.itens.map((l) => <LocalCard key={l.id} c={l} onEdit={() => onEdit(l)} onToggleAtivo={(v) => onToggleAtivo(l, v)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function PainelEmpresa({ grupo, aberto, onToggle, onEdit, onToggleAtivo }: { grupo: GrupoEmpresa; aberto: boolean; onToggle: () => void } & Pick<Props, "onEdit" | "onToggleAtivo">) {
  const presenciais = grupo.locais.filter((l) => { const m = modoDoLocal(l); return m === "sede" || m === "externo"; });
  const online = grupo.locais.filter((l) => modoDoLocal(l) === "online");
  const definir = grupo.locais.filter((l) => modoDoLocal(l) === "definir");
  const padua = ehInstitutoPadua(grupo.nome);

  return (
    <section className={`panel-3d overflow-hidden ${padua ? "panel-3d-active" : ""}`} data-testid={`locais-empresa-${grupo.chave}`} aria-label={`Locais de ${grupo.nome}`}>
      <div className="px-4 py-3">
        <BarraGrupo titulo={grupo.nome} aberto={aberto} onAlternar={onToggle} testIdControle={`locais-empresa-alternar-${grupo.chave}`} />
      </div>
      <SanfonaVertical aberta={aberto}>
        <div className="space-y-6 border-t border-border/40 px-4 pb-4 pt-4">
          {presenciais.length > 0 && <GruposPorCidade locais={presenciais} onEdit={onEdit} onToggleAtivo={onToggleAtivo} />}
          {online.length > 0 && (
            <div className="space-y-3">
              <PlacaTitulo titulo="Online" />
              <div className={GRADE}>
                {online.map((l) => <LocalCard key={l.id} c={l} onEdit={() => onEdit(l)} onToggleAtivo={(v) => onToggleAtivo(l, v)} />)}
              </div>
            </div>
          )}
          {definir.length > 0 && (
            <div className="space-y-3">
              <PlacaTitulo titulo="Indefinido" />
              <div className={GRADE}>
                {definir.map((l) => <LocalCard key={l.id} c={l} onEdit={() => onEdit(l)} onToggleAtivo={(v) => onToggleAtivo(l, v)} />)}
              </div>
            </div>
          )}
        </div>
      </SanfonaVertical>
    </section>
  );
}

function chaveEmpresa(l: LocalAtendimento): string { return l.empresaId ? `e${l.empresaId}` : "sem"; }

export function LocaisPorEmpresa({ locais, onEdit, onToggleAtivo, empresaFiltro, onEmpresaFiltro }: ListaProps) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<ModoLocal | "todos">("todos");
  const [fechadas, setFechadas] = useState<Set<string>>(() => new Set());

  const empresas = useMemo(() => {
    const map = new Map<string, { chave: string; id: number | null; nome: string }>();
    for (const l of locais) {
      const chave = chaveEmpresa(l);
      if (!map.has(chave)) map.set(chave, { chave, id: l.empresaId, nome: l.empresaNome ?? "Sem empresa vinculada" });
    }
    return [...map.values()].sort(compararEmpresas);
  }, [locais]);

  const filtroEfetivo: EmpresaFiltro = empresaFiltro === "todas" || empresas.some((e) => e.chave === empresaFiltro) ? empresaFiltro : "todas";
  const escopo = useMemo(() => filtroEfetivo === "todas" ? locais : locais.filter((l) => chaveEmpresa(l) === filtroEfetivo), [locais, filtroEfetivo]);
  const nomeEscopo = filtroEfetivo === "todas" ? "Todas as empresas" : (empresas.find((e) => e.chave === filtroEfetivo)?.nome ?? "");

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

  const linhas: Array<{ valor: ModoLocal | "todos"; rotulo: string; ajuda: string }> = [
    { valor: "todos", rotulo: "Todos", ajuda: "Todas as modalidades da empresa exibida" },
    ...ORDEM_MODOS.map((m) => ({ valor: m, rotulo: MODO_META[m].rotulo, ajuda: MODO_META[m].explicacao })),
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
              <option value="todas">Todas as empresas</option>
              {empresas.map((e) => <option key={e.chave} value={e.chave}>{e.nome}</option>)}
            </select>
            <span className="text-[11px] text-muted-foreground" data-testid="locais-empresa-escopo">
              Exibindo: <b className="text-foreground">{nomeEscopo}</b>
            </span>
          </div>
        </div>

        {/* Modalidade: uma linha por significado, botao de largura fixa e ajuda a direita */}
        <div className="space-y-2" role="group" aria-label="Filtrar por modalidade" data-testid="locais-filtros">
          {linhas.map(({ valor, rotulo, ajuda }) => {
            const ativo = filtro === valor;
            return (
              <div key={valor} className="pax-filtro-linha">
                <button type="button" onClick={() => setFiltro(valor)} aria-pressed={ativo} data-testid={`locais-filtro-${valor}`}
                  className="bevel-3d pax-escolha h-10 w-full px-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                  <span className="leading-tight text-left">{rotulo}</span>
                </button>
                <span className="text-[11px] text-muted-foreground leading-snug min-w-0">{ajuda}</span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar local, cidade, empresa…" className="field-engraved h-9 text-xs" aria-label="Buscar local" data-testid="locais-busca" />
          </div>
          <button type="button" onClick={() => setFechadas(todasAbertas ? new Set(grupos.map((g) => g.chave)) : new Set())}
            data-testid="locais-alternar-todas"
            className="bevel-3d h-9 px-3 text-[10px] font-black uppercase tracking-widest sm:ml-auto">
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
