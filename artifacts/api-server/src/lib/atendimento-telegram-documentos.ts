import { sql, type SQL } from "drizzle-orm";
import type { EntradaAtendimento, OrientacaoAprovada, PlanoAtendimento, RespostaDocumento } from "./atendimento-telegram";
import { normalizar } from "./atendimento-telegram";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual";
import { listIssuedDocumentsForClient, type IssuedDocumentSummary } from "./clinical-document-share";
import { createReissueRequest } from "./clinical-document-reissue-policy";
import { createHash } from "node:crypto";
import { carregarFrases } from "./telegram-frases";
import { resolverIdentidadeWhatsapp } from "./evolution-client-identity";
import { selectClinicalDocuments } from "./clinical-document-selection";

interface ExecutorDocumentos {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
}

interface OrientacaoComCategoria extends OrientacaoAprovada {
  categoria: string | null;
  subcategoria: string | null;
}

interface ReceitaEmitida {
  id: number;
  prescriptionId: number;
  title: string | null;
}

const SIM_EXATO = new Set(["sim", "sim por favor", "pode", "pode enviar", "pode reenviar", "quero", "quero a segunda via", "quero segunda via", "confirmo"]);
const NAO_EXATO = new Set(["nao", "nao precisa", "nao quero", "deixa", "cancela", "cancelar"]);
const PEDIDO_REENVIO = /\b(segunda via|reenviar|reenvia|reenviem|reenvio|enviar novamente|mandar novamente|copia da receita|copia do receituario)\b|\b(?:envia|envie|enviar|manda|mande|mandar|receber|baixar)\b.*\b(?:receitas?|receituario|prescricao|pedido de exames|protocolo|atestado|encaminhamento|carta de tratamento|documento)\b/;
const PEDIDO_EXPLICACAO = /\b(explica|explicar|explique|entender|para que serve|serve para|o que faz|funcao|me fale sobre)\b/;
const PERGUNTA_NOMES = /\b(quais|nomes|nome|itens|conteudo|contem|tenho|receita mais recente|ultimo receituario)\b/;
const PERGUNTA_FORMULA = /\b(receita|receituario|prescricao|formula|formulas)\b/;
const PERGUNTA_PROTOCOLO = /\b(protocolo|protocolos)\b/;

function normalizarIdentidade(texto: string): string {
  return normalizar(texto).replace(/\s+/g, " ").trim();
}

function normalizarTitulo(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function mencionarNome(texto: string, nome: string): boolean {
  const mensagem = ` ${normalizarIdentidade(texto)} `;
  const alvo = ` ${normalizarIdentidade(nome)} `;
  return alvo.trim().length > 0 && mensagem.includes(alvo);
}

function handoff(motivo: string, texto?: string): RespostaDocumento {
  return { tipo: "encaminhar", motivo, ...(texto ? { texto } : {}) };
}

function resposta(
  texto: string,
  desfecho: "orientacao_enviada" | "clarificacao_documento" |
    "reenvio_receita_ofertado" | "reenvio_receita_confirmado" | "reenvio_receita_cancelado" |
    "reenvio_documento_ofertado" | "reenvio_documento_confirmado" | "reenvio_documento_cancelado",
  extra: Omit<Extract<RespostaDocumento, { tipo: "resposta" }>, "tipo" | "texto" | "desfecho"> = {},
): RespostaDocumento {
  return { tipo: "resposta", texto, desfecho, ...extra };
}

async function lerReceitaMaisRecente(exec: ExecutorDocumentos, e: EntradaAtendimento) {
  const r = await exec.execute(sql`SELECT p.id, p.emitted_at
    FROM prescriptions p
    JOIN clients c ON c.id=p.client_id AND c.empresa_id=p.empresa_id
    WHERE p.client_id=${e.clienteId} AND p.empresa_id=${e.empresaId}
      AND p.status='emitted' AND p.emitted_at IS NOT NULL
      AND c.status='active' AND c.deleted_at IS NULL
      ${e.canal === "whatsapp" ? sql`` : sql`AND c.telegram_chat_id=${e.chatId}`}
    ORDER BY p.emitted_at DESC,p.id DESC LIMIT 1`);
  const p = r.rows[0] as { id: number | string; emitted_at: unknown } | undefined;
  if (!p) return null;
  const itemsResult = await exec.execute(sql`SELECT name FROM prescription_items
    WHERE prescription_id=${Number(p.id)} ORDER BY order_index,id`);
  const items = (itemsResult.rows as { name?: string | null }[])
    .map((item) => item.name?.trim() ?? "")
    .filter(Boolean);
  const recipesResult = await exec.execute(sql`SELECT id,title,prescription_id,pdf_data
    FROM recipes WHERE prescription_id=${Number(p.id)} ORDER BY id`);
  const recipes = (recipesResult.rows as { id: number | string; title?: string | null; prescription_id: number | string; pdf_data?: string | null }[])
    .map((item) => ({
      id: Number(item.id),
      title: item.title?.trim() || `Receita ${Number(item.id)}`,
      prescriptionId: Number(item.prescription_id),
      hasPdf: typeof item.pdf_data === "string" && item.pdf_data.trim().length > 0,
    }));
  return { prescriptionId: Number(p.id), items, recipes };
}

async function lerProtocolosAtuais(exec: ExecutorDocumentos, e: EntradaAtendimento) {
  const r = await exec.execute(sql`SELECT id,title,status FROM protocols
    WHERE client_id=${e.clienteId} AND empresa_id=${e.empresaId} AND status IN ('validated','active')
    ORDER BY updated_at DESC,id DESC`);
  return (r.rows as { id: number | string; title: string; status: string }[])
    .map((item) => ({ id: Number(item.id), title: item.title, status: item.status }));
}

async function lerOrientacoesClinicas(exec: ExecutorDocumentos, e: EntradaAtendimento): Promise<OrientacaoComCategoria[]> {
  const r = await exec.execute(sql`SELECT id,tema,perguntas_exemplo,resposta,categoria,subcategoria
    FROM orientacoes_aprovadas
    WHERE empresa_id=${e.empresaId} AND status='aprovada' AND categoria='prescricao'
      AND subcategoria IN ('formula_explicacao','protocolo_explicacao')
    ORDER BY id`);
  return (r.rows as {
    id: number | string; tema: string; perguntas_exemplo: string; resposta: string;
    categoria: string | null; subcategoria: string | null;
  }[]).map((item) => ({
    id: Number(item.id), tema: item.tema, perguntasExemplo: item.perguntas_exemplo,
    resposta: item.resposta, categoria: item.categoria, subcategoria: item.subcategoria,
  }));
}

function orientacaoExata(
  orientacoes: OrientacaoComCategoria[],
  subcategoria: "formula_explicacao" | "protocolo_explicacao",
  prefixo: "Fórmula" | "Protocolo",
  nome: string,
): OrientacaoComCategoria | null {
  const matches = orientacoes.filter((item) =>
    item.subcategoria === subcategoria && normalizarTitulo(item.tema) === normalizarTitulo(`${prefixo}: ${nome}`),
  );
  return matches.length === 1 ? matches[0] : null;
}

async function ofertaAtual(exec: ExecutorDocumentos, e: EntradaAtendimento) {
  const r = await exec.execute(sql`SELECT id,recipe_id,prescription_id,document_type,document_id,
      reissue_request_id,status,expira_em,
      (expira_em > NOW()) AS vigente
    FROM telegram_documento_reenvios
    WHERE empresa_id=${e.empresaId} AND cliente_id=${e.clienteId} AND chat_id=${e.chatId}
    ORDER BY criado_em DESC,id DESC LIMIT 1`);
  return r.rows[0] as {
    id: number | string; recipe_id: number | string | null; prescription_id: number | string | null;
    document_type?: string | null; document_id?: number | string | null;
    reissue_request_id?: number | string | null;
    status: string; vigente: boolean;
  } | undefined;
}

async function verificarIdentidade(exec: ExecutorDocumentos, e: EntradaAtendimento): Promise<boolean> {
  if (e.canal === "whatsapp") {
    return (await resolverIdentidadeWhatsapp(exec, e.empresaId, e.chatId))?.id === e.clienteId;
  }
  if (!await vinculoTelegramAtualUnico(exec, { clienteId: e.clienteId, empresaId: e.empresaId, chatId: e.chatId })) return false;
  const r = await exec.execute(sql`SELECT id FROM clients
    WHERE id=${e.clienteId} AND empresa_id=${e.empresaId} AND telegram_chat_id=${e.chatId}
      AND status='active' AND deleted_at IS NULL`);
  return r.rows.length === 1;
}

function tituloReceita(receita: ReceitaEmitida): string {
  return receita.title || `Receita ${receita.id}`;
}

const DOCUMENT_TYPE_LABEL: Record<IssuedDocumentSummary["documentType"], string> = {
  prescricao: "Prescrição",
  pedido_exames: "Pedido de exames",
  atestado: "Atestado",
  encaminhamento: "Encaminhamento",
  protocolo: "Protocolo",
  ras_fap: "Relatório RAS FAP",
  carta_tratamento: "Carta de Tratamento",
  documento_assinado: "Documento assinado",
};

function dataBR(date: string): string {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : "data não registrada";
}

async function localizarDocumentosParaSegundaVia(
  exec: ExecutorDocumentos,
  e: EntradaAtendimento,
  texto: string,
): Promise<RespostaDocumento> {
  if (!await verificarIdentidade(exec, e)) return handoff("identidade_telegram_nao_confirmada");
  const location = e.canal === "whatsapp"
    ? await exec.execute(sql`SELECT location_id FROM clients
        WHERE id=${e.clienteId} AND empresa_id=${e.empresaId} AND status='active'
          AND deleted_at IS NULL LIMIT 1`)
    : await exec.execute(sql`SELECT location_id FROM clients
        WHERE id=${e.clienteId} AND empresa_id=${e.empresaId} AND status='active'
          AND deleted_at IS NULL AND telegram_chat_id=${e.chatId} LIMIT 1`);
  const locationId = Number((location.rows[0] as { location_id?: number | string } | undefined)?.location_id);
  if (!Number.isSafeInteger(locationId) || locationId <= 0) {
    return handoff("clinica_do_cadastro_nao_confirmada");
  }

  const docs = await listIssuedDocumentsForClient({
    clientId: e.clienteId,
    empresaId: e.empresaId,
    locationId,
  });
  const operationKey = (messageId: number) => {
    const hex = createHash("sha256")
      .update(`${e.canal ?? "telegram"}-reissue:${e.empresaId}:${e.clienteId}:${messageId}`)
      .digest("hex").slice(0, 32).split("");
    hex[12] = "5";
    hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    const raw = hex.join("");
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  };
  if (docs.length === 0) {
    if (!e.simulacao) await createReissueRequest({
      operationKey: operationKey(e.inboxMessageId),
      clientId: e.clienteId,
      empresaId: e.empresaId,
      locationId,
      documentType: "nao_identificado",
      documentId: null,
      requestedByChannel: e.canal ?? "telegram",
      clientConsent: false,
    });
    return handoff("documento_emitido_original_nao_encontrado", (await carregarFrases())("documento_original_nao_encontrado"));
  }

  const frases = await carregarFrases();
  // Keep date punctuation for the selector; normalized text loses date separators.
  const candidates = selectClinicalDocuments(docs, e.texto);
  if (!candidates.length) {
    if (!e.simulacao) await createReissueRequest({
      operationKey: operationKey(e.inboxMessageId),
      clientId: e.clienteId,
      empresaId: e.empresaId,
      locationId,
      documentType: "nao_identificado",
      documentId: null,
      requestedByChannel: e.canal ?? "telegram",
      clientConsent: false,
    });
    return handoff("documento_emitido_original_nao_encontrado", frases("documento_original_nao_encontrado"));
  }
  if (candidates.length !== 1) {
    const list = candidates.slice(0, 8).map((doc) =>
      `• ${doc.label} — ${DOCUMENT_TYPE_LABEL[doc.documentType]} — ${dataBR(doc.issuedAt)} — documento ${doc.documentId}`,
    ).join("\n");
    if (list.length > 3500) return handoff("lista_de_documentos_excede_limite_seguro");
    if (!e.simulacao) await createReissueRequest({
      operationKey: operationKey(e.inboxMessageId),
      clientId: e.clienteId,
      empresaId: e.empresaId,
      locationId,
      documentType: "nao_identificado",
      documentId: null,
      requestedByChannel: e.canal ?? "telegram",
      clientConsent: false,
    });
    return resposta(frases("documento_lista_reenvio", { lista: `\n${list}` }), "clarificacao_documento");
  }

  const selected = candidates[0];
  const isPrescription = selected.documentType === "prescricao";
  const actionLabel = `${DOCUMENT_TYPE_LABEL[selected.documentType]} emitido em ${dataBR(selected.issuedAt)}`;
  const reissue = e.simulacao ? null : await createReissueRequest({
    operationKey: operationKey(e.inboxMessageId),
    clientId: e.clienteId,
    empresaId: e.empresaId,
    locationId,
    documentType: selected.documentType,
    documentId: selected.documentId,
    requestedByChannel: e.canal ?? "telegram",
    clientConsent: false,
  });
  if (e.simulacao) {
    return resposta(
      frases("documento_simulacao_reenvio", { titulo: actionLabel }),
      isPrescription ? "reenvio_receita_ofertado" : "reenvio_documento_ofertado",
      { documento: { acao: "ofertar_reenvio", documentType: selected.documentType, documentId: selected.documentId, titulo: selected.label } },
    );
  }
  if (!reissue) return handoff("solicitacao_de_segunda_via_nao_foi_criada");
  if (reissue.status !== "awaiting_confirmation" || !reissue.documentHash) {
    return resposta(
      frases("documento_revisao_reenvio", { titulo: actionLabel }),
      isPrescription ? "reenvio_receita_ofertado" : "reenvio_documento_ofertado",
    );
  }
  return resposta(
    reissue.eligibility === "fee_required"
      ? frases("documento_oferta_reenvio_taxa", {
        titulo: actionLabel,
        taxa: ` A taxa administrativa é de R$ ${Number(reissue.feeAmount ?? 0).toFixed(2).replace(".", ",")}. Ainda não houve cobrança; o envio depende da confirmação do pagamento.`,
      })
      : frases("documento_oferta_reenvio_sem_taxa", { titulo: actionLabel }),
    isPrescription ? "reenvio_receita_ofertado" : "reenvio_documento_ofertado",
    {
      documento: {
        acao: "ofertar_reenvio",
        documentType: selected.documentType,
        documentId: selected.documentId,
        reissueRequestId: reissue.id,
        ...(isPrescription ? { receitaId: selected.documentId } : {}),
        titulo: selected.label,
      },
    },
  );
}

function ofertaDeReenvio(receita: ReceitaEmitida): { acao: "ofertar_reenvio"; receitaId: number; prescricaoId: number; titulo: string } {
  return { acao: "ofertar_reenvio", receitaId: receita.id, prescricaoId: receita.prescriptionId, titulo: tituloReceita(receita) };
}

/**
 * Seleciona somente fatos do próprio cadastro e explicações clínicas aprovadas com título exato.
 * Nunca envia doses, nomes de clientes ou arquivos à inteligência artificial.
 */
export async function responderSobreDocumentoTelegram(exec: ExecutorDocumentos, e: EntradaAtendimento): Promise<RespostaDocumento | null> {
  const texto = normalizar(e.texto);
  // An examination order is not its result; the latter has no verified source
  // in this resolver and must never silently select an order instead.
  if (/\bresultados?\b/.test(texto) && /\bexames?\b/.test(texto)) {
    return handoff("resultado_de_exame_sem_fonte_de_entrega", (await carregarFrases())("documento_original_nao_encontrado"));
  }
  if ((PERGUNTA_FORMULA.test(texto) || /\b(receitas|prescricoes|pedido de exames|protocolo|atestado|encaminhamento|documento)\b/.test(texto)) &&
      /\b(nova|novo|novas|novos|renovar|renovacao|alterar|mudar|trocar|aumentar|reduzir|incluir|retirar)\b/.test(texto)) {
    return handoff("nova_ou_alteracao_de_prescricao_exige_medico", (await carregarFrases())("documento_novo_ou_alteracao"));
  }
  const afirmativo = SIM_EXATO.has(texto);
  const negativo = NAO_EXATO.has(texto);

  if (afirmativo || negativo) {
    const oferta = await ofertaAtual(exec, e);
    if (oferta?.status === "oferecido" && oferta.vigente) {
      if (afirmativo) {
        const documentType = oferta.document_type || "prescricao";
        const documentId = Number(oferta.document_id ?? oferta.recipe_id);
        const isPrescription = documentType === "prescricao";
        return resposta(
          (await carregarFrases())("documento_reenvio_confirmado"),
          isPrescription ? "reenvio_receita_confirmado" : "reenvio_documento_confirmado",
          { documento: {
            acao: "confirmar_reenvio",
            documentType: documentType as IssuedDocumentSummary["documentType"],
            documentId,
            ...(isPrescription ? { receitaId: documentId, prescricaoId: Number(oferta.prescription_id) } : {}),
            ofertaId: Number(oferta.id),
            ...(oferta.reissue_request_id ? { reissueRequestId: String(oferta.reissue_request_id) } : {}),
          } },
        );
      }
      const documentType = oferta.document_type || "prescricao";
      const isPrescription = documentType === "prescricao";
      return resposta(
        (await carregarFrases())("documento_reenvio_cancelado"),
        isPrescription ? "reenvio_receita_cancelado" : "reenvio_documento_cancelado",
        { documento: {
          acao: "cancelar_reenvio",
          documentType: documentType as IssuedDocumentSummary["documentType"],
          documentId: Number(oferta.document_id ?? oferta.recipe_id),
          ...(isPrescription ? { receitaId: Number(oferta.recipe_id), prescricaoId: Number(oferta.prescription_id) } : {}),
          ofertaId: Number(oferta.id),
        } },
      );
    }
    if (afirmativo && oferta) {
      return handoff("confirmacao_de_reenvio_sem_oferta_vigente", (await carregarFrases())("documento_confirmacao_reenvio_invalida"));
    }
  }

  const querReenvio = PEDIDO_REENVIO.test(texto);
  const querReceita = PERGUNTA_FORMULA.test(texto) || querReenvio;
  const querProtocolo = PERGUNTA_PROTOCOLO.test(texto);
  if (!querReceita && !querProtocolo) return null;
  if (!await verificarIdentidade(exec, e)) return handoff("identidade_telegram_nao_confirmada");

  if (querReenvio) return localizarDocumentosParaSegundaVia(exec, e, texto);

  const orientacoes = await lerOrientacoesClinicas(exec, e);

  if (querReceita) {
    const receitaAtual = await lerReceitaMaisRecente(exec, e);
    if (!receitaAtual || receitaAtual.items.length === 0) {
      return handoff("receituario_emitido_nao_encontrado");
    }
    const receitasValidas = receitaAtual.recipes.filter((item) => item.hasPdf);
    const unicaReceita = receitaAtual.recipes.length === 1 && receitasValidas.length === 1
      ? receitasValidas[0]
      : null;

    const nomes = receitaAtual.items;
    const itensMencionados = nomes.filter((nome) => mencionarNome(texto, nome));
    const itemSelecionado = itensMencionados.length === 1 ? itensMencionados[0] : nomes.length === 1 ? nomes[0] : null;
    const pedeExplicacao = PEDIDO_EXPLICACAO.test(texto) || /\b(explique|explica|funciona|utilidade)\b/.test(texto);
    if (!pedeExplicacao && (PERGUNTA_NOMES.test(texto) || nomes.length === 1)) {
      const lista = nomes.map((nome) => `• ${nome}`).join("\n");
      const oferta = unicaReceita
        ? `\n\n${(await carregarFrases())("documento_oferta_formula_reenvio")}`
        : "";
      if (lista.length + oferta.length > 3800) return handoff("lista_de_itens_excede_limite_seguro");
      return resposta(
        (await carregarFrases())("documento_lista_itens_receita", { lista: `\n${lista}`, oferta }),
        "clarificacao_documento",
        { ...(unicaReceita ? { documento: ofertaDeReenvio(unicaReceita) } : {}) },
      );
    }
    if (!itemSelecionado) {
      const lista = nomes.map((nome) => `• ${nome}`).join("\n");
      if (lista.length > 3800) return handoff("lista_de_itens_excede_limite_seguro");
      return resposta(
        (await carregarFrases())("documento_lista_formulas_receita", { lista: `\n${lista}` }),
        "clarificacao_documento",
      );
    }
    const fonte = orientacaoExata(orientacoes, "formula_explicacao", "Fórmula", itemSelecionado);
    if (!fonte) return handoff("explicacao_de_formula_sem_fonte_exata_aprovada");
    const textoOferta = unicaReceita
      ? `\n\n${(await carregarFrases())("documento_oferta_formula_reenvio")}`
      : "";
    if (fonte.resposta.length + textoOferta.length > 4000) {
      return resposta(fonte.resposta, "orientacao_enviada", { orientacaoId: fonte.id });
    }
    return resposta(`${fonte.resposta}${textoOferta}`, "orientacao_enviada", {
      orientacaoId: fonte.id,
      ...(unicaReceita ? { documento: ofertaDeReenvio(unicaReceita) } : {}),
    });
  }

  const protocolos = await lerProtocolosAtuais(exec, e);
  if (protocolos.length === 0) return handoff("protocolo_ativo_ou_validado_nao_encontrado");
  const mencionados = protocolos.filter((item) => mencionarNome(texto, item.title));
  const protocolo = mencionados.length === 1 ? mencionados[0] : protocolos.length === 1 ? protocolos[0] : null;
  if (!protocolo) {
    const lista = protocolos.map((item) => `• ${item.title}`).join("\n");
    if (lista.length > 3800) return handoff("lista_de_protocolos_excede_limite_seguro");
    return resposta((await carregarFrases())("protocolo_lista_documentos", { lista: `\n${lista}` }), "clarificacao_documento");
  }
  const fonte = orientacaoExata(orientacoes, "protocolo_explicacao", "Protocolo", protocolo.title);
  if (!fonte) return handoff("explicacao_de_protocolo_sem_fonte_exata_aprovada");
  return resposta(fonte.resposta, "orientacao_enviada", { orientacaoId: fonte.id });
}

/** Reconsulta a própria origem imediatamente antes do envio e bloqueia qualquer plano documental que mudou. */
export async function respostaDocumentoAindaAtual(
  exec: ExecutorDocumentos,
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
): Promise<boolean> {
  if (plano.caminhoResolucao !== "documento") return true;
  const atual = await responderSobreDocumentoTelegram(exec, e);
  return atual?.tipo === "resposta" &&
    atual.texto === plano.resposta &&
    (atual.orientacaoId ?? null) === (plano.orientacaoId ?? null) &&
    atual.desfecho === plano.desfecho &&
    JSON.stringify(atual.documento ?? null) === JSON.stringify(plano.documento ?? null);
}

