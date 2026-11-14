/**
 * Catálogo comercial. CEO: administra tudo. Clínica: vê só o próprio contrato, saldo, extrato e consumo
 * (nunca custo de provedor, margem nem catálogo interno).
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { requireCollaborator } from "./collaborator";
import { requireCeoInstance } from "../middleware/tenantContext";
import {
  lerCatalogo, editarPlano, criarPlano, editarItem, editarTarifa, editarCusto, editarConfig, analiseMargem,
  criarContrato, contratoVigente, contratosDeTodas,
} from "../lib/catalogo-comercial";
import { visaoCredito } from "../lib/mensageria-credito";

const router = Router();
const erro = (res: Response, e: unknown) => res.status(e instanceof RangeError ? 400 : 500).json({ error: e instanceof RangeError ? e.message : "Falha ao processar." });
const por = (req: Request) => `ceo:${req.tenantContext?.professionalId ?? "instancia"}`;

router.get("/catalogo/admin", requireCeoInstance, async (_q, res) => { try { res.json(await lerCatalogo()); } catch (e) { erro(res, e); } });
router.get("/catalogo/admin/margem", requireCeoInstance, async (_q, res) => { try { res.json(await analiseMargem()); } catch (e) { erro(res, e); } });
router.get("/catalogo/admin/contratos", requireCeoInstance, async (_q, res) => { try { res.json(await contratosDeTodas()); } catch (e) { erro(res, e); } });
router.post("/catalogo/admin/planos", requireCeoInstance, async (req, res) => { try { res.status(201).json(await criarPlano(req.body ?? {}, por(req))); } catch (e) { erro(res, e); } });
router.put("/catalogo/admin/planos/:codigo", requireCeoInstance, async (req, res) => { try { res.json(await editarPlano(String(req.params.codigo), req.body ?? {}, por(req))); } catch (e) { erro(res, e); } });
router.put("/catalogo/admin/itens/:codigo", requireCeoInstance, async (req, res) => { try { res.json(await editarItem(String(req.params.codigo), req.body ?? {}, por(req))); } catch (e) { erro(res, e); } });
router.put("/catalogo/admin/tarifas/:codigo", requireCeoInstance, async (req, res) => { try { res.json(await editarTarifa(String(req.params.codigo), req.body ?? {}, por(req))); } catch (e) { erro(res, e); } });
router.put("/catalogo/admin/custos/:codigo", requireCeoInstance, async (req, res) => { try { res.json(await editarCusto(String(req.params.codigo), req.body ?? {}, por(req))); } catch (e) { erro(res, e); } });
router.put("/catalogo/admin/config/:chave", requireCeoInstance, async (req, res) => {
  try { await editarConfig(String(req.params.chave), req.body?.valor, por(req)); res.json({ ok: true }); } catch (e) { erro(res, e); }
});
router.post("/catalogo/admin/contratos", requireCeoInstance, async (req, res) => {
  try {
    res.status(201).json(await criarContrato({ empresaId: Number(req.body?.empresaId), planoCodigo: String(req.body?.planoCodigo ?? ""),
      rotulo: String(req.body?.rotulo ?? "Contrato piloto (homologação)"), condicao: req.body?.condicao, por: por(req) }));
  } catch (e) { erro(res, e); }
});

// Visão da clínica: a empresa vem da sessão, nunca do corpo/URL.
router.get("/catalogo/minha-clinica", requireCollaborator, async (req: Request, res: Response) => {
  const c = req.tenantContext;
  if (!c?.authenticated || !Number.isSafeInteger(c.empresaId)) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  try {
    const [contrato, credito] = await Promise.all([contratoVigente(c.empresaId), visaoCredito(c.empresaId)]);
    res.json({
      contrato: contrato && { plano: contrato.plano_snapshot?.nome, ambiente: contrato.ambiente, status: contrato.status, mensalidadeCentavos: Number(contrato.preco_mensal_centavos),
        franquiaTextoCentavos: Number(contrato.franquia_texto_centavos), modulos: contrato.modulos, vigenciaInicio: contrato.vigencia_inicio, renovacao: contrato.renovacao },
      saldoCentavos: credito.saldoCentavos, extrato: credito.extrato, recargas: credito.recargas, tarifas: credito.tarifas,
    });
  } catch (e) { erro(res, e); }
});

export default router;
