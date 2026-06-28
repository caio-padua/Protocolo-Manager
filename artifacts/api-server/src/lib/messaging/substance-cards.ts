// ============================================================================
// CARTÕES DE SUBSTÂNCIA (layout v2 aprovado pelo CEO) — substitui a antiga tabela
// de 3 colunas (Substância | Dose | Status) por CARTÕES EMPILHADOS de 3 linhas:
//   linha 1: nome COM a dose embutida (só a quantidade da substância — ex.
//            "Coenzima Q10 100 mg" —, NUNCA a concentração "/ ml");
//   linha 2: sessões + frequência;
//   linha 3: status (pílula Aplicado/Não aplicado), quando houver.
// Cada cartão é separado do anterior por um filete dourado fino. Fonte única
// reutilizada pelos e-mails ricos (pré/pós-sessão, protocolo, onboarding).
// ============================================================================

const SERIF = "Georgia,'Times New Roman',Times,serif";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type StatusCartao = "applied" | "notApplied" | null | undefined;

export interface CartaoSubstanciaItem {
  /** Nome JÁ com a dose embutida (só miligrama da substância, sem "/ ml"). */
  nomeComDose: string;
  /** Sessões + frequência (ex.: "Sessão 4 de 12 · a cada 7 dias"). */
  sessoesFrequencia?: string;
  /** Status da aplicação. Ausente = não mostra a 3ª linha. */
  status?: StatusCartao;
  /** Texto de status custom (vence o padrão Aplicado/Não aplicado). */
  statusLabel?: string;
  /** Ponto colorido semântico da substância (mantido). */
  cor?: string;
}

function pilulaStatus(it: CartaoSubstanciaItem): string {
  if (!it.status && !it.statusLabel) return "";
  const aplicado = it.status === "applied";
  const bg = aplicado ? "#0f2a1e" : "#2a1010";
  const fg = aplicado ? "#34d399" : "#f87171";
  const bd = aplicado ? "rgba(52,211,153,.40)" : "rgba(248,113,113,.40)";
  const label = it.statusLabel ?? (aplicado ? "Aplicado" : "Não aplicado");
  return `<span style="display:inline-block; background:${bg}; color:${fg}; border:1px solid ${bd}; padding:3px 12px; border-radius:999px; font-size:12px; font-weight:600; letter-spacing:.3px;">${esc(label)}</span>`;
}

/**
 * Renderiza a coleção de substâncias como cartões empilhados (layout v2).
 * Retorna "" quando a lista é vazia (degrade gracioso).
 */
export function blocoCartoesSubstancias(itens: CartaoSubstanciaItem[]): string {
  if (!itens || itens.length === 0) return "";

  const linhas = itens
    .map((it, i) => {
      // Filete dourado separando cada cartão do anterior (não no primeiro).
      const sep = i === 0 ? "" : "border-top:1px solid rgba(201,162,79,.20);";
      const dot = it.cor
        ? `<span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${it.cor}; margin-right:9px; vertical-align:middle;"></span>`
        : "";
      const linha2 = it.sessoesFrequencia
        ? `<div style="color:#9fb0c8; font-size:13px; line-height:1.5; margin-top:6px;">${esc(it.sessoesFrequencia)}</div>`
        : "";
      const pilula = pilulaStatus(it);
      const linha3 = pilula ? `<div style="margin-top:10px;">${pilula}</div>` : "";
      return `<tr><td style="padding:16px 18px; ${sep}">
        <div style="color:#f3ead6; font-family:${SERIF}; font-size:16px; font-weight:600; line-height:1.3;">${dot}${esc(it.nomeComDose)}</div>
        ${linha2}
        ${linha3}
      </td></tr>`;
    })
    .join("\n      ");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#13234a; border:1px solid rgba(201,162,79,.24); border-radius:14px; overflow:hidden; margin:8px 0 4px; box-shadow:0 8px 22px rgba(0,0,0,.30);">
      ${linhas}
    </table>`;
}
