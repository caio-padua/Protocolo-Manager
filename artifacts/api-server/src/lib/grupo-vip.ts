import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { auditarBolao, listarParticipacoesDoCliente, type ParticipacaoCliente } from "./boloes";

/**
 * Grupo VIP + Conexao Milionaria: adesao voluntaria, convites, entrada em boloes, escolha de jogos,
 * acompanhamento de cobranca Asaas (SOMENTE LEITURA do livro financeiro) e natureza do comprovante.
 *
 * Regras que este arquivo preserva:
 * - O Grupo VIP NAO le nem grava categoria comercial (Prata, Ouro, Platinum, Diamond).
 * - Toda consulta amarra cliente e clinica pelo cadastro do proprio cliente (nunca por corpo de requisicao).
 * - Nada aqui cobra, chama o Asaas, chama a CAIXA, envia mensagem, compra ou aposta.
 * - Jogo escolhido NUNCA e "efetivado" sem comprovante oficial ativo.
 */

const rows = (r: unknown): any[] => (r as { rows: any[] }).rows;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AtorVip { texto: string; profissionalId: number | null }

export type StatusMembro = "convidado" | "ativo" | "recusou" | "saiu";
export type StatusCampanha = "rascunho" | "aberto" | "encerrado";
export type NaturezaComprovante = "nominativo" | "cota_oficial_individual";

async function clienteBasico(tx: Pick<typeof db, "execute">, clientId: number): Promise<{ id: number; empresaId: number } | null> {
  const r = rows(await tx.execute(sql`SELECT id, empresa_id FROM clients WHERE id = ${clientId} AND deleted_at IS NULL`))[0];
  return r && r.empresa_id != null ? { id: r.id, empresaId: r.empresa_id } : null;
}

// ---------------------------------------------------------------- grupo: convite e adesao voluntaria
export type ResultadoConvite = { ok: true } | { ok: false; motivo: "cliente_inexistente" | "ja_convidado" | "ja_ativo" | "campanha_indisponivel" | "nao_membro" | "ja_participa" };

/** A clinica convida. Reconvidar so e possivel para quem recusou ou saiu. Nada e enviado ao cliente por aqui. */
export async function convidarParaGrupo(p: { empresaId: number; clientId: number; ator: AtorVip }): Promise<ResultadoConvite> {
  return db.transaction(async (tx) => {
    const cl = await clienteBasico(tx, p.clientId);
    if (!cl || cl.empresaId !== p.empresaId) return { ok: false, motivo: "cliente_inexistente" } as const;
    const atual = rows(await tx.execute(sql`SELECT status FROM grupo_vip_membros WHERE empresa_id = ${p.empresaId} AND client_id = ${cl.id} FOR UPDATE`))[0];
    if (atual?.status === "ativo") return { ok: false, motivo: "ja_ativo" } as const;
    if (atual?.status === "convidado") return { ok: false, motivo: "ja_convidado" } as const;
    if (atual) {
      await tx.execute(sql`UPDATE grupo_vip_membros SET status = 'convidado', convidado_em = NOW(), respondido_em = NULL, convidado_por = ${p.ator.profissionalId}
                            WHERE empresa_id = ${p.empresaId} AND client_id = ${cl.id}`);
    } else {
      await tx.execute(sql`INSERT INTO grupo_vip_membros (empresa_id, client_id, status, convidado_por) VALUES (${p.empresaId}, ${cl.id}, 'convidado', ${p.ator.profissionalId})`);
    }
    await auditarBolao({ empresaId: p.empresaId, clientId: cl.id, ator: p.ator.texto, acao: "grupo_vip_convite", resultado: "ok" }, tx);
    return { ok: true } as const;
  });
}

export type RespostaGrupo = "aceitar" | "recusar" | "sair";
export type ResultadoResposta = { ok: true; status: StatusMembro } | { ok: false; motivo: "sem_cadastro" | "sem_convite" | "estado_invalido" };

/** Resposta do PROPRIO cliente (portal autenticado). Sair nunca apaga participacoes ou comprovantes ja existentes. */
export async function responderGrupo(clientId: number, acao: RespostaGrupo): Promise<ResultadoResposta> {
  return db.transaction(async (tx) => {
    const cl = await clienteBasico(tx, clientId);
    if (!cl) return { ok: false, motivo: "sem_cadastro" } as const;
    const m = rows(await tx.execute(sql`SELECT status FROM grupo_vip_membros WHERE empresa_id = ${cl.empresaId} AND client_id = ${cl.id} FOR UPDATE`))[0];
    if (!m) return { ok: false, motivo: "sem_convite" } as const;
    const de: StatusMembro = m.status;
    const para: StatusMembro | null = acao === "aceitar" && de === "convidado" ? "ativo" : acao === "recusar" && de === "convidado" ? "recusou" : acao === "sair" && de === "ativo" ? "saiu" : null;
    if (!para) return { ok: false, motivo: "estado_invalido" } as const;
    await tx.execute(sql`UPDATE grupo_vip_membros SET status = ${para}, respondido_em = NOW() WHERE empresa_id = ${cl.empresaId} AND client_id = ${cl.id}`);
    await auditarBolao({ empresaId: cl.empresaId, clientId: cl.id, ator: `cliente:${cl.id}`, acao: `grupo_vip_${acao}`, resultado: "ok", detalhe: `${de} -> ${para}` }, tx);
    return { ok: true, status: para } as const;
  });
}

export async function statusDoMembro(clientId: number): Promise<StatusMembro | null> {
  const r = rows(await db.execute(sql`
    SELECT m.status FROM clients c JOIN grupo_vip_membros m ON m.client_id = c.id AND m.empresa_id = c.empresa_id
     WHERE c.id = ${clientId} AND c.deleted_at IS NULL`))[0];
  return (r?.status ?? null) as StatusMembro | null;
}

export async function listarMembros(empresaId: number) {
  return rows(await db.execute(sql`
    SELECT m.id, m.client_id, c.name, m.status, m.convidado_em, m.respondido_em
      FROM grupo_vip_membros m JOIN clients c ON c.id = m.client_id
     WHERE m.empresa_id = ${empresaId} AND c.empresa_id = ${empresaId}
     ORDER BY m.convidado_em DESC, m.id DESC LIMIT 500`))
    .map((x) => ({
      id: x.id as number, cliente: { id: x.client_id as number, nome: (x.name ?? "") as string }, status: x.status as StatusMembro,
      convidadoEm: new Date(x.convidado_em).toISOString(), respondidoEm: x.respondido_em ? new Date(x.respondido_em).toISOString() : null,
    }));
}

// ---------------------------------------------------------------- boloes: regras, status e convite
export interface RegrasBolao {
  valorCotaCentavos?: number | null; cotasTotal?: number | null; escolhaJogos?: "clinica" | "participante";
  modalidade?: string | null; dezenasPorJogo?: number | null; universoMax?: number; jogosPorCota?: number; regrasTexto?: string | null;
}

export async function aplicarRegras(p: { empresaId: number; campanhaId: number; regras: RegrasBolao; ator: AtorVip }): Promise<boolean> {
  const r = p.regras;
  const res = rows(await db.execute(sql`
    UPDATE boloes_campanhas SET
      valor_cota_centavos = ${r.valorCotaCentavos ?? null}, cotas_total = ${r.cotasTotal ?? null},
      escolha_jogos = ${r.escolhaJogos ?? "clinica"}, modalidade = ${r.modalidade ?? null}, dezenas_por_jogo = ${r.dezenasPorJogo ?? null},
      universo_max = ${r.universoMax ?? 60}, jogos_por_cota = ${r.jogosPorCota ?? 1}, regras_texto = ${r.regrasTexto ?? null}
     WHERE id = ${p.campanhaId} AND empresa_id = ${p.empresaId} AND status = 'rascunho' RETURNING id`));
  if (res.length === 0) return false;
  await auditarBolao({ empresaId: p.empresaId, ator: p.ator.texto, acao: "bolao_regras", resultado: "ok", detalhe: `campanha ${p.campanhaId}` });
  return true;
}

export type ResultadoStatus = { ok: true } | { ok: false; motivo: "inexistente" | "transicao_invalida" | "regras_incompletas" };

export async function mudarStatusCampanha(p: { empresaId: number; campanhaId: number; para: StatusCampanha; ator: AtorVip }): Promise<ResultadoStatus> {
  return db.transaction(async (tx) => {
    const c = rows(await tx.execute(sql`SELECT status, escolha_jogos, dezenas_por_jogo FROM boloes_campanhas WHERE id = ${p.campanhaId} AND empresa_id = ${p.empresaId} FOR UPDATE`))[0];
    if (!c) return { ok: false, motivo: "inexistente" } as const;
    const ok = (c.status === "rascunho" && (p.para === "aberto" || p.para === "encerrado")) || (c.status === "aberto" && p.para === "encerrado");
    if (!ok) return { ok: false, motivo: "transicao_invalida" } as const;
    // Escolha de jogos exige regra de dezenas definida ANTES de abrir.
    if (p.para === "aberto" && c.dezenas_por_jogo == null) return { ok: false, motivo: "regras_incompletas" } as const;
    await tx.execute(sql`UPDATE boloes_campanhas SET status = ${p.para} WHERE id = ${p.campanhaId} AND empresa_id = ${p.empresaId}`);
    await auditarBolao({ empresaId: p.empresaId, ator: p.ator.texto, acao: "bolao_status", resultado: "ok", detalhe: `campanha ${p.campanhaId}: ${c.status} -> ${p.para}` }, tx);
    return { ok: true } as const;
  });
}

/** Convite a um bolao aberto: so para membro ATIVO do grupo, e so se ainda nao participa. */
export async function convidarParaBolao(p: { empresaId: number; campanhaId: number; clientId: number; ator: AtorVip }): Promise<ResultadoConvite> {
  return db.transaction(async (tx) => {
    const cl = await clienteBasico(tx, p.clientId);
    if (!cl || cl.empresaId !== p.empresaId) return { ok: false, motivo: "cliente_inexistente" } as const;
    const ca = rows(await tx.execute(sql`SELECT id FROM boloes_campanhas WHERE id = ${p.campanhaId} AND empresa_id = ${p.empresaId} AND status = 'aberto' FOR UPDATE`))[0];
    if (!ca) return { ok: false, motivo: "campanha_indisponivel" } as const;
    const m = rows(await tx.execute(sql`SELECT status FROM grupo_vip_membros WHERE empresa_id = ${p.empresaId} AND client_id = ${cl.id}`))[0];
    if (m?.status !== "ativo") return { ok: false, motivo: "nao_membro" } as const;
    const part = rows(await tx.execute(sql`SELECT id FROM boloes_participacoes WHERE campanha_id = ${ca.id} AND client_id = ${cl.id}`))[0];
    if (part) return { ok: false, motivo: "ja_participa" } as const;
    const atual = rows(await tx.execute(sql`SELECT status FROM boloes_convites WHERE campanha_id = ${ca.id} AND client_id = ${cl.id} FOR UPDATE`))[0];
    if (atual?.status === "convidado") return { ok: false, motivo: "ja_convidado" } as const;
    if (atual) {
      await tx.execute(sql`UPDATE boloes_convites SET status = 'convidado', convidado_em = NOW(), respondido_em = NULL, convidado_por = ${p.ator.profissionalId} WHERE campanha_id = ${ca.id} AND client_id = ${cl.id}`);
    } else {
      await tx.execute(sql`INSERT INTO boloes_convites (empresa_id, campanha_id, client_id, convidado_por) VALUES (${p.empresaId}, ${ca.id}, ${cl.id}, ${p.ator.profissionalId})`);
    }
    await auditarBolao({ empresaId: p.empresaId, clientId: cl.id, ator: p.ator.texto, acao: "bolao_convite", resultado: "ok", detalhe: `campanha ${ca.id}` }, tx);
    return { ok: true } as const;
  });
}

export async function listarConvitesBolao(empresaId: number) {
  return rows(await db.execute(sql`
    SELECT v.id, v.campanha_id, ca.nome AS campanha, v.client_id, c.name, v.status, v.convidado_em, v.respondido_em
      FROM boloes_convites v
      JOIN boloes_campanhas ca ON ca.id = v.campanha_id AND ca.empresa_id = v.empresa_id
      JOIN clients c ON c.id = v.client_id AND c.empresa_id = v.empresa_id
     WHERE v.empresa_id = ${empresaId} ORDER BY v.convidado_em DESC, v.id DESC LIMIT 500`))
    .map((x) => ({
      id: x.id as number, campanha: { id: x.campanha_id as number, nome: x.campanha as string }, cliente: { id: x.client_id as number, nome: (x.name ?? "") as string },
      status: x.status as string, convidadoEm: new Date(x.convidado_em).toISOString(), respondidoEm: x.respondido_em ? new Date(x.respondido_em).toISOString() : null,
    }));
}

// ---------------------------------------------------------------- portal: boloes disponiveis e entrada voluntaria
export interface BolaoDisponivel {
  id: number; nome: string; concurso: string | null; dataSorteio: string | null; valorCotaCentavos: number | null;
  cotasRestantes: number | null; escolhaJogos: "clinica" | "participante"; modalidade: string | null; dezenasPorJogo: number | null;
  universoMax: number; jogosPorCota: number; regrasTexto: string | null; convite: "convidado" | "aceito" | "recusado" | null; participacaoId: number | null;
}

export async function boloesDisponiveis(clientId: number): Promise<BolaoDisponivel[]> {
  const r = rows(await db.execute(sql`
    SELECT ca.id, ca.nome, ca.concurso, to_char(ca.data_sorteio, 'YYYY-MM-DD') AS data_sorteio, ca.valor_cota_centavos, ca.cotas_total,
           ca.escolha_jogos, ca.modalidade, ca.dezenas_por_jogo, ca.universo_max, ca.jogos_por_cota, ca.regras_texto,
           (SELECT COALESCE(SUM(p2.cotas), 0) FROM boloes_participacoes p2 WHERE p2.campanha_id = ca.id AND p2.status <> 'cancelada') AS cotas_usadas,
           v.status AS convite, p.id AS participacao_id
      FROM clients c
      JOIN grupo_vip_membros m ON m.client_id = c.id AND m.empresa_id = c.empresa_id AND m.status = 'ativo'
      JOIN boloes_campanhas ca ON ca.empresa_id = c.empresa_id AND ca.status = 'aberto'
 LEFT JOIN boloes_convites v ON v.campanha_id = ca.id AND v.client_id = c.id
 LEFT JOIN boloes_participacoes p ON p.campanha_id = ca.id AND p.client_id = c.id
     WHERE c.id = ${clientId} AND c.deleted_at IS NULL
     ORDER BY ca.criado_em DESC, ca.id DESC LIMIT 50`));
  return r.map((x) => ({
    id: x.id, nome: x.nome, concurso: x.concurso ?? null, dataSorteio: x.data_sorteio ?? null, valorCotaCentavos: x.valor_cota_centavos ?? null,
    cotasRestantes: x.cotas_total == null ? null : Math.max(0, x.cotas_total - Number(x.cotas_usadas)),
    escolhaJogos: x.escolha_jogos, modalidade: x.modalidade ?? null, dezenasPorJogo: x.dezenas_por_jogo ?? null, universoMax: x.universo_max,
    jogosPorCota: x.jogos_por_cota, regrasTexto: x.regras_texto ?? null, convite: x.convite ?? null, participacaoId: x.participacao_id ?? null,
  }));
}

export type ResultadoEntrada =
  | { ok: true; participacaoId: number }
  | { ok: false; motivo: "sem_cadastro" | "nao_membro" | "bolao_indisponivel" | "ja_participa" | "sem_cotas" };

/** Entrada VOLUNTARIA do proprio cliente. Nao cobra: so registra a adesao (pendente de registro e sem comprovante). */
export async function entrarNoBolao(p: { clientId: number; campanhaId: number; cotas: number }): Promise<ResultadoEntrada> {
  return db.transaction(async (tx) => {
    const cl = await clienteBasico(tx, p.clientId);
    if (!cl) return { ok: false, motivo: "sem_cadastro" } as const;
    const m = rows(await tx.execute(sql`SELECT status FROM grupo_vip_membros WHERE empresa_id = ${cl.empresaId} AND client_id = ${cl.id}`))[0];
    if (m?.status !== "ativo") return { ok: false, motivo: "nao_membro" } as const;
    // Trava a campanha: duas entradas simultaneas nao estouram o limite de cotas.
    const ca = rows(await tx.execute(sql`SELECT id, cotas_total FROM boloes_campanhas WHERE id = ${p.campanhaId} AND empresa_id = ${cl.empresaId} AND status = 'aberto' FOR UPDATE`))[0];
    if (!ca) return { ok: false, motivo: "bolao_indisponivel" } as const;
    if (rows(await tx.execute(sql`SELECT 1 FROM boloes_participacoes WHERE campanha_id = ${ca.id} AND client_id = ${cl.id}`)).length > 0) return { ok: false, motivo: "ja_participa" } as const;
    if (ca.cotas_total != null) {
      const usadas = Number(rows(await tx.execute(sql`SELECT COALESCE(SUM(cotas), 0) AS n FROM boloes_participacoes WHERE campanha_id = ${ca.id} AND status <> 'cancelada'`))[0].n);
      if (usadas + p.cotas > ca.cotas_total) return { ok: false, motivo: "sem_cotas" } as const;
    }
    const ins = rows(await tx.execute(sql`
      INSERT INTO boloes_participacoes (empresa_id, campanha_id, client_id, cotas, criado_por)
      VALUES (${cl.empresaId}, ${ca.id}, ${cl.id}, ${p.cotas}, NULL) RETURNING id`))[0];
    await tx.execute(sql`UPDATE boloes_convites SET status = 'aceito', respondido_em = NOW() WHERE campanha_id = ${ca.id} AND client_id = ${cl.id} AND status = 'convidado'`);
    await auditarBolao({ empresaId: cl.empresaId, clientId: cl.id, ator: `cliente:${cl.id}`, acao: "participacao_aderida", participacaoId: ins.id, resultado: "ok", detalhe: `campanha ${ca.id}, ${p.cotas} cota(s)` }, tx);
    return { ok: true, participacaoId: ins.id as number } as const;
  });
}

export async function recusarConviteBolao(clientId: number, campanhaId: number): Promise<boolean> {
  const cl = await clienteBasico(db, clientId);
  if (!cl) return false;
  const r = rows(await db.execute(sql`
    UPDATE boloes_convites SET status = 'recusado', respondido_em = NOW()
     WHERE campanha_id = ${campanhaId} AND client_id = ${cl.id} AND empresa_id = ${cl.empresaId} AND status = 'convidado' RETURNING id`));
  if (r.length === 0) return false;
  await auditarBolao({ empresaId: cl.empresaId, clientId: cl.id, ator: `cliente:${cl.id}`, acao: "bolao_convite_recusado", resultado: "ok", detalhe: `campanha ${campanhaId}` });
  return true;
}

// ---------------------------------------------------------------- jogos
export type ErroJogos = "inexistente" | "cancelada" | "bolao_fechado" | "origem_nao_permitida" | "ja_efetivado" | "regras_ausentes" | "quantidade" | "dezenas_invalidas";
export type ResultadoJogos = { ok: true; jogos: number } | { ok: false; motivo: ErroJogos };

/** Valida contra as regras do bolao: quantidade exata, dezenas distintas e dentro do universo. */
export function validarJogos(jogos: unknown, regra: { dezenasPorJogo: number; universoMax: number; esperado: number }): number[][] | null {
  if (!Array.isArray(jogos) || jogos.length !== regra.esperado) return null;
  const out: number[][] = [];
  const vistos = new Set<string>();
  for (const j of jogos) {
    if (!Array.isArray(j) || j.length !== regra.dezenasPorJogo) return null;
    if (!j.every((n) => Number.isInteger(n) && n >= 1 && n <= regra.universoMax)) return null;
    if (new Set(j).size !== j.length) return null;
    const ord = [...(j as number[])].sort((a, b) => a - b);
    const chave = ord.join(",");
    if (vistos.has(chave)) return null;
    vistos.add(chave);
    out.push(ord);
  }
  return out;
}

/**
 * Define o conjunto de jogos de uma participacao. Quem pode escolher segue a regra do bolao:
 * `participante` => so o proprio cliente; `clinica` => so o gestor. Trava com comprovante ativo ou bolao fechado.
 * Escolher jogo NAO registra aposta na CAIXA.
 */
export async function definirJogos(p: {
  participacaoId: number; origem: "participante" | "clinica"; empresaId: number | null; clientId: number | null; jogos: unknown; ator: AtorVip;
}): Promise<ResultadoJogos> {
  return db.transaction(async (tx: Tx) => {
    const x = rows(await tx.execute(sql`
      SELECT p.id, p.empresa_id, p.client_id, p.cotas, p.status, ca.status AS camp_status, ca.escolha_jogos, ca.dezenas_por_jogo, ca.universo_max, ca.jogos_por_cota
        FROM boloes_participacoes p JOIN boloes_campanhas ca ON ca.id = p.campanha_id AND ca.empresa_id = p.empresa_id
       WHERE p.id = ${p.participacaoId} FOR UPDATE OF p`))[0];
    if (!x || (p.empresaId !== null && x.empresa_id !== p.empresaId) || (p.clientId !== null && x.client_id !== p.clientId)) return { ok: false, motivo: "inexistente" } as const;
    if (x.status === "cancelada") return { ok: false, motivo: "cancelada" } as const;
    if (x.camp_status !== "aberto") return { ok: false, motivo: "bolao_fechado" } as const;
    if (x.escolha_jogos !== p.origem) return { ok: false, motivo: "origem_nao_permitida" } as const;
    if (rows(await tx.execute(sql`SELECT 1 FROM boloes_comprovantes WHERE participacao_id = ${x.id} AND revogado_em IS NULL`)).length > 0) return { ok: false, motivo: "ja_efetivado" } as const;
    if (x.dezenas_por_jogo == null) return { ok: false, motivo: "regras_ausentes" } as const;
    const esperado = x.cotas * x.jogos_por_cota;
    const jogos = validarJogos(p.jogos, { dezenasPorJogo: x.dezenas_por_jogo, universoMax: x.universo_max, esperado });
    if (!jogos) {
      const arr = Array.isArray(p.jogos) ? p.jogos : [];
      return { ok: false, motivo: arr.length !== esperado ? "quantidade" : "dezenas_invalidas" } as const;
    }
    await tx.execute(sql`DELETE FROM boloes_jogos WHERE participacao_id = ${x.id}`);
    for (let i = 0; i < jogos.length; i++) {
      const arr = `{${jogos[i]!.join(",")}}`;
      await tx.execute(sql`INSERT INTO boloes_jogos (empresa_id, participacao_id, ordem, dezenas, origem) VALUES (${x.empresa_id}, ${x.id}, ${i + 1}, ${arr}::int[], ${p.origem})`);
    }
    await auditarBolao({ empresaId: x.empresa_id, clientId: x.client_id, ator: p.ator.texto, acao: "jogos_definidos", participacaoId: x.id, resultado: "ok", detalhe: `${jogos.length} jogo(s), origem ${p.origem}` }, tx);
    return { ok: true, jogos: jogos.length } as const;
  });
}

// ---------------------------------------------------------------- cobranca Asaas (somente leitura do livro) e natureza do comprovante
export type EstadoCobranca = "sem_cobranca" | "aguardando" | "confirmado" | "vencido" | "outro" | "indisponivel";
export interface CobrancaVista {
  estado: EstadoCobranca; statusAsaas: string | null; brutoCentavos: number | null; dataPagamento: string | null;
  /** Credito conferido no extrato bancario do Asaas (nao so o status da cobranca). */
  extratoConferido: boolean;
}
const SEM_COBRANCA: CobrancaVista = { estado: "sem_cobranca", statusAsaas: null, brutoCentavos: null, dataPagamento: null, extratoConferido: false };

function estadoDoStatus(s: string | null): EstadoCobranca {
  if (s === "RECEIVED" || s === "RECEIVED_IN_CASH") return "confirmado";
  if (s === "PENDING" || s === "CONFIRMED" || s === "AWAITING_RISK_ANALYSIS") return "aguardando";
  if (s === "OVERDUE") return "vencido";
  return "outro";
}

/** Le o livro financeiro local da clinica. NUNCA chama o Asaas. Cobranca de outra clinica ou sem clinica nao e vista. */
export async function cobrancasDasParticipacoes(empresaId: number, ids: number[]): Promise<Map<number, CobrancaVista>> {
  const out = new Map<number, CobrancaVista>();
  if (ids.length === 0) return out;
  const vinc = rows(await db.execute(sql`SELECT id, asaas_charge_id FROM boloes_participacoes WHERE empresa_id = ${empresaId} AND id = ANY(${`{${ids.join(",")}}`}::int[])`));
  const chaves = vinc.filter((v) => v.asaas_charge_id);
  for (const v of vinc) if (!v.asaas_charge_id) out.set(v.id, SEM_COBRANCA);
  if (chaves.length === 0) return out;
  try {
    const led = rows(await db.execute(sql`
      SELECT charge_id, CASE WHEN deletada IS TRUE THEN 'DELETED' ELSE status_asaas END AS status_asaas, bruto_centavos, data_pagamento, extrato_recebido_centavos
        FROM asaas_cobranca_financeiro WHERE empresa_id = ${empresaId} AND charge_id = ANY(${`{${chaves.map((c) => `"${String(c.asaas_charge_id).replace(/[^A-Za-z0-9_-]/g, "")}"`).join(",")}}`}::text[])`));
    const porCharge = new Map(led.map((l) => [l.charge_id as string, l]));
    for (const v of chaves) {
      const l = porCharge.get(v.asaas_charge_id);
      out.set(v.id, l ? {
        estado: estadoDoStatus(l.status_asaas ?? null), statusAsaas: l.status_asaas ?? null,
        brutoCentavos: l.bruto_centavos ?? null, dataPagamento: l.data_pagamento ? new Date(l.data_pagamento).toISOString().slice(0, 10) : null,
        extratoConferido: l.extrato_recebido_centavos != null,
      } : { ...SEM_COBRANCA, estado: "indisponivel" });
    }
  } catch {
    for (const v of chaves) out.set(v.id, { ...SEM_COBRANCA, estado: "indisponivel" });
  }
  return out;
}

export type ResultadoVinculo = { ok: true } | { ok: false; motivo: "participacao_inexistente" | "cobranca_desconhecida" | "cobranca_em_uso" | "cobranca_de_outro_cliente" | "id_invalido" };

/** Vincula uma cobranca JA existente no livro da clinica. Nao cria cobranca e nao fala com o Asaas. */
export async function vincularCobranca(p: { empresaId: number; participacaoId: number; chargeId: string; ator: AtorVip }): Promise<ResultadoVinculo> {
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(p.chargeId)) return { ok: false, motivo: "id_invalido" };
  return db.transaction(async (tx) => {
    const part = rows(await tx.execute(sql`SELECT id, client_id FROM boloes_participacoes WHERE id = ${p.participacaoId} AND empresa_id = ${p.empresaId} FOR UPDATE`))[0];
    if (!part) return { ok: false, motivo: "participacao_inexistente" } as const;
    let cobranca: any;
    try {
      cobranca = rows(await tx.execute(sql`SELECT origem_tabela, origem_id, deletada FROM asaas_cobranca_financeiro WHERE charge_id = ${p.chargeId} AND empresa_id = ${p.empresaId}`))[0];
    } catch { cobranca = undefined; }
    if (!cobranca || cobranca.deletada === true) return { ok: false, motivo: "cobranca_desconhecida" } as const;
    // A cobranca precisa ser do MESMO cliente da participacao: pagamento de outra pessoa nunca confirma a participacao.
    // Sem titular comprovado no livro (origem diferente de pagamento do cliente), nao vincula (falha fechada).
    const titular = cobranca.origem_tabela === "payments" && cobranca.origem_id
      ? rows(await tx.execute(sql`SELECT client_id FROM payments WHERE id = ${cobranca.origem_id}`))[0]
      : undefined;
    if (!titular || titular.client_id !== part.client_id) return { ok: false, motivo: "cobranca_de_outro_cliente" } as const;
    const uso = rows(await tx.execute(sql`SELECT id FROM boloes_participacoes WHERE empresa_id = ${p.empresaId} AND asaas_charge_id = ${p.chargeId} AND id <> ${part.id}`))[0];
    if (uso) return { ok: false, motivo: "cobranca_em_uso" } as const;
    await tx.execute(sql`UPDATE boloes_participacoes SET asaas_charge_id = ${p.chargeId} WHERE id = ${part.id}`);
    await auditarBolao({ empresaId: p.empresaId, clientId: part.client_id, ator: p.ator.texto, acao: "cobranca_vinculada", participacaoId: part.id, resultado: "ok" }, tx);
    return { ok: true } as const;
  });
}

export async function classificarComprovante(p: { empresaId: number; comprovanteId: number; natureza: NaturezaComprovante; ator: AtorVip }): Promise<boolean> {
  const r = rows(await db.execute(sql`
    UPDATE boloes_comprovantes SET natureza = ${p.natureza}
     WHERE id = ${p.comprovanteId} AND empresa_id = ${p.empresaId} AND revogado_em IS NULL RETURNING id, participacao_id`))[0];
  if (!r) return false;
  await auditarBolao({ empresaId: p.empresaId, ator: p.ator.texto, acao: "comprovante_natureza", participacaoId: r.participacao_id, comprovanteId: r.id, resultado: "ok", detalhe: p.natureza });
  return true;
}

// ---------------------------------------------------------------- visoes enriquecidas
export interface JogoVisto { ordem: number; dezenas: number[]; origem: "participante" | "clinica" }
export interface Extras {
  jogos: JogoVisto[];
  /** Derivado: so existe `efetivado` com comprovante oficial ativo. Sem ele, o jogo e apenas escolhido. */
  situacaoJogos: "sem_jogos" | "escolhido_sem_comprovante" | "efetivado_com_comprovante";
  natureza: NaturezaComprovante | null;
  cobranca: CobrancaVista;
  escolhaJogos: "clinica" | "participante";
  regras: { dezenasPorJogo: number | null; universoMax: number; jogosPorCota: number; esperado: number; bolaoAberto: boolean };
}

export async function extrasDasParticipacoes(empresaId: number, clientId: number | null, ids: number[]): Promise<Map<number, Extras>> {
  const out = new Map<number, Extras>();
  if (ids.length === 0) return out;
  const lista = `{${ids.join(",")}}`;
  const base = rows(await db.execute(sql`
    SELECT p.id, p.cotas, ca.status AS camp_status, ca.escolha_jogos, ca.dezenas_por_jogo, ca.universo_max, ca.jogos_por_cota, co.natureza, co.id AS comp_id
      FROM boloes_participacoes p
      JOIN boloes_campanhas ca ON ca.id = p.campanha_id AND ca.empresa_id = p.empresa_id
 LEFT JOIN boloes_comprovantes co ON co.participacao_id = p.id AND co.revogado_em IS NULL
     WHERE p.empresa_id = ${empresaId} AND p.id = ANY(${lista}::int[]) ${clientId !== null ? sql`AND p.client_id = ${clientId}` : sql``}`));
  const jg = rows(await db.execute(sql`
    SELECT participacao_id, ordem, dezenas, origem FROM boloes_jogos
     WHERE empresa_id = ${empresaId} AND participacao_id = ANY(${lista}::int[]) ORDER BY participacao_id, ordem`));
  const cob = await cobrancasDasParticipacoes(empresaId, base.map((b) => b.id));
  for (const b of base) {
    const jogos: JogoVisto[] = jg.filter((j) => j.participacao_id === b.id).map((j) => ({ ordem: j.ordem, dezenas: j.dezenas as number[], origem: j.origem }));
    out.set(b.id, {
      jogos,
      situacaoJogos: jogos.length === 0 ? "sem_jogos" : b.comp_id ? "efetivado_com_comprovante" : "escolhido_sem_comprovante",
      natureza: (b.natureza ?? null) as NaturezaComprovante | null,
      cobranca: cob.get(b.id) ?? SEM_COBRANCA,
      escolhaJogos: b.escolha_jogos,
      regras: { dezenasPorJogo: b.dezenas_por_jogo ?? null, universoMax: b.universo_max, jogosPorCota: b.jogos_por_cota, esperado: b.cotas * b.jogos_por_cota, bolaoAberto: b.camp_status === "aberto" },
    });
  }
  return out;
}

export type ParticipacaoVip = ParticipacaoCliente & Partial<Extras>;

export async function participacoesDoPortal(clientId: number): Promise<ParticipacaoVip[]> {
  const cl = await clienteBasico(db, clientId);
  if (!cl) return [];
  const base = await listarParticipacoesDoCliente(clientId);
  const extras = await extrasDasParticipacoes(cl.empresaId, cl.id, base.map((b) => b.id));
  return base.map((b) => ({ ...b, ...(extras.get(b.id) ?? {}) }));
}
