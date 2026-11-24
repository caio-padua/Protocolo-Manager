import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

// =============================================================================
// SINAPSES CLINICAS: liga pergunta da Anamnese -> saida clinica.
// ADITIVO: tabela propria; nenhuma tabela existente e alterada.
// "Excluir" = desativar (Regra de Ouro). Escritas ficam sob /cadastros, que ja
// passa pelo portao do colaborador (login obrigatorio + auditoria).
// NAO liga nada ao Cockpit da Consulta: esta tela so cadastra as ligacoes.
// =============================================================================
const router: IRouter = Router();

export const CATEGORIAS_SINAPSE = [
  "EXAME",
  "PRESCRICAO",
  "INJETAVEL_IM",
  "INJETAVEL_SC",
  "INJETAVEL_EV",
  "IMPLANTE",
] as const;
type Categoria = (typeof CATEGORIAS_SINAPSE)[number];

const TIPOS_POR_CATEGORIA: Record<Categoria, string[]> = {
  EXAME: ["exame", "bloco_exames"],
  PRESCRICAO: ["formula"],
  INJETAVEL_IM: ["injetavel"],
  INJETAVEL_SC: ["injetavel"],
  INJETAVEL_EV: ["injetavel"],
  IMPLANTE: ["implante"],
};

let pronta: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronta) {
    pronta = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS sinapses_clinicas (
          id SERIAL PRIMARY KEY,
          pergunta_id TEXT NOT NULL,
          categoria TEXT NOT NULL CHECK (categoria IN ('EXAME','PRESCRICAO','INJETAVEL_IM','INJETAVEL_SC','INJETAVEL_EV','IMPLANTE')),
          destino_tipo TEXT NOT NULL CHECK (destino_tipo IN ('exame','bloco_exames','formula','injetavel','implante')),
          destino_id INTEGER NOT NULL,
          ativo BOOLEAN NOT NULL DEFAULT TRUE,
          clone_de INTEGER,
          criado_por INTEGER,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT sinapses_clinicas_uk UNIQUE (pergunta_id, categoria, destino_tipo, destino_id)
        )`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS sinapses_clinicas_pergunta_idx ON sinapses_clinicas (pergunta_id)`);
    })().catch((e) => {
      pronta = null;
      throw e;
    });
  }
  return pronta;
}

function viasDe(via: string | null): Set<"IM" | "SC" | "EV"> {
  const s = new Set<"IM" | "SC" | "EV">();
  for (const t of (via ?? "").toUpperCase().split("/")) {
    const v = t.trim();
    if (v.startsWith("IM")) s.add("IM");
    else if (v === "SC") s.add("SC");
    else if (v.startsWith("EV")) s.add("EV");
  }
  return s;
}

// Tudo o que a tela precisa, numa leitura so.
router.get("/cadastros/sinapses/painel", async (_req, res): Promise<void> => {
  await garantir();
  const [perguntas, exames, blocos, formulas, injetaveis, implantes, sinapses] = await Promise.all([
    db.execute(sql`SELECT pergunta_id, pergunta, bloco, e_sinal_alarme, ordem, opcoes FROM anamnese_questionario ORDER BY ordem NULLS LAST, id`),
    db.execute(sql`SELECT id, nome_exame, grupo_principal FROM catalogo_exames WHERE ativo IS NOT FALSE ORDER BY nome_exame`),
    db.execute(sql`
      SELECT b.id, b.codigo_bloco, b.nome_bloco,
        (SELECT COUNT(*) FROM catalogo_bloco_exames x WHERE x.bloco_id = b.codigo_bloco AND x.ativo IS NOT FALSE)::int AS total_exames
      FROM catalogo_blocos b WHERE b.ativo IS NOT FALSE ORDER BY b.nome_bloco`),
    db.execute(sql`
      SELECT id, conteudo AS nome, area FROM catalogo_formulas
      WHERE tipo_linha IN ('FORMULA','MASTER') AND identificador = 'TITL' AND status = 'ATIVO' ORDER BY conteudo`),
    db.execute(sql`SELECT id, nome_ampola, via FROM catalogo_injetaveis WHERE tipo_linha = 'AMPOLA' AND ativo IS NOT FALSE ORDER BY nome_ampola`),
    db.execute(sql`SELECT id, nome_implante FROM catalogo_implantes WHERE ativo IS NOT FALSE ORDER BY nome_implante`),
    db.execute(sql`SELECT id, pergunta_id, categoria, destino_tipo, destino_id, clone_de FROM sinapses_clinicas WHERE ativo ORDER BY id`),
  ]);

  const destinos: Record<Categoria, Array<{ tipo: string; id: number; nome: string; detalhe?: string | null; incompleto?: boolean }>> = {
    EXAME: [],
    PRESCRICAO: [],
    INJETAVEL_IM: [],
    INJETAVEL_SC: [],
    INJETAVEL_EV: [],
    IMPLANTE: [],
  };
  for (const b of blocos.rows as any[]) {
    destinos.EXAME.push({ tipo: "bloco_exames", id: b.id, nome: b.nome_bloco ?? b.codigo_bloco, detalhe: `Bloco ${b.codigo_bloco} (${b.total_exames} exames)`, incompleto: b.total_exames === 0 });
  }
  for (const e of exames.rows as any[]) destinos.EXAME.push({ tipo: "exame", id: e.id, nome: e.nome_exame, detalhe: e.grupo_principal });
  for (const f of formulas.rows as any[]) destinos.PRESCRICAO.push({ tipo: "formula", id: f.id, nome: f.nome, detalhe: f.area });
  let injetaveisSemVia = 0;
  for (const i of injetaveis.rows as any[]) {
    const vias = viasDe(i.via);
    if (vias.size === 0) injetaveisSemVia++;
    const item = { tipo: "injetavel", id: i.id, nome: i.nome_ampola as string, detalhe: i.via as string | null };
    if (vias.has("IM")) destinos.INJETAVEL_IM.push(item);
    if (vias.has("SC")) destinos.INJETAVEL_SC.push(item);
    if (vias.has("EV")) destinos.INJETAVEL_EV.push(item);
  }
  for (const m of implantes.rows as any[]) destinos.IMPLANTE.push({ tipo: "implante", id: m.id, nome: m.nome_implante });

  res.json({
    perguntas: (perguntas.rows as any[]).map((p) => ({
      perguntaId: p.pergunta_id,
      pergunta: p.pergunta,
      bloco: p.bloco,
      eSinalAlarme: !!p.e_sinal_alarme,
    })),
    destinos,
    injetaveisSemVia,
    sinapses: (sinapses.rows as any[]).map((s) => ({
      id: s.id,
      perguntaId: s.pergunta_id,
      categoria: s.categoria,
      destinoTipo: s.destino_tipo,
      destinoId: s.destino_id,
      cloneDe: s.clone_de,
    })),
  });
});

const criarSchema = z.object({
  perguntaId: z.string().min(1),
  categoria: z.enum(CATEGORIAS_SINAPSE),
  destinoTipo: z.enum(["exame", "bloco_exames", "formula", "injetavel", "implante"]),
  destinoId: z.number().int().positive(),
});

const TABELA_DESTINO: Record<string, string> = {
  exame: "catalogo_exames",
  bloco_exames: "catalogo_blocos",
  formula: "catalogo_formulas",
  injetavel: "catalogo_injetaveis",
  implante: "catalogo_implantes",
};

async function perguntaExiste(perguntaId: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM anamnese_questionario WHERE pergunta_id = ${perguntaId} LIMIT 1`);
  return r.rows.length > 0;
}
async function destinoExiste(tipo: string, id: number): Promise<boolean> {
  const tabela = TABELA_DESTINO[tipo];
  if (!tabela) return false;
  const r = await db.execute(sql`SELECT 1 FROM ${sql.raw(tabela)} WHERE id = ${id} LIMIT 1`);
  return r.rows.length > 0;
}

// Cria (ou reativa) uma ligacao. Idempotente: repetir nao duplica.
router.post("/cadastros/sinapses", async (req, res): Promise<void> => {
  await garantir();
  const p = criarSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "Dados da ligação inválidos" });
    return;
  }
  const b = p.data;
  if (!TIPOS_POR_CATEGORIA[b.categoria].includes(b.destinoTipo)) {
    res.status(400).json({ error: "Este destino não pertence a esta saída" });
    return;
  }
  if (!(await perguntaExiste(b.perguntaId)) || !(await destinoExiste(b.destinoTipo, b.destinoId))) {
    res.status(404).json({ error: "Pergunta ou destino não encontrado" });
    return;
  }
  const por = req.collaborator?.professionalId ?? null;
  const r = await db.execute(sql`
    INSERT INTO sinapses_clinicas (pergunta_id, categoria, destino_tipo, destino_id, criado_por)
    VALUES (${b.perguntaId}, ${b.categoria}, ${b.destinoTipo}, ${b.destinoId}, ${por})
    ON CONFLICT (pergunta_id, categoria, destino_tipo, destino_id)
    DO UPDATE SET ativo = TRUE, atualizado_em = NOW()
    RETURNING id`);
  res.status(201).json({ id: (r.rows[0] as any).id });
});

// Clona as ligacoes ativas de uma pergunta (ou de ligacoes escolhidas) para outra pergunta.
// As originais nunca sao alteradas.
const clonarSchema = z.object({
  perguntaOrigemId: z.string().min(1).optional(),
  sinapseIds: z.array(z.number().int().positive()).max(500).optional(),
  perguntaDestinoId: z.string().min(1),
});
router.post("/cadastros/sinapses/clonar", async (req, res): Promise<void> => {
  await garantir();
  const p = clonarSchema.safeParse(req.body);
  if (!p.success || (!p.data.perguntaOrigemId && !p.data.sinapseIds?.length)) {
    res.status(400).json({ error: "Informe a pergunta de origem ou as ligações a copiar" });
    return;
  }
  const b = p.data;
  if (!(await perguntaExiste(b.perguntaDestinoId))) {
    res.status(404).json({ error: "Pergunta de destino não encontrada" });
    return;
  }
  const por = req.collaborator?.professionalId ?? null;
  const filtro = b.sinapseIds?.length
    ? sql`id IN (${sql.join(b.sinapseIds.map((i) => sql`${i}`), sql`, `)})`
    : sql`pergunta_id = ${b.perguntaOrigemId}`;
  const r = await db.execute(sql`
    INSERT INTO sinapses_clinicas (pergunta_id, categoria, destino_tipo, destino_id, clone_de, criado_por)
    SELECT DISTINCT ON (categoria, destino_tipo, destino_id)
      ${b.perguntaDestinoId}, categoria, destino_tipo, destino_id, id, ${por}
    FROM sinapses_clinicas WHERE ativo AND ${filtro}
    ORDER BY categoria, destino_tipo, destino_id, id
    ON CONFLICT (pergunta_id, categoria, destino_tipo, destino_id)
    DO UPDATE SET ativo = TRUE, atualizado_em = NOW()
    RETURNING id`);
  res.status(201).json({ copiadas: r.rows.length });
});

// Desativar / reativar (nunca apaga a linha).
router.patch("/cadastros/sinapses/:id/ativo", async (req, res): Promise<void> => {
  await garantir();
  const id = Number(req.params.id);
  const p = z.object({ ativo: z.boolean() }).safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0 || !p.success) {
    res.status(400).json({ error: "Pedido inválido" });
    return;
  }
  const r = await db.execute(sql`UPDATE sinapses_clinicas SET ativo = ${p.data.ativo}, atualizado_em = NOW() WHERE id = ${id} RETURNING id`);
  if (!r.rows.length) {
    res.status(404).json({ error: "Ligação não encontrada" });
    return;
  }
  res.json({ id, ativo: p.data.ativo });
});

export default router;
