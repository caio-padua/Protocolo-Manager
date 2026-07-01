// ============================================================================
// LISTA DE SUBSTÂNCIAS DO E-MAIL — CARTÕES ALINHADOS (decisão do CEO em
// 30/06/2026, refinando a de 28/06/2026):
//   cada substância vira um CARTÃO próprio (painel navy com friso dourado),
//   PORÉM as informações dentro dele ficam ALINHADAS por uma "linha vertical
//   imaginária" que se repete IGUAL de um cartão para o outro.
//
// Estrutura de cada cartão:
//   linha 1:  [ponto] Substância ............................. Dose (só massa)
//   linha 2:  Sessão N/total ............................. a cada N dias
//   (opcional) pílula de status (Aplicado / Não aplicado)
//
// Regras duráveis do CEO mantidas:
//   - a substância fica em UMA linha, com a dose só na MILIGRAMAGEM (a
//     concentração "/ N ml" é removida — ex.: "100 mg / 2 ml" vira "100 mg";
//     unidade real preservada: B12 legítimo continua em mcg);
//   - coluna da esquerda (nome / sessão) e coluna da direita (dose / frequência)
//     usam LARGURA FIXA idêntica em todos os cartões → alinhamento vertical
//     consistente ("linha vertical imaginária");
//   - frequência no formato "a cada N dias"; status em pílula.
// Uma linha/coluna só aparece se ao menos um item tiver o dado (degrade
// gracioso). Fonte ÚNICA reutilizada pelos e-mails ricos (pré/pós-sessão,
// protocolo, onboarding).
// ============================================================================

const SERIF = "Georgia,'Times New Roman',Times,serif";

// Larguras FIXAS das duas colunas internas do cartão. É o que garante que a
// dose (linha 1, direita) e a frequência (linha 2, direita) caiam sempre na
// MESMA vertical, em todos os cartões — a "linha vertical imaginária" do CEO.
const COL_ESQ = "58%";
const COL_DIR = "42%";

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
  /** Status da aplicação. Ausente = cartão sem pílula de status. */
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

/**
 * Valida a cor do ponto antes de injetar no CSS inline (anti-injeção). Aceita só
 * hex (#RGB / #RRGGBB) ou rgb()/rgba(); qualquer outra coisa vira "" (sem ponto).
 */
function corSegura(cor?: string): string {
  if (!cor) return "";
  const c = cor.trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  if (/^rgba?\(\s*[\d.,%\s]+\)$/i.test(c)) return c;
  return "";
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

/** Rótulo curto dourado em maiúsculas (identifica o dado dentro do cartão). */
function rotulo(txt: string): string {
  return `<span style="color:#c9a24f; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.6px;">${esc(txt)}</span>`;
}

/**
 * Renderiza a coleção de substâncias como CARTÕES ALINHADOS (layout aprovado
 * pelo CEO em 30/06/2026). Retorna "" quando a lista é vazia (degrade gracioso).
 */
export function blocoTabelaSubstancias(itens: ItemTabelaSubstancia[]): string {
  if (!itens || itens.length === 0) return "";

  const temSessao = itens.some((i) => i.sessao);
  const temFreq = itens.some((i) => i.frequencia);
  const temLinha2 = temSessao || temFreq;

  const hairline = `<div style="height:1px; line-height:1px; font-size:0; background:linear-gradient(90deg, rgba(201,162,79,0), rgba(201,162,79,.30), rgba(201,162,79,0)); margin:9px 0;">&nbsp;</div>`;

  const cartoes = itens
    .map((it) => {
      const cor = corSegura(it.cor);
      const dot = cor
        ? `<span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${cor}; margin-right:9px; vertical-align:middle;"></span>`
        : "";
      const dose = soMiligramas(it.dose);

      // Linha 1: Substância (esquerda) ....... Dose só massa (direita).
      const linha1 = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">
          <tr>
            <td style="width:${COL_ESQ}; padding:0; text-align:left; vertical-align:baseline; color:#f3ead6; font-family:${SERIF}; font-weight:600; font-size:15px; line-height:1.3;">${dot}${esc(it.nome)}</td>
            <td style="width:${COL_DIR}; padding:0; text-align:right; vertical-align:baseline; color:#e6d6ad; font-size:15px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap;">${esc(dose)}</td>
          </tr>
        </table>`;

      // Linha 2: Sessão N/total (esquerda) ....... Frequência (direita).
      const linha2 = temLinha2
        ? hairline +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">
          <tr>
            <td style="width:${COL_ESQ}; padding:0; text-align:left; vertical-align:baseline;">${
              temSessao
                ? `${rotulo("Sessão")}<span style="color:#c2cee0; font-size:14px; font-variant-numeric:tabular-nums; margin-left:6px;">${esc(it.sessao ?? "")}</span>`
                : ""
            }</td>
            <td style="width:${COL_DIR}; padding:0; text-align:right; vertical-align:baseline;">${
              temFreq
                ? `${rotulo("Freq.")}<span style="color:#9fb0c8; font-size:13px; margin-left:6px; white-space:nowrap;">${esc(it.frequencia ?? "")}</span>`
                : ""
            }</td>
          </tr>
        </table>`
        : "";

      // Status: pílula opcional, alinhada à direita (sob a coluna da dose).
      const pilula = pilulaStatus(it);
      const linhaStatus = pilula
        ? `<div style="margin-top:9px; text-align:right;">${pilula}</div>`
        : "";

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#13234a; border:1px solid rgba(201,162,79,.24); border-radius:12px; margin:0 0 10px; box-shadow:0 6px 16px rgba(0,0,0,.26);">
        <tr>
          <td style="padding:13px 15px;">
            ${linha1}
            ${linha2}
            ${linhaStatus}
          </td>
        </tr>
      </table>`;
    })
    .join("\n      ");

  // Contêiner de largura 100% só para manter a coluna uniforme entre cartões.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
      <tr><td style="padding:0;">
      ${cartoes}
      </td></tr>
    </table>`;
}
