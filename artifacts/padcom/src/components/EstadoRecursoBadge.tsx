// Selo de estado comercial de um recurso. Só informa; nunca contrata, cobra ou libera acesso
// (a autorização real é sempre do servidor). Largura fixa: o selo ocupa o mesmo lugar em todo cartão.
export type EstadoRecurso = "plano_atual" | "disponivel" | "conhecer_planos" | "em_breve";

const TEXTO: Record<EstadoRecurso, { t: string; cor: string }> = {
  plano_atual: { t: "Plano atual", cor: "#2f7d4f" },
  disponivel: { t: "Recurso disponível", cor: "#16284a" },
  conhecer_planos: { t: "Conhecer planos", cor: "#8a6d2f" },
  em_breve: { t: "Em breve", cor: "#6b7280" },
};

export default function EstadoRecursoBadge({ estado }: { estado: EstadoRecurso }) {
  const x = TEXTO[estado];
  return (
    <span data-testid={`estado-${estado}`} className="concave-3d inline-flex items-center justify-center rounded-[4px] w-[9.5rem] shrink-0 px-2 py-1 text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
      style={{ color: x.cor }}>{x.t}</span>
  );
}
