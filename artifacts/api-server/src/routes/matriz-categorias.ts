import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { acesso } from "./fornecedores";

/** Cadastro de categorias de substância (nome, sigla, cor). A chave é a classe já gravada em substances.category, sem acento e em maiúsculas. */
const router = Router();

const SEMENTE: [string, string, string, string][] = [
  ["ANTIOXIDANTE", "Antioxidante", "Atx", "#2f7d6b"], ["HORMONIO", "Hormônio", "Horm", "#8a4fb0"],
  ["VITAMINA", "Vitamina", "Vita", "#c9962b"], ["VITAMINICO", "Vitamínico", "Vita", "#c9962b"],
  ["ORTOMOLECULAR", "Ortomolecular", "Orto", "#2d73b5"], ["METABOLICO", "Metabólico", "Meta", "#c4572f"],
  ["DERMATOLOGICO", "Dermatológico", "Derm", "#b0507a"], ["NEUROCOGNITIVO", "Neurocognitivo", "Neuro", "#5b4fb0"],
  ["NEURO", "Neuro", "Neuro", "#5b4fb0"], ["OSTEOARTICULAR", "Osteoarticular", "Oste", "#6d7a8f"],
  ["IMUNOLOGICO", "Imunológico", "Imun", "#3a8fa0"], ["MITOCONDRIAL", "Mitocondrial", "Mito", "#a0702f"],
  ["MINERAL", "Mineral", "Min", "#4f7aa0"], ["IMPLANTE", "Implante", "Impl", "#16284a"], ["GERAL", "Geral", "Ger", "#6d7a8f"],
  ["LIPOLITICO", "Lipolítico", "Lipo", "#c4503f"], ["HEPATICO", "Hepático", "Hepa", "#7a6a2f"], ["INFLAMATORIO", "Inflamatório", "Infl", "#b04f4f"],
];
let pronto: Promise<void> | null = null;
function garantir(): Promise<void> {
  pronto ??= (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS matriz_categorias (
      id serial PRIMARY KEY, chave text NOT NULL UNIQUE, nome text NOT NULL, sigla text NOT NULL, cor text NOT NULL,
      ativo boolean NOT NULL DEFAULT true, criado_em timestamptz NOT NULL DEFAULT now())`);
    for (const [k, n, s, c] of SEMENTE)
      await pool.query(`INSERT INTO matriz_categorias (chave,nome,sigla,cor) VALUES ($1,$2,$3,$4) ON CONFLICT (chave) DO NOTHING`, [k, n, s, c]);
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}
const chaveDe = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
const corOk = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
const siglaOk = (s: unknown): s is string => typeof s === "string" && s.trim().length >= 2 && s.trim().length <= 5;

async function listar(res: Response) { const { rows } = await pool.query(`SELECT id, chave, nome, sigla, cor, ativo FROM matriz_categorias ORDER BY nome`); res.json(rows); }

router.get("/matriz-fornecedores/categorias", requireCollaborator, acesso, async (_req: Request, res: Response) => { await garantir(); await listar(res); });

router.post("/matriz-fornecedores/categorias", requireCollaborator, acesso, async (req: Request, res: Response) => {
  await garantir();
  const { nome, sigla, cor } = req.body ?? {};
  if (typeof nome !== "string" || !nome.trim()) { res.status(400).json({ error: "Informe o nome da categoria." }); return; }
  if (!siglaOk(sigla)) { res.status(400).json({ error: "A sigla precisa ter de 2 a 5 letras." }); return; }
  if (!corOk(cor)) { res.status(400).json({ error: "Escolha uma cor válida." }); return; }
  const r = await pool.query(`INSERT INTO matriz_categorias (chave,nome,sigla,cor) VALUES ($1,$2,$3,$4) ON CONFLICT (chave) DO NOTHING RETURNING id`, [chaveDe(nome), nome.trim(), sigla.trim(), cor]);
  if (!r.rowCount) { res.status(409).json({ error: "Já existe uma categoria com esse nome." }); return; }
  await listar(res);
});

router.patch("/matriz-fornecedores/categorias/:id", requireCollaborator, acesso, async (req: Request, res: Response) => {
  await garantir();
  const id = Number(req.params.id);
  const { nome, sigla, cor, ativo } = req.body ?? {};
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Categoria inválida." }); return; }
  if (nome !== undefined && (typeof nome !== "string" || !nome.trim())) { res.status(400).json({ error: "Nome inválido." }); return; }
  if (sigla !== undefined && !siglaOk(sigla)) { res.status(400).json({ error: "A sigla precisa ter de 2 a 5 letras." }); return; }
  if (cor !== undefined && !corOk(cor)) { res.status(400).json({ error: "Cor inválida." }); return; }
  const r = await pool.query(`UPDATE matriz_categorias SET nome=COALESCE($2,nome), sigla=COALESCE($3,sigla), cor=COALESCE($4,cor), ativo=COALESCE($5,ativo) WHERE id=$1 RETURNING id`,
    [id, nome?.trim() ?? null, sigla?.trim() ?? null, cor ?? null, typeof ativo === "boolean" ? ativo : null]);
  if (!r.rowCount) { res.status(404).json({ error: "Categoria não encontrada." }); return; }
  await listar(res);
});

export default router;
