import express, { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireCollaborator } from "./collaborator.js";
import { requireMessageClinic } from "../middleware/messageClinic.js";
import { requireCeoInstance, requirePlatformOwner } from "../middleware/tenantContext.js";
import {
  CATEGORIAS, VARIAVEIS_GLOBAIS, FLYER_VERSAO, ehCategoria, validarModelo, modeloTexto, carregarRegras, decidirFlyer,
  gravarModeloClinica, gravarRegraClinica, gravarRegraAnexoClinica, decidirAnexo, listarAnexos, gravarAnexo, removerAnexo, ANEXO_MAX_BYTES, prepararTabelas, enviarComunicacao, ErroComunicacao, type Categoria,
} from "../lib/comunicacao-padrao.js";

// Modelos de texto e regras de flyer por clinica (a clinica vem da sessao autenticada, nunca do navegador).
const router: IRouter = Router();

router.get("/comunicacao/modelos", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const empresaId = req.messageEmpresaId!;
  await prepararTabelas();
  const regras = await carregarRegras(empresaId);
  const itens = [];
  for (const [cat, d] of Object.entries(CATEGORIAS) as Array<[Categoria, (typeof CATEGORIAS)[Categoria]]>) {
    const m = await modeloTexto(empresaId, cat);
    itens.push({
      categoria: cat, nome: d.nome, texto: m.texto, versao: m.versao, origem: m.origem, padrao: d.texto,
      variaveis: [...d.variaveis, ...VARIAVEIS_GLOBAIS],
      anexo: { enviar: decidirAnexo(regras, empresaId, cat), arquivos: await listarAnexos(empresaId, cat), maxBytes: ANEXO_MAX_BYTES },
      flyer: { enviar: decidirFlyer(regras, empresaId, cat), modeloVersao: FLYER_VERSAO, titulo: d.flyer.titulo, linhas: d.flyer.linhas.map((l) => l.rotulo) },
    });
  }
  const envios = (await db.execute(sql`SELECT id, ambiente, categoria, modelo_texto_versao, modelo_flyer_versao, flyer_enviado, status, status_flyer, anexos_enviados, status_anexo, erro, criado_em, campos
    FROM comunicacao_envio WHERE empresa_id=${empresaId} ORDER BY id DESC LIMIT 20`)).rows;
  res.setHeader("Cache-Control", "no-store");
  res.json({ itens, envios });
});

router.put("/comunicacao/modelos/:categoria", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const cat = req.params.categoria;
  if (!ehCategoria(cat)) { res.status(404).json({ error: "categoria desconhecida" }); return; }
  const erro = validarModelo(cat, req.body?.texto);
  if (erro) { res.status(400).json({ error: erro }); return; }
  const versao = await gravarModeloClinica(req.messageEmpresaId!, cat, req.body.texto as string, req.collaborator?.professionalId ?? null);
  res.json({ ok: true, versao });
});

router.put("/comunicacao/regras/:categoria", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const cat = req.params.categoria;
  if (!ehCategoria(cat)) { res.status(404).json({ error: "categoria desconhecida" }); return; }
  const { enviarFlyer, enviarAnexo } = req.body ?? {};
  if (enviarFlyer === undefined && enviarAnexo === undefined) { res.status(400).json({ error: "informe enviarFlyer ou enviarAnexo" }); return; }
  if ((enviarFlyer !== undefined && typeof enviarFlyer !== "boolean") || (enviarAnexo !== undefined && typeof enviarAnexo !== "boolean")) {
    res.status(400).json({ error: "os valores devem ser verdadeiro ou falso" }); return;
  }
  const por = req.collaborator?.professionalId ?? null;
  if (typeof enviarFlyer === "boolean") await gravarRegraClinica(req.messageEmpresaId!, cat, enviarFlyer, por);
  if (typeof enviarAnexo === "boolean") await gravarRegraAnexoClinica(req.messageEmpresaId!, cat, enviarAnexo, por);
  res.json({ ok: true });
});

// Anexos da categoria (ate 2): o arquivo vai cru no corpo; o nome vai no cabecalho X-Nome-Arquivo (URL-encoded).
router.put("/comunicacao/anexos/:categoria/:posicao", requireCollaborator, requireMessageClinic, requireCeoInstance,
  express.raw({ type: () => true, limit: ANEXO_MAX_BYTES + 1024 }), async (req, res): Promise<void> => {
  const cat = req.params.categoria;
  if (!ehCategoria(cat)) { res.status(404).json({ error: "categoria desconhecida" }); return; }
  const pos = Number(req.params.posicao);
  if (pos !== 1 && pos !== 2) { res.status(400).json({ error: "a posição do anexo é 1 ou 2" }); return; }
  try {
    const nome = decodeURIComponent(String(req.header("x-nome-arquivo") ?? "")).trim();
    const meta = await gravarAnexo(req.messageEmpresaId!, cat, pos, nome, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.collaborator?.professionalId ?? null);
    res.json({ ok: true, anexo: meta });
  } catch (e) {
    if (e instanceof ErroComunicacao) { res.status(422).json({ error: e.message }); return; }
    req.log.error({ err: String(e) }, "Falha ao gravar anexo da comunicação");
    res.status(500).json({ error: "Erro interno." });
  }
});

router.delete("/comunicacao/anexos/:categoria/:posicao", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const cat = req.params.categoria; const pos = Number(req.params.posicao);
  if (!ehCategoria(cat)) { res.status(404).json({ error: "categoria desconhecida" }); return; }
  if (pos !== 1 && pos !== 2) { res.status(400).json({ error: "a posição do anexo é 1 ou 2" }); return; }
  await removerAnexo(req.messageEmpresaId!, cat, pos);
  res.json({ ok: true });
});

// Envio de TESTE: so proprietario da plataforma, so participantes autorizados, valor ate o teto de teste.
router.post("/comunicacao/enviar-teste", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  try {
    const b = req.body ?? {};
    if (!ehCategoria(b.categoria)) { res.status(400).json({ error: "categoria desconhecida" }); return; }
    const out = await enviarComunicacao({
      ambiente: "teste", categoria: b.categoria, clienteId: Number(b.clienteId), valorCentavos: b.valorCentavos,
      referencia: b.referencia, link: b.link, documento: b.documento, vencimento: b.vencimento, data: b.data, horario: b.horario,
    });
    res.json(out);
  } catch (e) {
    if (e instanceof ErroComunicacao) { res.status(422).json({ error: e.message }); return; }
    req.log.error({ err: String(e) }, "Falha no envio padronizado");
    res.status(500).json({ error: "Erro interno." });
  }
});

export default router;
