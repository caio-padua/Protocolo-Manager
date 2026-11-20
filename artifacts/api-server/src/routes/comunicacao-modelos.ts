import express, { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireCollaborator } from "./collaborator.js";
import { requireMessageClinic } from "../middleware/messageClinic.js";
import { requireCeoInstance, requirePlatformOwner } from "../middleware/tenantContext.js";
import {
  CATEGORIAS, VARIAVEIS_GLOBAIS, FLYER_VERSAO, ehCategoria, validarModelo, modeloTexto, carregarRegras, decidirFlyer,
  gravarModeloClinica, gravarRegraClinica, prepararTabelas, enviarComunicacao, ErroComunicacao, type Categoria,
} from "../lib/comunicacao-padrao.js";
import { ANEXO_MAX_BYTES, MENSAGENS_EXTRAS, ErroAnexo, arquivosDaMensagem, adicionarArquivo, removerArquivo, definirInterruptor } from "../lib/anexos-mensagem.js";

const mensagemValida = (m: unknown): m is string => typeof m === "string" && (ehCategoria(m) || m in MENSAGENS_EXTRAS);

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
      anexo: { arquivos: await arquivosDaMensagem(empresaId, cat), maxBytes: ANEXO_MAX_BYTES },
      flyer: { enviar: decidirFlyer(regras, empresaId, cat), modeloVersao: FLYER_VERSAO, titulo: d.flyer.titulo, linhas: d.flyer.linhas.map((l) => l.rotulo) },
    });
  }
  const envios = (await db.execute(sql`SELECT id, ambiente, categoria, modelo_texto_versao, modelo_flyer_versao, flyer_enviado, status, status_flyer, anexos_enviados, status_anexo, erro, criado_em, campos
    FROM comunicacao_envio WHERE empresa_id=${empresaId} ORDER BY id DESC LIMIT 20`)).rows;
  res.setHeader("Cache-Control", "no-store");
  const extras = [];
  for (const [chave, nome] of Object.entries(MENSAGENS_EXTRAS)) extras.push({ chave, nome, anexo: { arquivos: await arquivosDaMensagem(empresaId, chave), maxBytes: ANEXO_MAX_BYTES } });
  res.json({ itens, extras, envios });
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
  if (typeof req.body?.enviarFlyer !== "boolean") { res.status(400).json({ error: "enviarFlyer deve ser verdadeiro ou falso" }); return; }
  await gravarRegraClinica(req.messageEmpresaId!, cat, req.body.enviarFlyer, req.collaborator?.professionalId ?? null);
  res.json({ ok: true });
});

// Biblioteca de anexos da clinica. O arquivo vai cru no corpo; o nome vai no cabecalho X-Nome-Arquivo (URL-encoded).
// Se "mensagem" vier na consulta, o arquivo ja nasce LIGADO naquela mensagem.
router.post("/comunicacao/anexos", requireCollaborator, requireMessageClinic, requireCeoInstance,
  express.raw({ type: () => true, limit: ANEXO_MAX_BYTES + 1024 }), async (req, res): Promise<void> => {
  try {
    const por = req.collaborator?.professionalId ?? null;
    const mensagem = req.query["mensagem"];
    if (mensagem !== undefined && !mensagemValida(mensagem)) { res.status(404).json({ error: "mensagem desconhecida" }); return; }
    const nome = decodeURIComponent(String(req.header("x-nome-arquivo") ?? "")).trim();
    const arq = await adicionarArquivo(req.messageEmpresaId!, nome, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), por);
    if (typeof mensagem === "string") await definirInterruptor(req.messageEmpresaId!, mensagem, arq.id, true, por);
    res.json({ ok: true, arquivo: arq });
  } catch (e) {
    if (e instanceof ErroAnexo) { res.status(422).json({ error: e.message }); return; }
    req.log.error({ err: String(e) }, "Falha ao gravar anexo da comunicação");
    res.status(500).json({ error: "Erro interno." });
  }
});

router.put("/comunicacao/anexos/:arquivoId/interruptor/:mensagem", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const id = Number(req.params.arquivoId); const mensagem = req.params.mensagem;
  if (!Number.isInteger(id) || id <= 0 || !mensagemValida(mensagem)) { res.status(404).json({ error: "arquivo ou mensagem desconhecidos" }); return; }
  if (typeof req.body?.ativo !== "boolean") { res.status(400).json({ error: "ativo deve ser verdadeiro ou falso" }); return; }
  const ok = await definirInterruptor(req.messageEmpresaId!, mensagem, id, req.body.ativo, req.collaborator?.professionalId ?? null);
  if (!ok) { res.status(404).json({ error: "arquivo não encontrado" }); return; }
  res.json({ ok: true });
});

router.delete("/comunicacao/anexos/:arquivoId", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const id = Number(req.params.arquivoId);
  if (!Number.isInteger(id) || id <= 0) { res.status(404).json({ error: "arquivo desconhecido" }); return; }
  const ok = await removerArquivo(req.messageEmpresaId!, id);
  res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: "arquivo não encontrado" });
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
