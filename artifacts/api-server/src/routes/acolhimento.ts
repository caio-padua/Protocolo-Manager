/**
 * Central operacional de acompanhamento (acolhimento) de médicos e clientes. Somente leitura; titular da plataforma.
 * Regra central: cada etapa é "comprovada" (há registro com data e fonte), "pendente" (esperado e ainda não ocorreu),
 * "sem_registro" (o sistema não tem prova; NÃO significa que não aconteceu) ou "nao_aplicavel".
 * Aceite de convite não é primeiro acesso; evento de navegação não prova primeiro acesso histórico.
 * Nada aqui envia mensagem: os modelos são só texto para ação manual.
 */
import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireCollaborator } from "./collaborator.js";
import { isPlatformOwner } from "../lib/clinical-access";
import { garantirTabelaAcesso } from "../lib/acesso-registro";
import { garantirTabelasConviteMedico } from "./paxcare-convite-medico";
import { garantirTabelaConvites } from "./vitrine-convites";

const router: IRouter = Router();

type Estado = "comprovado" | "pendente" | "sem_registro" | "nao_aplicavel";
type Etapa = { codigo: string; rotulo: string; estado: Estado; em: string | null; fonte: string; nota?: string };
type Item = { chave: string; tipo: "medico" | "cliente"; origem: "pedido_comercial" | "convite_clinico" | "cliente"; nome: string;
  contato: string | null; consentimentoContato: string; etapas: Etapa[]; pendencias: string[] };

export const PENDENCIAS: Record<string, string> = {
  decidir_pedido: "Pedido aguardando decisão do titular",
  criar_cadastro: "Aprovado, mas sem cadastro de profissional",
  aguardando_medico: "Convite aguardando resposta do médico",
  convite_expirado: "Convite expirou sem resposta",
  acesso_encerrado: "Acesso do convite já encerrou",
  sem_primeiro_acesso: "Sem primeiro acesso registrado",
  definir_senha: "Senha provisória ainda ativa",
  convite_pendente: "Tem convite a médico aguardando resposta",
};

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : null);
const mascara = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");
const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const SEM_PROVA = "O sistema não tem registro; isso não prova que não aconteceu.";

async function existe(tabela: string): Promise<boolean> {
  const r = (await db.execute(sql`SELECT to_regclass(${`public.${tabela}`}) IS NOT NULL AS ok`)).rows[0] as { ok: boolean };
  return r.ok;
}

async function titular(req: Parameters<typeof requireCollaborator>[0], res: Parameters<typeof requireCollaborator>[1]): Promise<boolean> {
  if (await isPlatformOwner(Number(req.collaborator?.professionalId))) return true;
  res.status(403).json({ error: "Acesso restrito ao titular da plataforma." });
  return false;
}

async function montar(): Promise<Item[]> {
  await garantirTabelaAcesso();
  await garantirTabelaConvites();
  await garantirTabelasConviteMedico();
  const acessos = new Map<string, { primeiro: unknown; ultimo: unknown; total: number; origem: string }>();
  for (const r of (await db.execute(sql`SELECT tipo, pessoa_id, primeiro_em, ultimo_em, total, primeira_origem FROM acesso_primeiro_registro`)).rows as any[]) {
    acessos.set(`${r.tipo}:${r.pessoa_id}`, { primeiro: r.primeiro_em, ultimo: r.ultimo_em, total: r.total, origem: r.primeira_origem });
  }
  const itens: Item[] = [];
  const acessoProf = (id: number): Etapa => {
    const a = acessos.get(`profissional:${id}`);
    return a
      ? { codigo: "primeiro_acesso", rotulo: "Primeiro acesso ao sistema", estado: "comprovado", em: iso(a.primeiro), fonte: `acesso_primeiro_registro (${a.origem})`, nota: `Registrado desde a implantação do registro; ${a.total} acesso(s).` }
      : { codigo: "primeiro_acesso", rotulo: "Primeiro acesso ao sistema", estado: "sem_registro", em: null, fonte: "acesso_primeiro_registro", nota: SEM_PROVA };
  };

  // 1) Pedidos comerciais de convite PAXMED (vitrine)
  const profs = (await db.execute(sql`SELECT id, email, secondary_email, registration_number, crm, created_at FROM professionals`)).rows as any[];
  const pedidos = (await db.execute(sql`SELECT id, protocolo, nome, email, crm, status, criado_em, atualizado_em FROM vitrine_convites ORDER BY id DESC LIMIT 500`)).rows as any[];
  for (const p of pedidos) {
    const em = String(p.email).toLowerCase().trim();
    const achados = profs.filter((x) => [x.email, x.secondary_email].filter(Boolean).some((e: string) => e.toLowerCase().trim() === em)
      && [x.registration_number, x.crm].some((n: string | null) => digitos(n) !== "" && digitos(n) === digitos(p.crm)));
    const prof = achados.length === 1 ? achados[0] : null;
    const decidido = ["aprovada", "lista_espera", "recusada"].includes(p.status);
    const etapas: Etapa[] = [
      { codigo: "pedido_recebido", rotulo: "Pedido recebido pela vitrine", estado: "comprovado", em: iso(p.criado_em), fonte: "vitrine_convites.criado_em" },
      decidido
        ? { codigo: "decisao_titular", rotulo: `Decisão do titular: ${p.status}`, estado: "comprovado", em: iso(p.atualizado_em), fonte: "vitrine_convites.status", nota: "A data é a da última atualização; o sistema não guarda cada mudança de status." }
        : { codigo: "decisao_titular", rotulo: "Decisão do titular", estado: "pendente", em: null, fonte: "vitrine_convites.status" },
      prof
        ? { codigo: "cadastro_profissional", rotulo: "Cadastro de profissional encontrado", estado: "comprovado", em: iso(prof.created_at), fonte: "professionals", nota: "Mesmo e-mail e mesmo CRM." }
        : { codigo: "cadastro_profissional", rotulo: "Cadastro de profissional", estado: p.status === "aprovada" ? "pendente" : "nao_aplicavel", em: null, fonte: "professionals", nota: achados.length > 1 ? "Mais de um cadastro bate; não vinculado." : undefined },
      prof ? acessoProf(prof.id) : { codigo: "primeiro_acesso", rotulo: "Primeiro acesso ao sistema", estado: "nao_aplicavel", em: null, fonte: "acesso_primeiro_registro" },
    ];
    const pend: string[] = [];
    if (p.status === "recebida" || p.status === "em_analise") pend.push("decidir_pedido");
    if (p.status === "aprovada" && !prof) pend.push("criar_cadastro");
    if (prof && etapas[3].estado === "sem_registro") pend.push("sem_primeiro_acesso");
    itens.push({ chave: `pedido-${p.id}`, tipo: "medico", origem: "pedido_comercial", nome: p.nome, contato: p.email,
      consentimentoContato: "Exigido no envio do formulário (o servidor recusa sem ele); não há campo gravado para conferir.", etapas, pendencias: pend });
  }

  // 2) Convites clínicos (cliente convida médico)
  const convs = (await db.execute(sql`
    SELECT v.id, v.medico_nome, v.medico_email, v.status, v.criado_em, v.expira_em, v.aceito_em, v.acesso_ate, v.aceito_por, v.encerrado_em,
           v.consentimento_em, (v.status='pendente' AND v.expira_em < NOW()) AS vencido, (v.status='aceito' AND v.acesso_ate <= NOW()) AS acesso_fim,
           (SELECT MIN(h.em) FROM paxcare_convites_medico_hist h WHERE h.convite_id=v.id AND h.acao='visualizou') AS visto_em
      FROM paxcare_convites_medico v ORDER BY v.id DESC LIMIT 500`)).rows as any[];
  for (const c of convs) {
    const resp: Etapa = c.status === "aceito"
      ? { codigo: "resposta_medico", rotulo: "Convite aceito pelo médico", estado: "comprovado", em: iso(c.aceito_em), fonte: "paxcare_convites_medico.aceito_em", nota: "Aceite do convite não é primeiro acesso." }
      : c.status === "recusado" ? { codigo: "resposta_medico", rotulo: "Convite recusado pelo médico", estado: "comprovado", em: iso(c.encerrado_em), fonte: "paxcare_convites_medico.encerrado_em" }
      : c.status === "revogado" ? { codigo: "resposta_medico", rotulo: "Convite revogado pelo cliente", estado: "comprovado", em: iso(c.encerrado_em), fonte: "paxcare_convites_medico.encerrado_em" }
      : c.vencido ? { codigo: "resposta_medico", rotulo: "Convite expirou sem resposta", estado: "comprovado", em: iso(c.expira_em), fonte: "paxcare_convites_medico.expira_em" }
      : { codigo: "resposta_medico", rotulo: "Resposta do médico", estado: "pendente", em: null, fonte: "paxcare_convites_medico.status" };
    const etapas: Etapa[] = [
      { codigo: "convite_criado", rotulo: "Convite criado pelo cliente", estado: "comprovado", em: iso(c.criado_em), fonte: "paxcare_convites_medico.criado_em" },
      c.consentimento_em
        ? { codigo: "consentimento_cliente", rotulo: "Consentimento do cliente (termo com código)", estado: "comprovado", em: iso(c.consentimento_em), fonte: "paxcare_convites_medico.consentimento_em" }
        : { codigo: "consentimento_cliente", rotulo: "Consentimento do cliente", estado: "sem_registro", em: null, fonte: "paxcare_convites_medico", nota: "Convite anterior ao registro de consentimento." },
      c.visto_em
        ? { codigo: "convite_aberto", rotulo: "Convite aberto por médico autorizado", estado: "comprovado", em: iso(c.visto_em), fonte: "paxcare_convites_medico_hist" }
        : { codigo: "convite_aberto", rotulo: "Convite aberto por médico autorizado", estado: "pendente", em: null, fonte: "paxcare_convites_medico_hist" },
      resp,
      c.aceito_por ? acessoProf(Number(c.aceito_por)) : { codigo: "primeiro_acesso", rotulo: "Primeiro acesso ao sistema", estado: "nao_aplicavel", em: null, fonte: "acesso_primeiro_registro" },
    ];
    const pend: string[] = [];
    if (c.status === "pendente" && !c.vencido) pend.push("aguardando_medico");
    if (c.vencido) pend.push("convite_expirado");
    if (c.acesso_fim) pend.push("acesso_encerrado");
    if (c.aceito_por && etapas[4].estado === "sem_registro") pend.push("sem_primeiro_acesso");
    itens.push({ chave: `convite-${c.id}`, tipo: "medico", origem: "convite_clinico", nome: c.medico_nome, contato: mascara(c.medico_email),
      consentimentoContato: "O consentimento do cliente cobre só o compartilhamento do cofre; não autoriza mensagem ao médico. O próprio cliente entrega o link.", etapas, pendencias: pend });
  }

  // 3) Clientes
  const fontes: string[] = [`SELECT pessoa_id AS id FROM acesso_primeiro_registro WHERE tipo='cliente'`, `SELECT client_id AS id FROM paxcare_convites_medico`];
  const temOnb = await existe("onboarding_eventos");
  if (temOnb) fontes.push(`SELECT client_id AS id FROM onboarding_eventos WHERE client_id IS NOT NULL`);
  if (await existe("paxcare_cofre_itens")) fontes.push(`SELECT client_id AS id FROM paxcare_cofre_itens`);
  if (await existe("paxcare_vinculos")) fontes.push(`SELECT client_id AS id FROM paxcare_vinculos`);
  const clientes = (await db.execute(sql`
    SELECT c.id, c.name, c.password_hash IS NOT NULL AS tem_senha, c.must_change_password, c.created_at,
           (SELECT COUNT(*)::int FROM paxcare_convites_medico v WHERE v.client_id=c.id) AS convites,
           (SELECT COUNT(*)::int FROM paxcare_convites_medico v WHERE v.client_id=c.id AND v.status='pendente' AND v.expira_em >= NOW()) AS convites_pendentes
      FROM clients c WHERE c.deleted_at IS NULL AND (c.id IN (${sql.raw(fontes.join(" UNION "))}) OR (c.password_hash IS NOT NULL AND c.must_change_password)) ORDER BY c.id DESC LIMIT 500`)).rows as any[];
  const nav = new Map<number, { min: unknown; max: unknown; n: number }>();
  if (temOnb) for (const r of (await db.execute(sql`SELECT client_id, MIN(ts) AS min, MAX(ts) AS max, COUNT(*)::int AS n FROM onboarding_eventos WHERE client_id IS NOT NULL GROUP BY client_id`)).rows as any[]) nav.set(r.client_id, { min: r.min, max: r.max, n: r.n });
  for (const c of clientes) {
    const a = acessos.get(`cliente:${c.id}`); const n = nav.get(c.id);
    const etapas: Etapa[] = [
      { codigo: "cadastro", rotulo: "Cadastro criado", estado: "comprovado", em: iso(c.created_at), fonte: "clients.created_at" },
      !c.tem_senha ? { codigo: "senha_propria", rotulo: "Senha de acesso", estado: "sem_registro", em: null, fonte: "clients.password_hash", nota: "Sem senha cadastrada." }
        : c.must_change_password ? { codigo: "senha_propria", rotulo: "Senha própria definida", estado: "pendente", em: null, fonte: "clients.must_change_password", nota: "Senha provisória ainda ativa." }
        : { codigo: "senha_propria", rotulo: "Senha própria definida", estado: "comprovado", em: null, fonte: "clients.must_change_password", nota: "Estado atual; a data não foi guardada." },
      a ? { codigo: "primeiro_acesso", rotulo: "Primeiro acesso ao sistema", estado: "comprovado", em: iso(a.primeiro), fonte: `acesso_primeiro_registro (${a.origem})`, nota: "Registrado desde a implantação do registro; acessos anteriores não são conhecidos." }
        : { codigo: "primeiro_acesso", rotulo: "Primeiro acesso ao sistema", estado: "sem_registro", em: null, fonte: "acesso_primeiro_registro", nota: SEM_PROVA },
      a ? { codigo: "ultimo_acesso", rotulo: "Último acesso registrado", estado: "comprovado", em: iso(a.ultimo), fonte: "acesso_primeiro_registro", nota: `${a.total} acesso(s) registrado(s).` }
        : { codigo: "ultimo_acesso", rotulo: "Último acesso registrado", estado: "sem_registro", em: null, fonte: "acesso_primeiro_registro" },
      n ? { codigo: "navegacao", rotulo: "Navegação registrada (Guia Digital)", estado: "comprovado", em: iso(n.min), fonte: "onboarding_eventos", nota: `${n.n} evento(s), até ${iso(n.max)}. Evento de navegação não prova o primeiro acesso.` }
        : { codigo: "navegacao", rotulo: "Navegação registrada (Guia Digital)", estado: "sem_registro", em: null, fonte: "onboarding_eventos" },
      c.convites > 0 ? { codigo: "convites_a_medicos", rotulo: `Convites a médicos: ${c.convites}`, estado: "comprovado", em: null, fonte: "paxcare_convites_medico" }
        : { codigo: "convites_a_medicos", rotulo: "Convites a médicos", estado: "nao_aplicavel", em: null, fonte: "paxcare_convites_medico" },
    ];
    const pend: string[] = [];
    if (c.tem_senha && c.must_change_password) pend.push("definir_senha");
    if (!a) pend.push("sem_primeiro_acesso");
    if (c.convites_pendentes > 0) pend.push("convite_pendente");
    itens.push({ chave: `cliente-${c.id}`, tipo: "cliente", origem: "cliente", nome: c.name, contato: null,
      consentimentoContato: "Sem registro de consentimento para mensagens neste módulo; confira no cadastro do cliente antes de qualquer contato.", etapas, pendencias: pend });
  }
  return itens;
}

router.get("/ceo/acolhimento", requireCollaborator, async (req, res): Promise<void> => {
  try {
    if (!(await titular(req, res))) return;
    const q = (k: string) => (typeof req.query[k] === "string" ? String(req.query[k]).trim() : "");
    const tipo = q("tipo"), origem = q("origem"), pendencia = q("pendencia"), etapa = q("etapa"), estado = q("estado"), busca = q("q").toLowerCase();
    if (tipo && !["medico", "cliente"].includes(tipo)) { res.status(400).json({ error: "Tipo inválido." }); return; }
    if (origem && !["pedido_comercial", "convite_clinico", "cliente"].includes(origem)) { res.status(400).json({ error: "Origem inválida." }); return; }
    if (pendencia && !PENDENCIAS[pendencia]) { res.status(400).json({ error: "Pendência inválida." }); return; }
    if (estado && !["comprovado", "pendente", "sem_registro", "nao_aplicavel"].includes(estado)) { res.status(400).json({ error: "Estado inválido." }); return; }
    const todos = await montar();
    const resumo: Record<string, number> = {};
    for (const i of todos) for (const p of i.pendencias) resumo[p] = (resumo[p] ?? 0) + 1;
    const itens = todos.filter((i) => (!tipo || i.tipo === tipo) && (!origem || i.origem === origem) && (!pendencia || i.pendencias.includes(pendencia))
      && (!etapa || i.etapas.some((e) => e.codigo === etapa && (!estado || e.estado === estado)))
      && (!busca || i.nome.toLowerCase().includes(busca) || (i.contato ?? "").toLowerCase().includes(busca)));
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ total: todos.length, resumo, pendencias: PENDENCIAS, itens });
  } catch (err) {
    req.log?.error({ err: String(err) }, "acolhimento listar");
    res.status(500).json({ error: "Não foi possível carregar o acompanhamento." });
  }
});

router.get("/ceo/acolhimento/historico", requireCollaborator, async (req, res): Promise<void> => {
  try {
    if (!(await titular(req, res))) return;
    const m = /^(pedido|convite|cliente)-(\d{1,9})$/.exec(String(req.query.chave ?? ""));
    if (!m) { res.status(400).json({ error: "Chave inválida." }); return; }
    const id = Number(m[2]);
    await garantirTabelaAcesso(); await garantirTabelaConvites(); await garantirTabelasConviteMedico();
    const ev: { em: string | null; evento: string; fonte: string }[] = [];
    let nota = "";
    if (m[1] === "pedido") {
      const p = (await db.execute(sql`SELECT status, criado_em, atualizado_em FROM vitrine_convites WHERE id=${id}`)).rows[0] as any;
      if (!p) { res.status(404).json({ error: "Não encontrado." }); return; }
      ev.push({ em: iso(p.criado_em), evento: "Pedido recebido", fonte: "vitrine_convites" });
      if (iso(p.atualizado_em) !== iso(p.criado_em)) ev.push({ em: iso(p.atualizado_em), evento: `Última atualização (status: ${p.status})`, fonte: "vitrine_convites" });
      nota = "O sistema não guarda uma linha por mudança de status do pedido; só a data da última atualização.";
    } else if (m[1] === "convite") {
      const c = (await db.execute(sql`SELECT criado_em, consentimento_em FROM paxcare_convites_medico WHERE id=${id}`)).rows[0] as any;
      if (!c) { res.status(404).json({ error: "Não encontrado." }); return; }
      ev.push({ em: iso(c.criado_em), evento: "criou", fonte: "paxcare_convites_medico" });
      for (const h of (await db.execute(sql`SELECT acao, em FROM paxcare_convites_medico_hist WHERE convite_id=${id} ORDER BY id`)).rows as any[]) ev.push({ em: iso(h.em), evento: h.acao, fonte: "paxcare_convites_medico_hist" });
    } else {
      const a = (await db.execute(sql`SELECT primeiro_em, ultimo_em, total, primeira_origem FROM acesso_primeiro_registro WHERE tipo='cliente' AND pessoa_id=${id}`)).rows[0] as any;
      if (a) { ev.push({ em: iso(a.primeiro_em), evento: `Primeiro acesso registrado (${a.primeira_origem})`, fonte: "acesso_primeiro_registro" }); if (a.total > 1) ev.push({ em: iso(a.ultimo_em), evento: `Último acesso registrado (${a.total} no total)`, fonte: "acesso_primeiro_registro" }); }
      for (const h of (await db.execute(sql`SELECT h.acao, h.em, h.convite_id FROM paxcare_convites_medico_hist h JOIN paxcare_convites_medico v ON v.id=h.convite_id WHERE v.client_id=${id} ORDER BY h.id`)).rows as any[]) ev.push({ em: iso(h.em), evento: `Convite ${h.convite_id}: ${h.acao}`, fonte: "paxcare_convites_medico_hist" });
      nota = "Só aparecem eventos gravados. Ausência de evento não prova que algo não aconteceu.";
    }
    ev.sort((x, y) => String(y.em).localeCompare(String(x.em)));
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ eventos: ev, nota });
  } catch (err) {
    req.log?.error({ err: String(err) }, "acolhimento historico");
    res.status(500).json({ error: "Não foi possível carregar o histórico." });
  }
});

// Modelos de texto para ação MANUAL. A assinatura vem do catálogo da Carta de Encantamento (categoria ASSINATURA).
const MODELOS = [
  { codigo: "medico_pedido_recebido", publico: "medico", titulo: "Pedido recebido", texto: "Olá, {{nome}}. Recebemos o seu pedido de convite ao PAXMED. Estamos analisando e voltamos a falar com você." },
  { codigo: "medico_aprovado", publico: "medico", titulo: "Pedido aprovado", texto: "Olá, {{nome}}. Seu pedido foi aprovado. O próximo passo é concluir o seu cadastro de acesso; avisaremos quando estiver pronto." },
  { codigo: "medico_convite_paciente", publico: "medico", titulo: "Convite de paciente aguardando", texto: "Olá, {{nome}}. Um paciente indicou você no PaxCare. O link do convite foi entregue pelo próprio paciente; ao abri-lo você confere o que foi liberado e decide aceitar ou recusar." },
  { codigo: "cliente_boas_vindas", publico: "cliente", titulo: "Boas-vindas", texto: "Olá, {{nome}}. Seu acesso ao aplicativo está disponível. Qualquer dúvida na primeira entrada, é só responder esta mensagem." },
  { codigo: "cliente_definir_senha", publico: "cliente", titulo: "Definir senha própria", texto: "Olá, {{nome}}. Falta definir a sua senha própria para continuar usando o aplicativo. Ao entrar, o aplicativo pedirá a troca." },
  { codigo: "cliente_convite_medico", publico: "cliente", titulo: "Convite a médico sem resposta", texto: "Olá, {{nome}}. O convite que você fez ao seu médico ainda não foi respondido. Se preferir, você pode retirá-lo na aba PaxCare do aplicativo." },
] as const;

router.get("/ceo/acolhimento/modelos", requireCollaborator, async (req, res): Promise<void> => {
  try {
    if (!(await titular(req, res))) return;
    let assinatura: string | null = null;
    try {
      const r = (await db.execute(sql`SELECT conteudo FROM mensagens_catalogo WHERE categoria='ASSINATURA' AND ativo=true ORDER BY ordem LIMIT 1`)).rows[0] as { conteudo?: Record<string, string> } | undefined;
      const c = r?.conteudo;
      if (c) assinatura = [c.saudacao_fechamento, c.nome, c.papel].filter(Boolean).join("\n");
    } catch { /* catálogo ausente: segue sem assinatura */ }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ modelos: MODELOS, assinatura, aviso: "Texto para ação manual. Nada é enviado por esta tela." });
  } catch (err) {
    req.log?.error({ err: String(err) }, "acolhimento modelos");
    res.status(500).json({ error: "Não foi possível carregar os modelos." });
  }
});

export default router;
