// =============================================================================
// ADAPTER DE ACHADOS — Anamnese V2.
// LINHA VERMELHA: NAO importa nem chama `motor-anamnese.ts`. Deriva achados
// "diagnosticado" / "suspeito" de forma deterministica das respostas, apenas
// para a tela do medico e o Gemeo de Saude (rotulo: ilustrativo, nao e
// diagnostico). O motor clinico real e wiring de onda futura (spec 08).
// =============================================================================

export interface AdapterQuestion {
  id: number;
  perguntaId: string | null;
  pergunta: string | null;
  bloco: string | null;
  sistema: string | null;
  eSinalAlarme: boolean | null;
  pesoGravidade: number | null;
  tipoResposta: string | null;
}

export interface AdapterAnswer {
  questionRowId: number;
  valor: unknown;
}

export interface AdapterFinding {
  tipo: "diagnosticado" | "suspeito";
  rotulo: string;
  origemPerguntaId: string;
  severidade: string | null;
}

const NEGATIVOS = new Set([
  "nao",
  "não",
  "nenhum",
  "nenhuma",
  "nunca",
  "nao sei",
  "não sei",
  "negativo",
  "ausente",
]);

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// Uma resposta "positiva" = sinal de presenca (sim, escala alta, texto, etc.).
function respostaPositiva(valor: unknown): boolean {
  if (valor == null || typeof valor !== "object") return false;
  const v = valor as Record<string, unknown>;
  const tipo = typeof v.tipo === "string" ? v.tipo : "";
  switch (tipo) {
    case "boolean":
      return v.bool === true;
    case "single": {
      const op = typeof v.opcao === "string" ? normalizar(v.opcao) : "";
      return op.length > 0 && !NEGATIVOS.has(op);
    }
    case "multi":
      return Array.isArray(v.selecionados) && v.selecionados.length > 0;
    case "escala": {
      const escala = typeof v.escala === "number" ? v.escala : NaN;
      const max = typeof v.max === "number" && v.max > 0 ? v.max : 5;
      return Number.isFinite(escala) && escala >= Math.ceil(max / 2);
    }
    case "number":
      return typeof v.numero === "number" && v.numero > 0;
    case "texto":
      return typeof v.texto === "string" && v.texto.trim().length > 0;
    default:
      // fallback: bool true, ou qualquer valor verdadeiro simples
      return v.bool === true;
  }
}

function severidadeDe(peso: number | null): string | null {
  if (peso == null) return "baixa";
  if (peso >= 3) return "alta";
  if (peso === 2) return "media";
  return "baixa";
}

const RX_DIAGNOSTICO = /antecedent|doen|hist[oó]ri|diagn|condi[cç]/i;

export function buildFindings(
  questions: AdapterQuestion[],
  answers: AdapterAnswer[],
): AdapterFinding[] {
  const byRow = new Map<number, AdapterQuestion>();
  for (const q of questions) byRow.set(q.id, q);

  const out: AdapterFinding[] = [];
  const visto = new Set<string>();

  for (const a of answers) {
    const q = byRow.get(a.questionRowId);
    if (!q) continue;
    if (!respostaPositiva(a.valor)) continue;

    const rotulo = (q.pergunta || q.perguntaId || `Pergunta ${q.id}`).trim();
    const origem = q.perguntaId || "";

    let tipo: AdapterFinding["tipo"] | null = null;
    if (q.eSinalAlarme === true) {
      tipo = "suspeito";
    } else if (q.bloco && RX_DIAGNOSTICO.test(q.bloco)) {
      // Afirmacao positiva num bloco de antecedentes/doencas/historia.
      // Qualquer tipo positivo conta (inclui texto/numero e o fallback texto
      // de selecoes sem opcoes no banco) — ja passou por respostaPositiva.
      tipo = "diagnosticado";
    }
    if (!tipo) continue;

    const chave = `${tipo}|${rotulo}|${origem}`;
    if (visto.has(chave)) continue;
    visto.add(chave);
    out.push({ tipo, rotulo, origemPerguntaId: origem, severidade: severidadeDe(q.pesoGravidade) });
  }

  return out;
}
