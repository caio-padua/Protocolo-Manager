/**
 * Aprendizagem limitada de perguntas comuns no Telegram.
 *
 * O modelo só padroniza a pergunta; a resposta nunca é gerada por IA.
 * A resposta vem, sem alterações, de uma orientação vigente e aprovada.
 */
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { requireAiTenant } from "./ai-central";
import { logger } from "./logger";
import { garantirTabelasCredito, registrarCustoProvedor } from "./mensageria-credito";

const MODELO_APRENDIZ = "claude-haiku-5-5";
const LIMIAR_APRENDIZAGEM = 3;
const SIMILARIDADE_MINIMA = 0.72;

export interface ExecutorTelegramAprendiz {
  execute: (query: SQL) => Promise<{ rows: unknown[] }>;
}

export function normalizarPerguntaAprendida(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ola|oi|bom dia|boa tarde|boa noite|por favor|por gentileza|obrigado|obrigada)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TERMOS_CLINICOS = /\b(dor|dores|sintoma|sintomas|reacao|reacoes|efeito colateral|efeitos colaterais|medicacao|medicamento|remedio|dose|dosagem|tratamento|diagnostico|exame|resultado|pressao|febre|enjoo|nausea|vomito|alergia|prescricao|receita|hormonio|tirzepatida|sibutramina|bupropiona|naltrexona)\b/i;
const TERMOS_COMERCIAIS = /\b(preco|precos|valor|valores|quanto custa|custa|mensalidade|pagamento|pagar|pix|cartao|desconto|orcamento|cobranca)\b/i;
const TERMOS_IDENTIDADE = /\b(cpf|data de nascimento|nascimento|ano de nascimento|telefone|celular|email|e-mail|endereco residencial)\b/i;
const PII = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/,
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
  /\b(?:19|20)\d{2}\b/,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
];

const CATEGORIAS_PERMITIDAS: Record<string, Set<string> | null> = {
  apresentacao: new Set(["clinica", "assistente", "primeiro_contato", "retorno"]),
  cadastro: new Set(["orientacoes"]),
  duvidas: new Set(["consulta", "aplicativo", "prazos"]),
  gerais: new Set(["locais", "atendimento", "aplicativo"]),
};

export function perguntaSeguraParaAprender(
  texto: string,
  categoria: string | null,
  subcategoria: string | null,
): boolean {
  const original = texto.trim();
  const normalizada = normalizarPerguntaAprendida(original);
  const subcategorias = categoria ? CATEGORIAS_PERMITIDAS[categoria] : undefined;
  if (!original || original.length > 600 || normalizada.split(" ").filter(Boolean).length < 3) return false;
  if (subcategorias === undefined || (subcategorias && (!subcategoria || !subcategorias.has(subcategoria)))) return false;
  if (TERMOS_CLINICOS.test(normalizada) || TERMOS_COMERCIAIS.test(normalizada) || TERMOS_IDENTIDADE.test(normalizada)) return false;
  if (PII.some((pattern) => pattern.test(original))) return false;
  return true;
}

function tokens(texto: string): Set<string> {
  return new Set(normalizarPerguntaAprendida(texto).split(" ").filter((word) => word.length >= 3));
}

export function similaridadePerguntas(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / new Set([...left, ...right]).size;
}

function respostaSegura(texto: string): boolean {
  const normalizada = normalizarPerguntaAprendida(texto);
  return texto.length >= 10 && texto.length <= 600 &&
    !TERMOS_CLINICOS.test(normalizada) && !TERMOS_COMERCIAIS.test(normalizada) &&
    !TERMOS_IDENTIDADE.test(normalizada) && !temDadoPessoal(texto);
}

export async function migrarTabelasTelegramAprendiz(exec: ExecutorTelegramAprendiz): Promise<void> {
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_faq_aprendidas (
      id BIGSERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      pergunta TEXT NOT NULL,
      pergunta_normalizada TEXT NOT NULL,
      variacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
      resposta TEXT NOT NULL,
      resposta_fonte TEXT NOT NULL,
      resposta_editada BOOLEAN NOT NULL DEFAULT FALSE,
      orientacao_id BIGINT NOT NULL,
      ativa BOOLEAN NOT NULL DEFAULT TRUE,
      usos BIGINT NOT NULL DEFAULT 0,
      economia_ia BIGINT NOT NULL DEFAULT 0,
      criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      excluida_em TIMESTAMPTZ,
      UNIQUE (empresa_id, pergunta_normalizada)
    )`);
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_faq_observacoes (
      id BIGSERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      inbox_message_id BIGINT NOT NULL,
      orientacao_id BIGINT NOT NULL,
      pergunta TEXT NOT NULL,
      pergunta_normalizada TEXT NOT NULL,
      observada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (empresa_id, inbox_message_id)
    )`);
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_faq_usos (
      empresa_id INTEGER NOT NULL,
      inbox_message_id BIGINT NOT NULL,
      faq_id BIGINT NOT NULL,
      usada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (empresa_id, inbox_message_id)
    )`);
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_faq_versoes (
      id BIGSERIAL PRIMARY KEY,
      faq_id BIGINT NOT NULL,
      empresa_id INTEGER NOT NULL,
      pergunta TEXT NOT NULL,
      variacoes JSONB NOT NULL,
      resposta TEXT NOT NULL,
      ativa BOOLEAN NOT NULL,
      alterada_por TEXT NOT NULL,
      criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_ia_resolucoes (
      empresa_id INTEGER NOT NULL,
      inbox_message_id BIGINT NOT NULL,
      caminho TEXT NOT NULL CHECK (caminho IN ('cardapio','regra','interprete','conferente','equipe','agendamento')),
      interprete_chamado BOOLEAN NOT NULL DEFAULT FALSE,
      conferente_chamado BOOLEAN NOT NULL DEFAULT FALSE,
      aprendiz_chamado BOOLEAN NOT NULL DEFAULT FALSE,
      criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (empresa_id, inbox_message_id)
    )`);
  await exec.execute(sql`CREATE INDEX IF NOT EXISTS ix_telegram_faq_busca ON telegram_faq_aprendidas (empresa_id, ativa, pergunta_normalizada) WHERE excluida_em IS NULL`);
  await exec.execute(sql`CREATE INDEX IF NOT EXISTS ix_telegram_faq_observacoes_cluster ON telegram_faq_observacoes (empresa_id, orientacao_id, observada_em DESC)`);
}

export async function buscarFaqAprendida(empresaId: number, texto: string): Promise<{ id: number; resposta: string } | null> {
  const normalizada = normalizarPerguntaAprendida(texto);
  if (!normalizada) return null;
  const r = await db.execute(sql`
    SELECT f.id, f.resposta
    FROM telegram_faq_aprendidas f
    JOIN orientacoes_aprovadas o ON o.id = f.orientacao_id AND o.empresa_id = f.empresa_id
    WHERE f.empresa_id = ${empresaId}
      AND f.ativa = TRUE AND f.excluida_em IS NULL
      AND (f.pergunta_normalizada = ${normalizada} OR f.variacoes ? ${normalizada})
      AND (f.resposta_editada = TRUE OR (o.status = 'aprovada' AND o.resposta = f.resposta_fonte))
    ORDER BY f.id DESC LIMIT 1`);
  const row = r.rows[0] as { id: number | string; resposta: string } | undefined;
  return row ? { id: Number(row.id), resposta: row.resposta } : null;
}

export async function registrarUsoFaqAprendida(empresaId: number, faqId: number, inboxMessageId: number): Promise<void> {
  await db.execute(sql`WITH novo AS (
    INSERT INTO telegram_faq_usos (empresa_id, inbox_message_id, faq_id)
    VALUES (${empresaId}, ${inboxMessageId}, ${faqId})
    ON CONFLICT (empresa_id, inbox_message_id) DO NOTHING
    RETURNING inbox_message_id
  )
  UPDATE telegram_faq_aprendidas
    SET usos = usos + 1, economia_ia = economia_ia + 1, atualizada_em = NOW()
    WHERE id = ${faqId} AND empresa_id = ${empresaId} AND ativa = TRUE AND excluida_em IS NULL
      AND EXISTS (SELECT 1 FROM novo)`);
}

function temDadoPessoal(texto: string): boolean {
  return PII.some((pattern) => pattern.test(texto));
}

async function padronizarPergunta(exemplos: string[], empresaId: number, messageId: number, orientationId: number): Promise<string | null> {
  const guard = requireAiTenant(empresaId, "agent");
  const content = `Padronize as perguntas repetidas abaixo em uma única pergunta curta e neutra, sem responder. Use somente o assunto comum que aparece nos exemplos. Responda somente JSON: {"pergunta":"..."}. Exemplos: ${JSON.stringify(exemplos)}`;
  const chave = `telegram-aprendiz:${messageId}:${orientationId}`;
  let chamadaIniciada = false;
  try {
    chamadaIniciada = true;
    const result = await anthropic.messages.create(
      { model: MODELO_APRENDIZ, max_tokens: 100, messages: [{ role: "user", content }] },
      { headers: guard.headers },
    );
    await registrarCustoProvedor({
      empresaId,
      chave,
      etapa: "telegram_aprendizado",
      provedor: "anthropic",
      modelo: MODELO_APRENDIZ,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    });
    const raw = result.content.filter((block) => block.type === "text").map((block) => block.text).join("");
    const json = /\{[\s\S]*\}/.exec(raw)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json) as { pergunta?: unknown };
    if (typeof parsed.pergunta !== "string") return null;
    const pergunta = parsed.pergunta.trim().replace(/\s+/g, " ");
    if (!pergunta.endsWith("?") || pergunta.length < 10 || pergunta.length > 120 ||
        !perguntaSeguraParaAprender(pergunta, "apresentacao", "clinica") || !respostaSegura(pergunta)) return null;
    if (!exemplos.some((exemplo) => similaridadePerguntas(pergunta, exemplo) >= SIMILARIDADE_MINIMA)) return null;
    return pergunta;
  } catch (error) {
    if (chamadaIniciada) await registrarCustoProvedor({
      empresaId, chave, etapa: "telegram_aprendizado", provedor: "anthropic", modelo: MODELO_APRENDIZ,
    });
    logger.warn({ empresaId, errorType: error instanceof Error ? error.constructor.name : typeof error }, "[telegram-aprendiz] pergunta não foi padronizada; sem publicação");
    return null;
  }
}

/** Só aprende depois de resposta aprovada entregue; chamadas repetidas da mesma mensagem são ignoradas. */
export async function observarRespostaAprovada(p: {
  empresaId: number;
  inboxMessageId: number;
  textoPergunta: string;
  orientacaoId: number;
}): Promise<boolean> {
  const source = await db.execute(sql`
    SELECT tema, resposta, categoria, subcategoria
    FROM orientacoes_aprovadas
    WHERE id = ${p.orientacaoId} AND empresa_id = ${p.empresaId} AND status = 'aprovada'`);
  const orientation = source.rows[0] as { tema: string; resposta: string; categoria: string | null; subcategoria: string | null } | undefined;
  if (!orientation || !respostaSegura(orientation.resposta) ||
      !perguntaSeguraParaAprender(p.textoPergunta, orientation.categoria, orientation.subcategoria) ||
      temDadoPessoal(p.textoPergunta)) return false;

  const perguntaNormalizada = normalizarPerguntaAprendida(p.textoPergunta);
  const inserted = await db.execute(sql`
    INSERT INTO telegram_faq_observacoes (empresa_id, inbox_message_id, orientacao_id, pergunta, pergunta_normalizada)
    VALUES (${p.empresaId}, ${p.inboxMessageId}, ${p.orientacaoId}, ${p.textoPergunta.trim()}, ${perguntaNormalizada})
    ON CONFLICT (empresa_id, inbox_message_id) DO NOTHING
    RETURNING id`);
  if (!inserted.rows.length) return false;

  const related = await db.execute(sql`
    SELECT pergunta, pergunta_normalizada FROM telegram_faq_observacoes
    WHERE empresa_id = ${p.empresaId} AND orientacao_id = ${p.orientacaoId}
      AND observada_em > NOW() - INTERVAL '60 days'
    ORDER BY observada_em DESC LIMIT 40`);
  const relatedRows = related.rows as Array<{ pergunta: string; pergunta_normalizada: string }>;
  // Usa a observação mais antiga do recorte como âncora para não perder um grupo por pequenas variações entre as mensagens mais recentes.
  const ancora = relatedRows[relatedRows.length - 1]?.pergunta_normalizada ?? perguntaNormalizada;
  const cluster = relatedRows.filter((row) => similaridadePerguntas(ancora, row.pergunta_normalizada) >= SIMILARIDADE_MINIMA);
  const unique = [...new Map(cluster.map((row) => [row.pergunta_normalizada, row])).values()];
  if (unique.length < LIMIAR_APRENDIZAGEM) return false;
  const examples = unique.slice(0, 5).map((row) => row.pergunta);
  const canonical = await padronizarPergunta(examples, p.empresaId, p.inboxMessageId, p.orientacaoId);
  if (!canonical) return true;
  const canonicalNorm = normalizarPerguntaAprendida(canonical);
  const variants = [...new Set(unique.map((row) => row.pergunta_normalizada))];
  const keyHash = createHash("sha256").update(canonicalNorm).digest("hex").slice(0, 20);

  await db.execute(sql`
    WITH nova AS (
      INSERT INTO telegram_faq_aprendidas
      (empresa_id, pergunta, pergunta_normalizada, variacoes, resposta, resposta_fonte, orientacao_id)
      SELECT ${p.empresaId}, ${canonical}, ${canonicalNorm}, ${JSON.stringify(variants)}::jsonb,
        o.resposta, o.resposta, o.id
      FROM orientacoes_aprovadas o
      WHERE o.id = ${p.orientacaoId} AND o.empresa_id = ${p.empresaId} AND o.status = 'aprovada'
        AND o.resposta = ${orientation.resposta}
      ON CONFLICT (empresa_id, pergunta_normalizada) DO NOTHING
      RETURNING id, empresa_id, pergunta, variacoes, resposta, ativa
    )
    INSERT INTO telegram_faq_versoes (faq_id, empresa_id, pergunta, variacoes, resposta, ativa, alterada_por)
    SELECT id, empresa_id, pergunta, variacoes, resposta, ativa, 'aprendida_pela_ia' FROM nova`);
  logger.info({ empresaId: p.empresaId, orientationId: p.orientacaoId, questionHash: keyHash }, "[telegram-aprendiz] pergunta segura entrou no cardápio");
  return true;
}

export async function listarFaqAprendidas(empresaId: number) {
  const r = await db.execute(sql`
    SELECT f.id, f.pergunta, f.variacoes, f.resposta, f.ativa, f.usos, f.economia_ia AS "economiaIa",
      f.resposta_editada AS "respostaEditada", f.orientacao_id AS "orientacaoId",
      (o.status = 'aprovada' AND o.resposta = f.resposta_fonte) AS "fonteVigente",
      f.criada_em AS "criadaEm", f.atualizada_em AS "atualizadaEm"
    FROM telegram_faq_aprendidas f
    JOIN orientacoes_aprovadas o ON o.id = f.orientacao_id AND o.empresa_id = f.empresa_id
    WHERE f.empresa_id = ${empresaId} AND f.excluida_em IS NULL
    ORDER BY f.ativa DESC, f.usos DESC, f.id DESC`);
  return r.rows;
}

export async function editarFaqAprendida(p: {
  empresaId: number; id: number; pergunta: string; variacoes: string[]; resposta: string; por: string;
}): Promise<boolean> {
  const question = p.pergunta.trim().replace(/\s+/g, " ");
  const answer = p.resposta.trim();
  const variations = [...new Set(p.variacoes.map((v) => v.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 20);
  if (question.length < 10 || question.length > 120 || !question.endsWith("?") ||
      !respostaSegura(answer) || TERMOS_IDENTIDADE.test(answer) ||
      !perguntaSeguraParaAprender(question, "apresentacao", "clinica") ||
      variations.some((v) => !perguntaSeguraParaAprender(v, "apresentacao", "clinica"))) {
    throw new Error("A pergunta ou a resposta não passou pelos limites de segurança do cardápio.");
  }
  const update = await db.execute(sql`
    WITH atual AS (
      SELECT id, empresa_id, pergunta, variacoes, resposta, ativa
      FROM telegram_faq_aprendidas WHERE id = ${p.id} AND empresa_id = ${p.empresaId} AND excluida_em IS NULL
    ), historico AS (
      INSERT INTO telegram_faq_versoes (faq_id, empresa_id, pergunta, variacoes, resposta, ativa, alterada_por)
      SELECT id, empresa_id, pergunta, variacoes, resposta, ativa, ${p.por} FROM atual
    )
    UPDATE telegram_faq_aprendidas
    SET pergunta = ${question}, pergunta_normalizada = ${normalizarPerguntaAprendida(question)},
        variacoes = ${JSON.stringify(variations.map(normalizarPerguntaAprendida))}::jsonb,
        resposta = ${answer}, resposta_editada = TRUE, atualizada_em = NOW()
    WHERE id = ${p.id} AND empresa_id = ${p.empresaId} AND excluida_em IS NULL
    RETURNING id`);
  return update.rows.length > 0;
}

export async function alterarEstadoFaqAprendida(p: { empresaId: number; id: number; ativa?: boolean; remover?: boolean; por: string }): Promise<boolean> {
  const r = await db.execute(sql`
    WITH atual AS (
      SELECT id, empresa_id, pergunta, variacoes, resposta, ativa
      FROM telegram_faq_aprendidas WHERE id = ${p.id} AND empresa_id = ${p.empresaId} AND excluida_em IS NULL
    ), historico AS (
      INSERT INTO telegram_faq_versoes (faq_id, empresa_id, pergunta, variacoes, resposta, ativa, alterada_por)
      SELECT id, empresa_id, pergunta, variacoes, resposta, ativa, ${p.por} FROM atual
    )
    UPDATE telegram_faq_aprendidas
    SET ativa = CASE WHEN ${p.remover === true} THEN FALSE ELSE ${p.ativa ?? true} END,
        excluida_em = CASE WHEN ${p.remover === true} THEN NOW() ELSE excluida_em END,
        atualizada_em = NOW()
    WHERE id = ${p.id} AND empresa_id = ${p.empresaId} AND excluida_em IS NULL
    RETURNING id`);
  return r.rows.length > 0;
}

export async function listarVersoesFaqAprendida(empresaId: number, faqId: number) {
  const r = await db.execute(sql`
    SELECT id, pergunta, variacoes, resposta, ativa, alterada_por AS "alteradaPor", criada_em AS "criadaEm"
    FROM telegram_faq_versoes WHERE faq_id = ${faqId} AND empresa_id = ${empresaId}
    ORDER BY id DESC`);
  return r.rows;
}

export async function registrarResolucaoTelegram(p: {
  empresaId: number; inboxMessageId: number; caminho: "cardapio" | "regra" | "interprete" | "conferente" | "documento" | "equipe" | "agendamento";
  interpreteChamado?: boolean; conferenteChamado?: boolean; aprendizChamado?: boolean;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO telegram_ia_resolucoes
      (empresa_id, inbox_message_id, caminho, interprete_chamado, conferente_chamado, aprendiz_chamado)
    VALUES (${p.empresaId}, ${p.inboxMessageId}, ${p.caminho}, ${p.interpreteChamado === true},
      ${p.conferenteChamado === true}, ${p.aprendizChamado === true})
    ON CONFLICT (empresa_id, inbox_message_id) DO NOTHING`);
}

export async function painelUsoTelegramAprendiz() {
  await garantirTabelasCredito();
  const r = await db.execute(sql`
    WITH uso AS (
      SELECT empresa_id, caminho, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE interprete_chamado)::int AS interprete,
        COUNT(*) FILTER (WHERE conferente_chamado)::int AS conferente,
        COUNT(*) FILTER (WHERE aprendiz_chamado)::int AS aprendiz
      FROM telegram_ia_resolucoes
      WHERE criada_em > NOW() - INTERVAL '30 days'
      GROUP BY empresa_id, caminho
    ), custo_moeda AS (
      SELECT empresa_id, moeda, COUNT(*)::int AS chamadas,
        COALESCE(SUM(input_tokens), 0)::bigint AS tokens_entrada,
        COALESCE(SUM(output_tokens), 0)::bigint AS tokens_saida,
        SUM(custo_informado)::numeric AS custo_informado
      FROM msg_custos_provedor
      WHERE etapa IN ('telegram_interprete','telegram_conferente','telegram_aprendizado')
        AND criado_em > NOW() - INTERVAL '30 days'
      GROUP BY empresa_id, moeda
    ), custo AS (
      SELECT empresa_id, SUM(chamadas)::int AS chamadas,
        SUM(tokens_entrada)::bigint AS tokens_entrada, SUM(tokens_saida)::bigint AS tokens_saida,
        jsonb_agg(jsonb_build_object('moeda', moeda, 'custoInformado', custo_informado)) AS custos_por_moeda
      FROM custo_moeda
      GROUP BY empresa_id
    ), faq AS (
      SELECT empresa_id, COALESCE(SUM(usos), 0)::bigint AS usos_faq,
        COALESCE(SUM(economia_ia), 0)::bigint AS consultas_ia_evitadas
      FROM telegram_faq_aprendidas
      WHERE excluida_em IS NULL
      GROUP BY empresa_id
    )
    SELECT e.id AS "empresaId", e.nome AS clinica,
      COALESCE(json_agg(json_build_object('caminho', u.caminho, 'total', u.total, 'interprete', u.interprete,
        'conferente', u.conferente, 'aprendiz', u.aprendiz)) FILTER (WHERE u.empresa_id IS NOT NULL), '[]'::json) AS resolucoes,
      COALESCE(c.chamadas, 0)::int AS chamadas_ia,
      COALESCE(c.tokens_entrada, 0)::bigint AS tokens_entrada,
      COALESCE(c.tokens_saida, 0)::bigint AS tokens_saida,
      COALESCE(c.custos_por_moeda, '[]'::jsonb) AS custos_por_moeda,
      COALESCE(f.usos_faq, 0)::bigint AS usos_faq,
      COALESCE(f.consultas_ia_evitadas, 0)::bigint AS consultas_ia_evitadas
    FROM empresas e
    LEFT JOIN uso u ON u.empresa_id = e.id
    LEFT JOIN custo c ON c.empresa_id = e.id
    LEFT JOIN faq f ON f.empresa_id = e.id
      WHERE e.ativa = TRUE AND (u.total IS NOT NULL OR c.chamadas IS NOT NULL OR f.usos_faq IS NOT NULL)
    GROUP BY e.id, e.nome, c.chamadas, c.tokens_entrada, c.tokens_saida, c.custos_por_moeda, f.usos_faq, f.consultas_ia_evitadas
    ORDER BY e.nome`);
  return r.rows;
}
