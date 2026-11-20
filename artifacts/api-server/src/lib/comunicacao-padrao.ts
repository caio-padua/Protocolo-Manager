/**
 * COMUNICACAO PADRONIZADA PAXMED (texto + flyer) — compositor unico, DETERMINISTICO e SEM IA.
 * Este modulo nao importa nenhum cliente de IA: texto = modelo cadastrado + variaveis reais; flyer = molde versionado
 * (lib/flyer-paxmed) + dados. Modelo de texto por clinica (empresa_id) com padrao do sistema (empresa_id NULL).
 * Regra de flyer por categoria e clinica, editavel; categoria sem regra = SEM flyer (conversa trivial nunca leva).
 * Antes de enviar: valida destinatario (cliente da clinica + vinculo unico do chat) e valor; separa teste de producao;
 * registra modelo, versao, campos, mensagem e status real em comunicacao_envio.
 */
import { db, clientsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendTelegram, sendTelegramPhotoBuffer } from "./telegram.js";
import { enviarAnexosDaMensagem } from "./anexos-mensagem.js";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual.js";
import { renderFlyerPaxmed } from "./flyer-paxmed.js";

export type Categoria = "link_pagamento" | "boleto" | "documento" | "pedido_exame" | "orcamento" | "lembrete_formal" | "oferta_pam" | "duvida_cliente" | "pedido_recebido";
export interface DefCategoria {
  nome: string; variaveis: string[]; texto: string; flyerPadrao: boolean;
  /** Flyer: titulo e linhas (rotulo + campo vinculado). A clinica entra sempre por ultimo. */
  flyer: { titulo: string; linhas: Array<{ rotulo: string; campo: "finalidade" | "valor" | "data" | "horario" }> };
}
const ASSINATURA = "{assistente}, assistente virtual\n{clinica}";
const ABERTURA = "{nome}, tudo bem?";
export const CATEGORIAS: Record<Categoria, DefCategoria> = {
  link_pagamento: {
    nome: "Link de pagamento", variaveis: ["valor", "referencia", "link"], flyerPadrao: true,
    texto: `${ABERTURA}\n\nEu sou a {assistente}, assistente virtual de {clinica}, e estou encaminhando o seu link de pagamento.\n\nValor: {valor}\n\nReferência: {referencia}\n\nLink: {link}\n\nAgradecemos pela confiança e ficamos à disposição para qualquer dúvida.\n\n${ASSINATURA}`,
    flyer: { titulo: "Link de pagamento", linhas: [{ rotulo: "Finalidade", campo: "finalidade" }, { rotulo: "Valor", campo: "valor" }, { rotulo: "Data", campo: "data" }, { rotulo: "Horário", campo: "horario" }] },
  },
  boleto: {
    nome: "Boleto", variaveis: ["valor", "referencia", "vencimento", "link"], flyerPadrao: true,
    texto: `${ABERTURA}\n\nEu sou a {assistente}, assistente virtual de {clinica}, e estou encaminhando o seu boleto.\n\nValor: {valor}\n\nReferência: {referencia}\n\nVencimento: {vencimento}\n\nLink: {link}\n\nAgradecemos pela confiança e permanecemos à disposição.\n\n${ASSINATURA}`,
    flyer: { titulo: "Boleto", linhas: [{ rotulo: "Finalidade", campo: "finalidade" }, { rotulo: "Valor", campo: "valor" }, { rotulo: "Vencimento", campo: "data" }, { rotulo: "Horário", campo: "horario" }] },
  },
  documento: {
    nome: "Documento", variaveis: ["documento", "link"], flyerPadrao: true,
    texto: `${ABERTURA}\n\nEu sou a {assistente}, assistente virtual de {clinica}, e estou encaminhando o seguinte documento: {documento}.\n\nLink: {link}\n\nFicamos à disposição para esclarecer qualquer ponto.\n\n${ASSINATURA}`,
    flyer: { titulo: "Documento", linhas: [{ rotulo: "Finalidade", campo: "finalidade" }, { rotulo: "Valor", campo: "valor" }, { rotulo: "Data", campo: "data" }, { rotulo: "Horário", campo: "horario" }] },
  },
  pedido_exame: {
    nome: "Pedido de exame", variaveis: ["referencia"], flyerPadrao: false,
    texto: `${ABERTURA}\n\nEu sou a {assistente}, assistente virtual de {clinica}, e recebi o seu pedido: {referencia}.\n\nEle foi encaminhado ao médico, que fará a avaliação antes de qualquer solicitação.\n\nAgradecemos pela paciência e pela confiança.\n\n${ASSINATURA}`,
    flyer: { titulo: "Pedido de exame", linhas: [{ rotulo: "Finalidade", campo: "finalidade" }, { rotulo: "Data", campo: "data" }, { rotulo: "Horário", campo: "horario" }] },
  },
  orcamento: {
    nome: "Orçamento", variaveis: ["valor", "referencia", "link"], flyerPadrao: true,
    texto: `${ABERTURA}\n\nEu sou a {assistente}, assistente virtual de {clinica}, e estou encaminhando o seu orçamento.\n\nValor: {valor}\n\nReferência: {referencia}\n\nLink: {link}\n\nAgradecemos pelo interesse e ficamos à disposição para esclarecimentos.\n\n${ASSINATURA}`,
    flyer: { titulo: "Orçamento", linhas: [{ rotulo: "Finalidade", campo: "finalidade" }, { rotulo: "Valor", campo: "valor" }, { rotulo: "Data", campo: "data" }, { rotulo: "Horário", campo: "horario" }] },
  },
  oferta_pam: {
    nome: "Oferta do PAM", variaveis: [], flyerPadrao: false,
    texto: `${ABERTURA}\n\nEu sou a {assistente}, assistente virtual de {clinica}. Como você ainda não faz parte do Programa de Acompanhamento Médico (PAM), quero apresentar como ele funciona.\n\nO PAM organiza o seu cuidado com um contato online por mês e uma consulta presencial a cada 2 meses, com a equipe disponível para dúvidas objetivas.\n\nEnviei em anexo o guia explicativo, com os planos e os valores. Se preferir, você também pode seguir de forma avulsa, sem nenhuma obrigação.\n\n${ASSINATURA}`,
    flyer: { titulo: "Programa de Acompanhamento Médico", linhas: [{ rotulo: "Finalidade", campo: "finalidade" }, { rotulo: "Data", campo: "data" }] },
  },
  duvida_cliente: {
    nome: "Cliente quer tirar uma dúvida", variaveis: [], flyerPadrao: false,
    texto: `${ABERTURA}\n\nEu sou a {assistente}, assistente virtual de {clinica}, e recebi a sua dúvida.\n\nDúvidas objetivas, como agendamento, orientações práticas e organização do atendimento, a equipe responde por aqui. Dúvida sobre tratamento, exames ou conduta médica é assunto de consulta ou retorno com o médico.\n\nEnviei em anexo o guia com o que a equipe resolve e como funciona cada etapa do atendimento.\n\n${ASSINATURA}`,
    flyer: { titulo: "Tirar dúvidas", linhas: [{ rotulo: "Finalidade", campo: "finalidade" }, { rotulo: "Data", campo: "data" }] },
  },
  pedido_recebido: {
    nome: "Aviso de pedido recebido", variaveis: ["referencia"], flyerPadrao: false,
    texto: `${ABERTURA}\n\nEu sou a {assistente}, assistente virtual de {clinica}, e recebi o seu pedido: {referencia}.\n\nEle foi registrado e será avaliado pelo médico. Nada é emitido antes dessa avaliação, e o médico pode pedir mais informações.\n\nAgradecemos pela confiança.\n\n${ASSINATURA}`,
    flyer: { titulo: "Pedido recebido", linhas: [{ rotulo: "Finalidade", campo: "finalidade" }, { rotulo: "Data", campo: "data" }] },
  },
  lembrete_formal: {
    nome: "Lembrete formal", variaveis: ["referencia", "data", "horario"], flyerPadrao: true,
    texto: `${ABERTURA}\n\nEu sou a {assistente}, assistente virtual de {clinica}, e passo para lembrar do seu compromisso: {referencia}.\n\nData: {data}\n\nHorário: {horario}\n\nSe precisar de qualquer ajuda, estamos à disposição.\n\n${ASSINATURA}`,
    flyer: { titulo: "Lembrete", linhas: [{ rotulo: "Finalidade", campo: "finalidade" }, { rotulo: "Data", campo: "data" }, { rotulo: "Horário", campo: "horario" }] },
  },
};
export const VARIAVEIS_GLOBAIS = ["nome", "assistente", "clinica"];
export const FLYER_VERSAO = 1; // versao do molde (layout travado em flyer-paxmed.ts)
export const ASSISTENTE_PADRAO = "Helena";
export const TESTE_PERMITIDOS_PADRAO = [11, 12, 1924];
export const TESTE_MAX_CENTAVOS = 500;
export const PRODUCAO_MAX_CENTAVOS = 10_000_000;
export const ehCategoria = (c: unknown): c is Categoria => typeof c === "string" && c in CATEGORIAS;

// ───────────── Funcoes puras (testaveis sem banco, sem rede, sem IA) ─────────────
export const brl = (centavos: number): string => `R$ ${(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dataBR = (iso: string | null | undefined): string | null => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : null);
export const primeiroNome = (n: string): string => n.trim().split(/\s+/)[0] ?? "";

/** Valida texto editado: so variaveis da categoria + globais; todas as da categoria obrigatorias; paragrafos preservados. */
export function validarModelo(cat: Categoria, texto: unknown): string | null {
  if (typeof texto !== "string" || texto.trim().length < 20) return "texto muito curto";
  if (texto.length > 1500) return "texto acima de 1500 caracteres";
  const def = CATEGORIAS[cat];
  const usadas = [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const ok = [...def.variaveis, ...VARIAVEIS_GLOBAIS];
  const estranha = usadas.find((u) => !ok.includes(u));
  if (estranha) return `variável {${estranha}} não existe nesta categoria`;
  const falta = def.variaveis.find((v) => !usadas.includes(v));
  if (falta) return `a variável {${falta}} é obrigatória`;
  if (!usadas.includes("clinica")) return "a variável {clinica} é obrigatória";
  return null;
}
/** Substitui variaveis. Variavel sem valor = ERRO (nunca sai "{valor}" nem texto inventado). Quebras preservadas. */
export function renderTexto(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\r\n/g, "\n").replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = vars[k];
    if (typeof v !== "string" || !v.trim()) throw new ErroComunicacao(`variável sem valor: ${k}`);
    return v.trim();
  });
}
export interface Regra { empresaId: number | null; categoria: string; enviarFlyer: boolean }
/** Regra da clinica vence a padrao; sem nenhuma regra = SEM flyer. */
export function decidirFlyer(regras: Regra[], empresaId: number, categoria: string): boolean {
  const da = regras.find((r) => r.empresaId === empresaId && r.categoria === categoria);
  if (da) return da.enviarFlyer;
  return regras.find((r) => r.empresaId === null && r.categoria === categoria)?.enviarFlyer ?? false;
}
export function validarValor(centavos: unknown, ambiente: "teste" | "producao"): number {
  if (typeof centavos !== "number" || !Number.isInteger(centavos) || centavos <= 0) throw new ErroComunicacao("valor inválido");
  const teto = ambiente === "teste" ? TESTE_MAX_CENTAVOS : PRODUCAO_MAX_CENTAVOS;
  if (centavos > teto) throw new ErroComunicacao(`valor acima do limite do ambiente ${ambiente}`);
  return centavos;
}
export class ErroComunicacao extends Error {}

// ───────────── Banco ─────────────
let pronto = false;
export async function prepararTabelas(): Promise<void> {
  if (pronto) return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS comunicacao_modelo_texto (
    id SERIAL PRIMARY KEY, empresa_id INTEGER, categoria TEXT NOT NULL, texto TEXT NOT NULL, versao INTEGER NOT NULL DEFAULT 1,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_por INTEGER)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_com_modelo ON comunicacao_modelo_texto (COALESCE(empresa_id,0), categoria)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS comunicacao_modelo_texto_hist (
    id SERIAL PRIMARY KEY, empresa_id INTEGER, categoria TEXT NOT NULL, versao INTEGER NOT NULL, texto TEXT NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_por INTEGER)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS comunicacao_regra (
    id SERIAL PRIMARY KEY, empresa_id INTEGER, categoria TEXT NOT NULL, enviar_flyer BOOLEAN NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_por INTEGER)`);
  await db.execute(sql`ALTER TABLE comunicacao_envio ADD COLUMN IF NOT EXISTS anexos_enviados INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE comunicacao_envio ADD COLUMN IF NOT EXISTS status_anexo TEXT`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_com_regra ON comunicacao_regra (COALESCE(empresa_id,0), categoria)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS comunicacao_modelo_flyer (
    id SERIAL PRIMARY KEY, categoria TEXT NOT NULL, versao INTEGER NOT NULL, titulo TEXT NOT NULL, linhas JSONB NOT NULL,
    layout TEXT NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (categoria, versao))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS comunicacao_envio (
    id SERIAL PRIMARY KEY, ambiente TEXT NOT NULL, empresa_id INTEGER, cliente_id INTEGER, categoria TEXT NOT NULL,
    modelo_texto_versao INTEGER, modelo_flyer_versao INTEGER, flyer_enviado BOOLEAN NOT NULL DEFAULT FALSE,
    campos JSONB, mensagem TEXT, status TEXT NOT NULL, status_flyer TEXT, erro TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  for (const [cat, d] of Object.entries(CATEGORIAS) as Array<[Categoria, DefCategoria]>) {
    await db.execute(sql`INSERT INTO comunicacao_modelo_texto (empresa_id, categoria, texto) VALUES (NULL, ${cat}, ${d.texto}) ON CONFLICT DO NOTHING`);
    await db.execute(sql`INSERT INTO comunicacao_regra (empresa_id, categoria, enviar_flyer) VALUES (NULL, ${cat}, ${d.flyerPadrao}) ON CONFLICT DO NOTHING`);
    await db.execute(sql`INSERT INTO comunicacao_modelo_flyer (categoria, versao, titulo, linhas, layout) VALUES
      (${cat}, ${FLYER_VERSAO}, ${d.flyer.titulo}, ${JSON.stringify(d.flyer.linhas)}::jsonb, 'paxmed-receituario-1200') ON CONFLICT DO NOTHING`);
  }
  pronto = true;
}
export async function modeloTexto(empresaId: number, cat: Categoria): Promise<{ texto: string; versao: number; origem: "clinica" | "padrao" }> {
  await prepararTabelas();
  const r = (await db.execute(sql`SELECT texto, versao, empresa_id FROM comunicacao_modelo_texto
    WHERE categoria=${cat} AND (empresa_id=${empresaId} OR empresa_id IS NULL) ORDER BY empresa_id NULLS LAST LIMIT 1`)).rows[0] as any;
  if (!r) throw new ErroComunicacao(`modelo ausente: ${cat}`);
  return { texto: r.texto, versao: r.versao, origem: r.empresa_id == null ? "padrao" : "clinica" };
}
export async function carregarRegras(empresaId: number): Promise<Regra[]> {
  await prepararTabelas();
  const r = await db.execute(sql`SELECT empresa_id, categoria, enviar_flyer FROM comunicacao_regra WHERE empresa_id=${empresaId} OR empresa_id IS NULL`);
  return (r.rows as any[]).map((x) => ({ empresaId: x.empresa_id, categoria: x.categoria, enviarFlyer: x.enviar_flyer }));
}
export async function gravarModeloClinica(empresaId: number, cat: Categoria, texto: string, por: number | null): Promise<number> {
  await prepararTabelas();
  const atual = (await db.execute(sql`SELECT versao FROM comunicacao_modelo_texto WHERE empresa_id=${empresaId} AND categoria=${cat}`)).rows[0] as any;
  const versao = (atual?.versao ?? (await modeloTexto(empresaId, cat)).versao) + 1;
  await db.execute(sql`INSERT INTO comunicacao_modelo_texto (empresa_id, categoria, texto, versao, atualizado_por) VALUES (${empresaId}, ${cat}, ${texto}, ${versao}, ${por})
    ON CONFLICT (COALESCE(empresa_id,0), categoria) DO UPDATE SET texto=EXCLUDED.texto, versao=EXCLUDED.versao, atualizado_em=NOW(), atualizado_por=EXCLUDED.atualizado_por`);
  await db.execute(sql`INSERT INTO comunicacao_modelo_texto_hist (empresa_id, categoria, versao, texto, atualizado_por) VALUES (${empresaId}, ${cat}, ${versao}, ${texto}, ${por})`);
  return versao;
}
export async function gravarRegraClinica(empresaId: number, cat: Categoria, enviarFlyer: boolean, por: number | null): Promise<void> {
  await prepararTabelas();
  await db.execute(sql`INSERT INTO comunicacao_regra (empresa_id, categoria, enviar_flyer, atualizado_por) VALUES (${empresaId}, ${cat}, ${enviarFlyer}, ${por})
    ON CONFLICT (COALESCE(empresa_id,0), categoria) DO UPDATE SET enviar_flyer=EXCLUDED.enviar_flyer, atualizado_em=NOW(), atualizado_por=EXCLUDED.atualizado_por`);
}
async function permitidosTeste(): Promise<number[]> {
  const r = (await db.execute(sql`SELECT value FROM app_settings WHERE key='comunicacao.teste.permitidos'`)).rows[0] as any;
  if (!r?.value) return TESTE_PERMITIDOS_PADRAO;
  try { const v = JSON.parse(r.value); return Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : TESTE_PERMITIDOS_PADRAO; } catch { return TESTE_PERMITIDOS_PADRAO; }
}

// ───────────── Envio ─────────────
export interface PedidoEnvio {
  ambiente: "teste" | "producao"; categoria: Categoria; clienteId: number;
  valorCentavos?: number; referencia?: string; link?: string; documento?: string; vencimento?: string | null; data?: string | null; horario?: string | null;
}
export interface ResultadoEnvio { status: "aceito" | "recusado"; flyerEnviado: boolean; statusFlyer: string | null; anexosEnviados: number; statusAnexo: string | null; mensagem: string; envioId: number; erro?: string }
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ambiente do envio: participante da lista de teste usa "teste" (teto de R$ 5); os demais, "producao". */
export async function ambienteDoCliente(clienteId: number): Promise<"teste" | "producao"> {
  return (await permitidosTeste()).includes(clienteId) ? "teste" : "producao";
}

export async function enviarComunicacao(p: PedidoEnvio): Promise<ResultadoEnvio> {
  await prepararTabelas();
  if (!ehCategoria(p.categoria)) throw new ErroComunicacao("categoria desconhecida");
  if (p.ambiente !== "teste" && p.ambiente !== "producao") throw new ErroComunicacao("ambiente inválido");
  const def = CATEGORIAS[p.categoria];
  const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, p.clienteId));
  if (!c || c.empresaId == null) throw new ErroComunicacao("cliente sem clínica");
  if (p.ambiente === "teste" && !(await permitidosTeste()).includes(c.id)) throw new ErroComunicacao("cliente fora da lista de participantes autorizados do teste");
  if (!c.telegramChatId || !(await vinculoTelegramAtualUnico(db, { clienteId: c.id, empresaId: c.empresaId, chatId: c.telegramChatId })))
    throw new ErroComunicacao("chat sem vínculo único confirmado com este cliente");
  const emp = (await db.execute(sql`SELECT nome FROM empresas WHERE id=${c.empresaId}`)).rows[0] as any;
  if (!emp?.nome) throw new ErroComunicacao("clínica sem nome cadastrado");
  const valor = def.variaveis.includes("valor") ? brl(validarValor(p.valorCentavos, p.ambiente)) : (p.valorCentavos != null ? brl(validarValor(p.valorCentavos, p.ambiente)) : null);
  const venc = dataBR(p.vencimento);
  const vars: Record<string, string> = {
    nome: primeiroNome(c.name), assistente: ASSISTENTE_PADRAO, clinica: String(emp.nome),
    ...(valor ? { valor } : {}), ...(p.referencia ? { referencia: p.referencia } : {}), ...(p.link ? { link: p.link } : {}),
    ...(p.documento ? { documento: p.documento } : {}), ...(venc ? { vencimento: venc } : {}),
    ...(dataBR(p.data) ? { data: dataBR(p.data) as string } : {}), ...(p.horario ? { horario: p.horario } : {}),
  };
  const modelo = await modeloTexto(c.empresaId, p.categoria);
  const mensagem = renderTexto(modelo.texto, vars);               // falha ANTES de enviar se faltar dado
  const comFlyer = decidirFlyer(await carregarRegras(c.empresaId), c.empresaId, p.categoria);
  const campos = { valor, referencia: p.referencia ?? null, vencimento: venc, data: dataBR(p.data), horario: p.horario ?? null, documento: p.documento ?? null, link: p.link ?? null, clinica: emp.nome };

  let statusFlyer: string | null = null; let flyerEnviado = false; let erro: string | undefined;
  if (comFlyer) {
    const dado = { finalidade: p.referencia ?? p.documento ?? null, valor, data: dataBR(p.data) ?? venc, horario: p.horario ?? null } as const;
    const png = await renderFlyerPaxmed({ titulo: def.flyer.titulo, linhas: def.flyer.linhas.map((l) => ({ rotulo: l.rotulo, valor: dado[l.campo] })), clinica: String(emp.nome) });
    const f = await sendTelegramPhotoBuffer(c.telegramChatId, png, `flyer-comunicacao-paxmed-${p.categoria}-v${FLYER_VERSAO}.png`, "");
    flyerEnviado = f.sent && !f.mock; statusFlyer = flyerEnviado ? "aceito" : `recusado:${f.error ?? "mock"}`;
    if (!flyerEnviado) erro = `flyer: ${f.error ?? "sem token"}`;
  }
  let status: "aceito" | "recusado" = "recusado";
  if (!comFlyer || flyerEnviado) {
    const t = await sendTelegram(c.telegramChatId, esc(mensagem), { disableWebPagePreview: true });
    status = t.sent && !t.mock ? "aceito" : "recusado";
    if (status === "recusado") erro = `texto: ${t.error ?? "sem token"}`;
  }
  // Anexos: so os arquivos com interruptor LIGADO nesta mensagem, depois do texto aceito.
  let anexosEnviados = 0; let statusAnexo: string | null = null;
  if (status === "aceito") {
    const a = await enviarAnexosDaMensagem(c.telegramChatId, c.empresaId, p.categoria);
    anexosEnviados = a.enviados; statusAnexo = a.status;
    if (a.erro) erro = `${erro ? erro + "; " : ""}${a.erro}`;
  }
  const ins = (await db.execute(sql`INSERT INTO comunicacao_envio (ambiente, empresa_id, cliente_id, categoria, modelo_texto_versao, modelo_flyer_versao, flyer_enviado, campos, mensagem, status, status_flyer, erro, anexos_enviados, status_anexo)
    VALUES (${p.ambiente}, ${c.empresaId}, ${c.id}, ${p.categoria}, ${modelo.versao}, ${comFlyer ? FLYER_VERSAO : null}, ${flyerEnviado}, ${JSON.stringify(campos)}::jsonb, ${mensagem}, ${status}, ${statusFlyer}, ${erro ?? null}, ${anexosEnviados}, ${statusAnexo}) RETURNING id`)).rows[0] as any;
  if (status === "aceito") {
    await db.execute(sql`INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, recebida_em, direcao, lida_em)
      VALUES (${c.empresaId}, ${c.id}, ${c.telegramChatId}, ${mensagem}, NOW(), 'saida', NOW())`);
  }
  return { status, flyerEnviado, statusFlyer, anexosEnviados, statusAnexo, mensagem, envioId: ins.id, erro };
}
