import { Switch } from "@/components/ui/switch";

// Grade de saidas da pergunta (Padroes 5, 10 e 13 da skill-layout-paxter):
// UM template de colunas fixas no cabecalho E nas linhas, codigo em insert Bevel de largura unica,
// status em texto curto centralizado e o seletor (Switch quadrado) em sulco Concavo.
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
}

export function LinhaGradeSaidas({ codigo, corCodigo, nome, estado, ligada, desabilitada, rotuloAcessivel, dica, testid, onAlternar }: LinhaSaidaProps) {
  const e = ROTULO_ESTADO[estado];
  return (
    <div className={`${GRADE_SAIDAS} border border-transparent px-1 py-0.5 hover:bg-black/5`}>
      <span className="bevel-3d truncate px-1 py-0.5 text-center font-mono text-[10px] font-bold" style={{ color: corCodigo }} title={codigo}>{codigo}</span>
      <span className="min-w-0 truncate text-[11px]" title={nome}>{nome}</span>
      <span className="text-center text-[9px] font-bold uppercase" style={{ color: e.cor }}>{e.texto}</span>
      <span className="concave-3d flex items-center justify-center px-1 py-0.5" title={dica}>
        <Switch checked={ligada} disabled={desabilitada} onCheckedChange={onAlternar} aria-label={rotuloAcessivel} data-testid={testid} className="h-5 w-9" />
      </span>
    </div>
  );
}
