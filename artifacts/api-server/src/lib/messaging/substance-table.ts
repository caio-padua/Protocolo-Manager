// ============================================================================
// TABELA DE SUBSTÂNCIAS (layout aprovado pelo CEO em 28/06/2026) — colunas
// ALINHADAS na vertical para TODAS as substâncias (uma "linha vertical
// imaginária" por coluna):
//   SUBSTÂNCIA | DOSE | SESSÃO | FREQUÊNCIA | STATUS
// Regras do CEO:
//   - a substância fica em UMA linha, com a dose só na MILIGRAMAGEM (a
//     concentração "/ N ml" é removida — ex.: "100 mg / 2 ml" vira "100 mg");
//   - cada dado tem a SUA coluna (dose ≠ sessão ≠ frequência ≠ status), e todos
//     os itens alinham na mesma vertical;
//   - frequência no formato "a cada N dias";
//   - status em pílula (Aplicado / Não aplicado).
// Uma coluna só aparece se ao menos um item tiver o dado; as demais células
// ficam vazias, preservando o alinhamento. Fonte ÚNICA reutilizada pelos
// e-mails ricos (pré/pós-sessão, protocolo, onboarding).
// ============================================================================

const SERIF = "Georgia,'Times New Roman',Times,serif";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type StatusSub = "applied" | "notApplied" | null | undefined;

export interface ItemTabelaSubstancia {
  /** Nome da substância (sem a dose embutida — a dose vai na coluna própria). */
  nome: string;
  /** Dose CRUA; o render mantém só a miligramagem (remove a concentração "/ ml"). */
  dose?: string;
  /** Sessão atual sobre o total (ex.: "4/12"). */
  sessao?: string;
  /** Frequência no padrão "a cada N dias". */
  frequencia?: string;
  /** Status da aplicação. Ausente = coluna Status sem pílula nesta linha. */
  status?: StatusSub;
  /** Texto de status custom (vence o padrão Aplicado/Não aplicado). */
  statusLabel?: string;
  /** Ponto colorido semântico da substância (mantido ao lado do nome). */
  cor?: string;
}

/** Remove a concentração "/ N ml" da dose, deixando só a miligramagem. */
export function soMiligramas(dose?: string): string {
  if (!dose) return "";
  return dose.replace(/\s*\/\s*[\d.,]*\s*m?l\b.*$/i, "").trim();
}

function pilulaStatus(it: ItemTabelaSubstancia): string {
  if (!it.status && !it.statusLabel) return "";
  const aplicado = it.status === "applied";
  const bg = aplicado ? "#0f2a1e" : "#2a1010";
  const fg = aplicado ? "#34d399" : "#f87171";
  const bd = aplicado ? "rgba(52,211,153,.40)" : "rgba(248,113,113,.40)";
  const label = it.statusLabel ?? (aplicado ? "Aplicado" : "Não aplicado");
  return `<span style="display:inline-block; background:${bg}; color:${fg}; border:1px solid ${bd}; padding:3px 12px; border-radius:999px; font-size:12px; font-weight:600; letter-spacing:.3px; white-space:nowrap;">${esc(label)}</span>`;
}

/**
 * Renderiza a coleção de substâncias como TABELA de colunas alinhadas (layout
 * aprovado pelo CEO). Retorna "" quando a lista é vazia (degrade gracioso).
 */
export function blocoTabelaSubstancias(itens: ItemTabelaSubstancia[]): string {
  if (!itens || itens.length === 0) return "";

  const temDose = itens.some((i) => soMiligramas(i.dose));
  const temSessao = itens.some((i) => i.sessao);
  const temFreq = itens.some((i) => i.frequencia);
  const temStatus = itens.some((i) => i.status || i.statusLabel);

  const th =
    "padding:11px 12px; color:#c9a24f; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid rgba(201,162,79,.30);";
  const td =
    "padding:13px 12px; border-bottom:1px solid rgba(201,162,79,.10); font-size:14px; vertical-align:middle;";
  const num = "font-variant-numeric:tabular-nums; white-space:nowrap;";

  const head = `<tr style="background:#102043;">
        <th style="${th} text-align:left;">Substância</th>
        ${temDose ? `<th style="${th} text-align:center; white-space:nowrap;">Dose</th>` : ""}
        ${temSessao ? `<th style="${th} text-align:center; white-space:nowrap;">Sessão</th>` : ""}
        ${temFreq ? `<th style="${th} text-align:center; white-space:nowrap;">Frequência</th>` : ""}
        ${temStatus ? `<th style="${th} text-align:center;">Status</th>` : ""}
      </tr>`;

  const rows = itens
    .map((it, i) => {
      // Surpresa de melhoria: leve listra (zebra) para o olho seguir a linha até
      // a coluna certa — ajuda o alinhamento vertical sem poluir.
      const zebra = i % 2 === 1 ? "background:rgba(255,255,255,.022);" : "";
      const dot = it.cor
        ? `<span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${it.cor}; margin-right:9px; vertical-align:middle;"></span>`
        : "";
      return `<tr style="${zebra}">
        <td style="${td} text-align:left;"><span style="color:#f3ead6; font-family:${SERIF}; font-weight:600;">${dot}${esc(it.nome)}</span></td>
        ${temDose ? `<td style="${td} ${num} text-align:center; color:#e6d6ad;">${esc(soMiligramas(it.dose))}</td>` : ""}
        ${temSessao ? `<td style="${td} ${num} text-align:center; color:#c2cee0;">${esc(it.sessao ?? "")}</td>` : ""}
        ${temFreq ? `<td style="${td} text-align:center; color:#9fb0c8; white-space:nowrap;">${esc(it.frequencia ?? "")}</td>` : ""}
        ${temStatus ? `<td style="${td} text-align:center;">${pilulaStatus(it)}</td>` : ""}
      </tr>`;
    })
    .join("\n      ");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#13234a; border:1px solid rgba(201,162,79,.24); border-radius:14px; overflow:hidden; margin:8px 0 4px; box-shadow:0 8px 22px rgba(0,0,0,.30);">
      <thead>${head}</thead>
      <tbody>
      ${rows}
      </tbody>
    </table>`;
}
