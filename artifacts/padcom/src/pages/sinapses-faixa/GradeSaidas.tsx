import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TogglePaxter } from "@/components/ui/toggle-paxter";
import { collabAuthHeaders } from "@/lib/collab-auth";

// Grade de saidas da pergunta (Padroes 5, 10 e 13 da skill-layout-paxter):
// UM template de colunas fixas no cabecalho E nas linhas, codigo em insert Bevel de largura unica,
// status em texto curto centralizado e o seletor (TogglePaxter dourado) em sulco Concavo.
export const GRADE_SAIDAS = "grid grid-cols-[4.75rem_minmax(0,1fr)_5.25rem_3.25rem] items-center gap-x-2";

export type EstadoSaida = "ATIVA" | "PROPOSTA" | "DESLIGADA" | "NAO" | "SEM_SAIDA";
const ROTULO_ESTADO: Record<EstadoSaida, { texto: string; cor: string }> = {
  ATIVA: { texto: "Ativa", cor: "#166534" },
  PROPOSTA: { texto: "Proposta", cor: "#9b6b11" },
  DESLIGADA: { texto: "Desligada", cor: "#6b7280" },
  NAO: { texto: "Não", cor: "#6b7280" },
  SEM_SAIDA: { texto: "Sem saída", cor: "#b91c1c" },
};

export function CabecalhoGradeSaidas({ rotuloSeletor = "Ligar" }: { rotuloSeletor?: string }) {
  const c = "bevel-3d px-1 py-0.5 text-center text-[9px] font-black uppercase tracking-wider text-primary/80";
  return (
    <div className={`${GRADE_SAIDAS} border border-transparent px-1 py-1`} data-testid="grade-saidas-cabecalho">
      <span className={c}>Código</span>
      <span className={`${c} text-left`}>Saída</span>
      <span className={c}>Status</span>
      <span className={c}>{rotuloSeletor}</span>
    </div>
  );
}

export interface LinhaSaidaProps {
  codigo: string;
  corCodigo: string;
  nome: string;
  estado: EstadoSaida;
  ligada: boolean;
  desabilitada: boolean;
  rotuloAcessivel: string;
  dica: string;
  testid: string;
  onAlternar: () => void;
  /** Quando informados, clicar no nome expande o resumo do cadastro (fórmula, injetável, implante, exame). */
  tipo?: string;
  destinoId?: number;
}

interface Resumo { titulo: string; itens: string[]; linhas: Array<{ rotulo: string; valor: string }> }

export function ResumoDestino({ tipo, destinoId }: { tipo: string; destinoId: number }) {
  const q = useQuery<Resumo>({
    queryKey: ["/api/cadastros/sinapses/resumo", tipo, destinoId],
    queryFn: async () => {
      const r = await fetch(`/api/cadastros/sinapses/resumo/${tipo}/${destinoId}`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error("Não foi possível carregar o resumo");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  if (q.isLoading) return <p className="px-2 py-1 text-[10px] text-muted-foreground">Carregando resumo...</p>;
  if (q.isError || !q.data) return <p className="px-2 py-1 text-[10px] text-red-600">Não foi possível carregar o resumo. <button type="button" className="underline" onClick={() => q.refetch()}>Tentar de novo</button></p>;
  const d = q.data;
  const pega = (r: string) => d.linhas.find((l) => l.rotulo === r)?.valor;
  const poso = pega("Posologia");
  const obs = pega("Observação");
  const curtos = d.linhas.filter((l) => l.rotulo !== "Posologia" && l.rotulo !== "Observação");
  // Substância + dose: a dose (número e unidade no fim do texto) vai para uma coluna vertical alinhada.
  const partes = d.itens.map((x) => { const m = x.match(/^(.*?)\s+(\d[\d.,]*\s*[A-Za-zµ%/]+)$/); return m ? { nome: m[1], dose: m[2] } : { nome: x, dose: "" }; });
  const rot = "text-[9px] font-black uppercase tracking-wider text-primary/80";
  return (
    <div className="concave-3d mx-1 mb-1 space-y-1.5 px-2 py-1.5 text-[11px]" data-testid="grade-saidas-resumo">
      {partes.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5" data-testid="resumo-substancias">
          {partes.map((x, i) => (<div key={i} className="contents"><span className="truncate" title={x.nome}>{x.nome}</span><span className="text-right font-mono tabular-nums">{x.dose}</span></div>))}
        </div>
      )}
      {poso && (
        <div className="space-y-0.5 border-t border-black/10 pt-1" data-testid="resumo-posologia">
          <div className={rot}>Posologia</div>
          {poso.split(" · ").map((t, i) => (<div key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-muted-foreground">{i + 1}ª tomada</span><span>{t}</span></div>))}
        </div>
      )}
      {curtos.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-black/10 pt-1" data-testid="resumo-atributos">
          {curtos.map((l) => (<div key={l.rotulo} className="min-w-0"><div className={rot}>{l.rotulo}</div><div>{l.valor}</div></div>))}
        </div>
      )}
      {obs && (<div className="border-t border-black/10 pt-1" data-testid="resumo-observacao"><div className={rot}>Observação</div><div>{obs}</div></div>)}
      {d.itens.length === 0 && d.linhas.length === 0 && <p className="text-muted-foreground">Sem informações cadastradas.</p>}
    </div>
  );
}

export function LinhaGradeSaidas({ codigo, corCodigo, nome, estado, ligada, desabilitada, rotuloAcessivel, dica, testid, onAlternar, tipo, destinoId }: LinhaSaidaProps) {
  const e = ROTULO_ESTADO[estado];
  const [aberta, setAberta] = useState(false);
  const expansivel = !!tipo && destinoId !== undefined;
  return (
    <div>
    <div className={`${GRADE_SAIDAS} border border-transparent px-1 py-0.5 hover:bg-black/5`}>
      <span className="bevel-3d truncate px-1 py-0.5 text-center font-mono text-[10px] font-bold" style={{ color: corCodigo }} title={codigo}>{codigo}</span>
      {expansivel ? (
        <button type="button" aria-expanded={aberta} onClick={() => setAberta((v) => !v)} className="flex min-w-0 items-center gap-1 text-left text-[11px]" title={`${nome} — clique para ver o resumo`} data-testid={`${testid}-expandir`}>
          {aberta ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <span className="min-w-0 truncate">{nome}</span>
        </button>
      ) : <span className="min-w-0 truncate text-[11px]" title={nome}>{nome}</span>}
      <span className="text-center text-[9px] font-bold uppercase" style={{ color: e.cor }}>{e.texto}</span>
      <span className="concave-3d flex items-center justify-center px-1 py-0.5" title={dica}>
        <TogglePaxter ligado={ligada} desabilitado={desabilitada} onClick={onAlternar} rotulo={rotuloAcessivel} testid={testid} tamanho="sm" />
      </span>
    </div>
    {expansivel && aberta && <ResumoDestino tipo={tipo!} destinoId={destinoId!} />}
    </div>
  );
}

/** Ficha de contador: retângulo Côncavo de largura estável, rótulo escrito + número, com respiro (nunca apertada). */
export function FichaContador({ rotulo, valor, cor, destaque = false }: { rotulo: string; valor: number | string; cor?: string; destaque?: boolean }) {
  return (
    <span className="concave-3d inline-flex h-8 min-w-[6.5rem] shrink-0 items-center justify-between gap-3 px-3" style={{ opacity: destaque || valor !== 0 ? 1 : 0.6 }}>
      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{rotulo}</span>
      <b className="min-w-[1.5rem] text-right text-[13px] tabular-nums" style={{ color: cor }}>{valor}</b>
    </span>
  );
}
