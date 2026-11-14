/**
 * Crédito pré-pago da mensageria. Clínica: vê só o próprio saldo (empresa vem da sessão, nunca do corpo).
 * Administração (tarifas, isenção, estorno, recarga de teste): somente instância do CEO.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { requireCeoInstance } from "../middleware/tenantContext";
import {
  visaoCredito, solicitarRecarga, confirmarRecarga, definirTarifa, definirIsencao, estornarConsumo,
  garantirTabelasCredito, TIPOS_EVENTO, type TipoEvento,
} from "../lib/mensageria-credito";

const router = Router();
const MODELOS_CONECTADOS: Record<string, string[]> = { anthropic: ["claude-sonnet-4-6"] };

function empresaDaSessao(req: Request): number | null {
  const c = req.tenantContext;
  return c?.authenticated && Number.isSafeInteger(c.empresaId) ? c.empresaId : null;
}
const inteiro = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);

// ── Clínica ─────────────────────────────────────────────────────────────────
router.get("/mensageria/credito", requireCollaborator, async (req: Request, res: Response) => {
  const empresaId = empresaDaSessao(req);
  if (!empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  res.json(await visaoCredito(empresaId));
});

router.post("/mensageria/credito/recargas", requireCollaborator, async (req: Request, res: Response) => {
  const empresaId = empresaDaSessao(req);
  const valor = inteiro(req.body?.valorCentavos);
  if (!empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  if (!valor || valor <= 0) { res.status(400).json({ error: "Informe o valor da recarga em centavos." }); return; }
  const r = await solicitarRecarga(empresaId, valor, `profissional:${req.tenantContext.professionalId ?? "?"}`, "real");
  // Honesto: solicitar não credita. O saldo só sobe quando o pagamento for confirmado.
  res.status(201).json({ id: r.id, status: "solicitada", creditado: false });
});

router.get("/mensageria/ia", requireCollaborator, async (req: Request, res: Response) => {
  const empresaId = empresaDaSessao(req);
  if (!empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  await garantirTabelasCredito();
  const cfg = await pool.query(`SELECT etapa, provedor, modelo, orientacoes FROM msg_config_ia WHERE empresa_id = $1`, [empresaId]);
  const conectado = Boolean(process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] && process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"]);
  res.json({
    etapas: [
      { etapa: "visitante", descricao: "Conversa com quem ainda não é cliente", usaIA: false, nota: "Regras fixas do sistema, sem modelo de IA." },
      { etapa: "agendamento", descricao: "Condução do pedido de agendamento", usaIA: false, nota: "Regras fixas do sistema, sem modelo de IA." },
      { etapa: "escolha_de_orientacao", descricao: "Escolhe qual orientação aprovada responde ao cliente (nunca redige)", usaIA: true,
        provedor: "anthropic", modeloPadrao: "claude-sonnet-4-6", conectado,
        configurado: cfg.rows.find((c) => c.etapa === "escolha_de_orientacao") ?? null },
    ],
    modelosDisponiveis: MODELOS_CONECTADOS,
    observacao: "Só aparecem como disponíveis os provedores realmente conectados neste ambiente. Atendimento humano continua sendo a saída quando não há orientação aprovada.",
  });
});

router.put("/mensageria/ia/:etapa", requireCollaborator, async (req: Request, res: Response) => {
  const empresaId = empresaDaSessao(req);
  if (!empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  const etapa = String(req.params.etapa);
  const { provedor, modelo, orientacoes } = req.body ?? {};
  if (etapa !== "escolha_de_orientacao") { res.status(400).json({ error: "Esta etapa não usa modelo de IA." }); return; }
  if (!MODELOS_CONECTADOS[provedor]?.includes(modelo)) { res.status(400).json({ error: "Modelo não está conectado neste ambiente." }); return; }
  await garantirTabelasCredito();
  await pool.query(
    `INSERT INTO msg_config_ia (empresa_id, etapa, provedor, modelo, orientacoes, atualizado_por) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (empresa_id, etapa) DO UPDATE SET provedor=$3, modelo=$4, orientacoes=$5, atualizado_por=$6, atualizado_em=NOW()`,
    [empresaId, etapa, provedor, modelo, typeof orientacoes === "string" ? orientacoes.slice(0, 2000) : null, `profissional:${req.tenantContext.professionalId ?? "?"}`]);
  res.json({ ok: true });
});

// ── Administração (CEO) ─────────────────────────────────────────────────────
router.get("/mensageria/admin/carteiras/:empresaId", requireCeoInstance, async (req: Request, res: Response) => {
  const id = Number(req.params.empresaId);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Empresa inválida." }); return; }
  res.json(await visaoCredito(id));
});

router.put("/mensageria/admin/tarifas", requireCeoInstance, async (req: Request, res: Response) => {
  const { empresaId, tipo, valorCentavos, ativo, unidade, criterio } = req.body ?? {};
  try {
    await definirTarifa({
      empresaId: empresaId === null || empresaId === undefined ? null : Number(empresaId),
      tipo: tipo as TipoEvento, valorCentavos: Number(valorCentavos), ativo: ativo === true, unidade, criterio, por: "ceo",
    });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

router.put("/mensageria/admin/isencao/:empresaId", requireCeoInstance, async (req: Request, res: Response) => {
  try {
    await definirIsencao(Number(req.params.empresaId), req.body?.isento === true, String(req.body?.motivo ?? ""), "ceo");
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

router.post("/mensageria/admin/estornos", requireCeoInstance, async (req: Request, res: Response) => {
  const r = await estornarConsumo(Number(req.body?.empresaId), Number(req.body?.extratoId), String(req.body?.motivo ?? ""), "ceo");
  res.status(r.ok ? 200 : 409).json(r);
});

/** Pagamento de teste: proibido em produção; só afeta recargas criadas como "teste". */
router.post("/mensageria/admin/recargas-teste", requireCeoInstance, async (req: Request, res: Response) => {
  if (process.env["NODE_ENV"] === "production") { res.status(403).json({ error: "Indisponível em produção." }); return; }
  const r = await solicitarRecarga(Number(req.body?.empresaId), Number(req.body?.valorCentavos), "ceo", "teste");
  res.status(201).json(r);
});
router.post("/mensageria/admin/recargas-teste/:id/confirmar", requireCeoInstance, async (req: Request, res: Response) => {
  if (process.env["NODE_ENV"] === "production") { res.status(403).json({ error: "Indisponível em produção." }); return; }
  const r = await confirmarRecarga(Number(req.params.id), "teste");
  res.status(r.ok ? 200 : 409).json(r);
});

export { TIPOS_EVENTO };
export default router;
