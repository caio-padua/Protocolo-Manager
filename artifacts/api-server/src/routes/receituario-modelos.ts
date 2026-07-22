/**
 * MODELO DE RECEITUÁRIOS — fonte de verdade para configuração visual
 *
 * GET    /api/receituario-modelos            — lista todos os modelos
 * GET    /api/receituario-modelos/ativo      — retorna o modelo ativo
 * POST   /api/receituario-modelos            — cria novo modelo
 * PUT    /api/receituario-modelos/:id        — edita nome e/ou config
 * POST   /api/receituario-modelos/:id/ativar — define como modelo ativo (único)
 * DELETE /api/receituario-modelos/:id        — remove modelo (soft: não remove seed)
 *
 * POST   /api/receituario-modelos/emitir-teste — emite PDF de teste com modelo ativo
 */
import { Router } from "express";
import {
  garantirTabelaModelos,
  listarModelos,
  getModeloAtivo,
  criarModelo,
  atualizarModelo,
  ativarModelo,
  emitirReceituarioPdf,
  type TipoModelo,
} from "../lib/receituario-motor.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ── GET /api/receituario-modelos ─────────────────────────────────────────────
router.get("/receituario-modelos", async (_req, res): Promise<void> => {
  try {
    await garantirTabelaModelos();
    const modelos = await listarModelos();
    res.json({ modelos });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/receituario-modelos/ativo ───────────────────────────────────────
router.get("/receituario-modelos/ativo", async (_req, res): Promise<void> => {
  try {
    const modelo = await getModeloAtivo();
    res.json({ modelo });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/receituario-modelos ────────────────────────────────────────────
router.post("/receituario-modelos", async (req, res): Promise<void> => {
  try {
    const { nome, tipo, config } = req.body ?? {};
    if (!nome?.trim()) {
      res.status(400).json({ error: "nome é obrigatório" });
      return;
    }
    const tipoValido: TipoModelo = tipo === "classico_anvisa" ? "classico_anvisa" : "faixas_paxter";
    const modelo = await criarModelo(nome.trim(), tipoValido, config ?? {});
    res.status(201).json({ modelo });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── PUT /api/receituario-modelos/:id ─────────────────────────────────────────
router.put("/receituario-modelos/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nome, config } = req.body ?? {};
    if (!nome && config === undefined) {
      res.status(400).json({ error: "Forneça nome e/ou config para atualizar" });
      return;
    }
    await atualizarModelo(id, {
      nome: nome?.trim(),
      config: config !== undefined ? config : undefined,
    });
    const modelos = await listarModelos();
    const modelo = modelos.find(m => m.id === id) ?? null;
    res.json({ modelo });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/receituario-modelos/:id/ativar ─────────────────────────────────
router.post("/receituario-modelos/:id/ativar", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    await ativarModelo(id);
    const modelo = await getModeloAtivo();
    res.json({ ok: true, modelo });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── DELETE /api/receituario-modelos/:id ──────────────────────────────────────
router.delete("/receituario-modelos/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id <= 2) {
      res.status(400).json({ error: "Os modelos padrão (Faixas Paxter e Clássico ANVISA) não podem ser excluídos" });
      return;
    }
    await db.execute(sql`DELETE FROM receituario_modelos WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/receituario-modelos/emitir-teste ───────────────────────────────
// Emite um PDF de DEMONSTRAÇÃO usando o modelo ativo. Não envia e-mail real.
router.post("/receituario-modelos/emitir-teste", async (req, res): Promise<void> => {
  try {
    const modeloId = req.body?.modeloId ? parseInt(req.body.modeloId, 10) : undefined;

    const result = await emitirReceituarioPdf({
      patient: {
        nome: "DEMONSTRAÇÃO — SEM VALIDADE MÉDICA",
        cpf: "000.000.000-00",
        dataNascimento: "01/01/1990",
      },
      formulas: [
        {
          nome: "Substância Demonstrativa A 150mg — Comprimido",
          ativos: "Substância Demonstrativa A 150mg",
          posologia: "1 comprimido ao dia pela manhã",
          via: "Oral",
        },
        {
          nome: "Substância Demonstrativa B 50mg — Comprimido",
          ativos: "Substância Demonstrativa B 50mg",
          posologia: "1 comprimido à noite",
          via: "Oral",
        },
      ],
      tipoReceita: "especial",
      modeloId,
    });

    res.json({
      ok: true,
      fileName: result.fileName,
      modeloUsado: result.modeloUsado,
      tipoMotor: result.tipoMotor,
      driveUrl: result.driveUrl,
      emailSent: result.emailSent,
      pdfSizeBytes: result.pdf.length,
    });
  } catch (err) {
    req.log.error({ err }, "receituario-modelos/emitir-teste: falhou");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
