import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { brtISODate, parseBrtParts } from "./brt.js";
import { EquipeErro, dataValida, type Participante } from "./equipe-reserva.js";
import { criarBuscador, minutosDe, type Buscador, type Ocupado, type OcupadoPaciente } from "./pit-stop-busca.js";
import {
  MOTIVO_ENCAIXE, auditarPlano, baseNominal, equipeDoItem, exigirRevisorTx, preferenciasDoCliente, proporDatas, renovar,
  tipoPreferenciaDoItem,
} from "./pit-stop.js";
import {
  TOLERANCIA_DIAS, avaliarOcorrencia, dataNominal, diferencaDias, intervaloMinimo, janelaDaSessao, maiorData, ordenarVagas,
  rankPreferencia, somarDias, type Avaliacao,
} from "./pit-stop-regras.js";

/**
 * PIT STOP, redistribuição pós-distribuição: mover uma ocorrência (prévia + gravação) e encaixar a 1ª sessão no término
 * da consulta. Tudo aqui altera só o PLANO (prévia persistente). Nada é reservado, nenhuma visita já reservada é tocada
 * e nenhum evento do Google é criado ou movido: reserva e Google continuam só na confirmação explícita do plano.
 * O navegador envia apenas data e hora desejadas; disponibilidade, equipe, intervalos e conflitos são decididos aqui.
 */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Aviso = { code: string; message: string };
export type VagaAlternativa = { date: string; time: string; rank: number | null; diferenca: number; agendas: string[] };
export type ImpactoSeguinte = {
  ocorrenciaId: number; numero: number; data: string | null; hora: string | null; origem: string; reservada: boolean;
  intervaloDepoisDoMovimento: number | null; abaixoDoMinimo: boolean; seraRecalculada: boolean;
};
export type PreviaMover = {
  ocorrenciaId: number; itemId: number; itemNome: string; numero: number;
  de: { data: string | null; hora: string | null }; para: { data: string; hora: string };
  podeMover: boolean; exigeAceite: boolean; bloqueios: Aviso[]; avisos: Aviso[];
  avaliacao: Avaliacao; rankPreferencia: number | null; impacto: ImpactoSeguinte[]; alternativas: VagaAlternativa[];
  /** Horários livres da equipe completa NO DIA escolhido (para o usuário trocar a hora sem tentar às cegas). */
  vagasDoDia: { time: string; agendas: string[] }[];
};

type Linha = { id: number; item: number; numero: number; data: string | null; hora: string | null; origem: string; motivo: string | null; reservada: boolean };

async function carregarContexto(empresaId: number, planoId: number, ocId: number) {
  const pl = (await db.execute(sql`SELECT id, estado, client_id, created_at FROM agendamento_planos WHERE id=${planoId} AND empresa_id=${empresaId}`)).rows[0];
  if (!pl) throw new EquipeErro(404, "Plano não encontrado.", "plano_nao_encontrado");
  const linhas: Linha[] = (await db.execute(sql`SELECT o.id, o.protocolo_procedimento_id AS item, o.numero, o.data, o.hora, o.origem, o.motivo,
      (o.ocorrencia_id IS NOT NULL) AS reservada FROM agendamento_plano_ocorrencias o WHERE o.plano_id=${planoId} ORDER BY o.protocolo_procedimento_id, o.numero`))
    .rows.map((o) => ({ id: Number(o.id), item: Number(o.item), numero: Number(o.numero), data: o.data == null ? null : String(o.data),
      hora: o.hora == null ? null : String(o.hora), origem: String(o.origem), motivo: o.motivo == null ? null : String(o.motivo), reservada: o.reservada === true }));
  const alvo = linhas.find((l) => l.id === ocId);
  if (!alvo) throw new EquipeErro(404, "Ocorrência não encontrada neste plano.", "ocorrencia_nao_encontrada");
  const it = (await db.execute(sql`SELECT pp.id, pp.nome_snapshot, pp.total_sessoes, pp.intervalo_dias, pp.data_inicio, pp.duracao_segundos
    FROM protocolo_procedimentos pp WHERE pp.id=${alvo.item} AND pp.empresa_id=${empresaId}`)).rows[0];
  if (!it) throw new EquipeErro(404, "Procedimento não encontrado neste plano.", "item_nao_encontrado");
  const duracoes = new Map<number, number>((await db.execute(sql`SELECT id, duracao_segundos FROM protocolo_procedimentos
    WHERE id IN (SELECT DISTINCT protocolo_procedimento_id FROM agendamento_plano_ocorrencias WHERE plano_id=${planoId})`))
    .rows.map((r) => [Number(r.id), Number(r.duracao_segundos)]));
  const equipes = new Map<number, number[]>();
  for (const itemId of new Set(linhas.map((l) => l.item))) {
    equipes.set(itemId, (await equipeDoItem(db, itemId)).map((e) => e.participante.agendaId).filter((v): v is number => v != null));
  }
  return { plano: pl, alvo, linhas, item: it, duracoes, equipes, empresaId, planoId };
}
type Contexto = Awaited<ReturnType<typeof carregarContexto>>;

/** Ocupação das DEMAIS ocorrências do plano (com data), para a nova data não sobrepor propostas do próprio plano. */
function ocupacaoDoPlano(ctx: Contexto, excluirId: number) {
  const ocupados: Ocupado[] = [];
  const paciente: OcupadoPaciente[] = [];
  for (const l of ctx.linhas) {
    if (l.id === excluirId || !l.data || !l.hora) continue;
    const ini = minutosDe(l.hora), fim = ini + Math.ceil((ctx.duracoes.get(l.item) ?? 0) / 60);
    paciente.push({ date: l.data, ini, fim });
    for (const resourceId of ctx.equipes.get(l.item) ?? []) ocupados.push({ resourceId, professionalId: null, date: l.data, ini, fim });
  }
  return { ocupados, paciente };
}

async function equipeEBusca(ctx: Contexto, origem: string, semAntecedencia: boolean) {
  const equipe = (await equipeDoItem(db, ctx.alvo.item)).map((e) => e.participante);
  const busca = criarBuscador({ empresaId: ctx.empresaId, equipe, duracaoSegundos: Number(ctx.item.duracao_segundos), origem, semAntecedencia });
  return { equipe, busca };
}

type Destino = {
  bloqueios: Aviso[]; avisos: Aviso[]; avaliacao: Avaliacao; rankPref: number | null; impacto: ImpactoSeguinte[]; exigeAceite: boolean;
};

/** Regras duras (bloqueiam) e brandas (avisam) para pôr a ocorrência em data/hora. Disponibilidade é lida do servidor. */
async function avaliarDestino(ctx: Contexto, data: string, hora: string, busca: Buscador, equipe: Participante[]): Promise<Destino> {
  const bloqueios: Aviso[] = [];
  const avisos: Aviso[] = [];
  const { alvo, linhas, item } = ctx;
  const freq = Number(item.intervalo_dias);
  const minimo = intervaloMinimo(freq);
  const hoje = brtISODate();

  if (!dataValida(data) || !HHMM.test(hora)) {
    bloqueios.push({ code: "data_invalida", message: "Data ou horário inválido." });
  } else if (data < hoje) {
    bloqueios.push({ code: "data_passada", message: "Não é possível agendar em data passada." });
  }
  const estadoPlano = String(ctx.plano.estado);
  if (estadoPlano === "confirmado" || estadoPlano === "cancelado") {
    bloqueios.push({ code: "plano_encerrado", message: estadoPlano === "confirmado" ? "Este plano já foi confirmado." : "Este plano foi cancelado." });
  }
  if (alvo.reservada) {
    bloqueios.push({ code: "ocorrencia_ja_reservada",
      message: "Esta visita já está reservada. Mover uma visita reservada é uma operação à parte; nada foi alterado." });
  }

  const doItem = linhas.filter((l) => l.item === alvo.item).sort((a, b) => a.numero - b.numero);
  const anterior = [...doItem].reverse().find((l) => l.numero < alvo.numero && l.data) ?? null;
  const base = baseNominal(item.data_inicio, ctx.plano.created_at);
  const nominal = dataNominal(base, alvo.numero, freq);
  const avaliacao = avaliarOcorrencia({ nominal, data: dataValida(data) ? data : null, anteriorData: anterior?.data ?? null, frequenciaDias: freq });

  // Disponibilidade da EQUIPE COMPLETA (todas as agendas) e choque com as outras propostas do plano.
  if (!bloqueios.length) {
    try {
      const livre = (await busca.vagas(data, data, [], [])).find((v) => v.time === hora);
      if (!livre) {
        bloqueios.push({ code: "horario_indisponivel", message: "Este horário não está livre para a equipe completa (agenda, profissional ou janela de atendimento)." });
      } else {
        const { ocupados, paciente } = ocupacaoDoPlano(ctx, alvo.id);
        if (busca.choca(livre, ocupados, paciente)) {
          bloqueios.push({ code: "conflito_no_plano", message: "Este horário colide com outra visita deste mesmo plano (equipe ou paciente)." });
        }
        const cliente = await db.execute(sql`SELECT 1 FROM sessions WHERE client_id=${Number(ctx.plano.client_id)} AND scheduled_date=${data}
          AND scheduled_time=${hora} AND status IN ('scheduled','confirmed') AND NOT agenda_archived LIMIT 1`);
        if (cliente.rows.length) bloqueios.push({ code: "cliente_ocupado", message: "O paciente já tem uma visita neste horário." });
      }
    } catch (e) {
      if (!(e instanceof EquipeErro)) throw e;
      bloqueios.push({ code: e.code, message: e.message });
    }
  }

  // Intervalos: anterior e seguintes do MESMO procedimento.
  if (dataValida(data)) {
    if (anterior?.data) {
      const dif = diferencaDias(data, anterior.data);
      if (dif < 0) bloqueios.push({ code: "fora_de_ordem", message: `A sessão ${alvo.numero} não pode ficar antes da sessão ${anterior.numero} (${anterior.data}).` });
      else if (dif < minimo) {
        bloqueios.push({ code: "abaixo_do_minimo", message: `Intervalo de ${dif} dia(s) desde a sessão ${anterior.numero}; o mínimo deste procedimento é ${minimo}.` });
      }
    }
  }
  const impacto: ImpactoSeguinte[] = [];
  let referencia: string | null = dataValida(data) ? data : null;
  let primeiraComData = true;
  for (const l of doItem.filter((x) => x.numero > alvo.numero)) {
    const dif = l.data && referencia ? diferencaDias(l.data, referencia) : null;
    // Só a PRIMEIRA seguinte depende deste movimento; as demais mantêm os intervalos que já tinham entre si.
    const abaixo = primeiraComData && dif !== null && dif < minimo;
    const recalcula = l.origem === "automatica" && !l.reservada;
    impacto.push({ ocorrenciaId: l.id, numero: l.numero, data: l.data, hora: l.hora, origem: l.origem, reservada: l.reservada,
      intervaloDepoisDoMovimento: dif, abaixoDoMinimo: abaixo, seraRecalculada: recalcula });
    if (abaixo && !recalcula) {
      bloqueios.push({ code: "proxima_abaixo_do_minimo",
        message: `A sessão ${l.numero} (${l.data}, ${l.origem === "manual" ? "escolhida por você" : "já reservada"}) ficaria ${dif} dia(s) depois; o mínimo é ${minimo}. Mova-a antes.` });
    }
    if (l.data) { referencia = l.data; primeiraComData = false; }
  }
  if (impacto.some((i) => i.seraRecalculada)) {
    avisos.push({ code: "seguintes_serao_recalculadas", message: "As próximas propostas automáticas deste procedimento serão recalculadas a partir da nova data; as que você escolheu não mudam." });
  }

  const foraDaJanela = avaliacao.foraDaJanela;
  if (foraDaJanela && avaliacao.diferencaDias !== null) {
    const d = avaliacao.diferencaDias;
    avisos.push({ code: "fora_da_janela",
      message: `${Math.abs(d)} dia(s) ${d < 0 ? "antes" : "depois"} da data nominal (${nominal}); a janela do protocolo é de ${TOLERANCIA_DIAS} dias para mais ou para menos. Exige aceite explícito.` });
  }
  const tipo = await tipoPreferenciaDoItem(db, equipe);
  const prefs = await preferenciasDoCliente(ctx.empresaId, Number(ctx.plano.client_id));
  const rankPref = dataValida(data) && HHMM.test(hora) ? rankPreferencia(prefs[tipo], data, hora) ?? null : null;
  if (rankPref === null && (prefs[tipo]?.weekdays?.length ?? 0) > 0) {
    avisos.push({ code: "fora_da_preferencia", message: "Dia ou horário fora da preferência cadastrada pelo paciente." });
  }
  return { bloqueios, avisos, avaliacao, rankPref, impacto, exigeAceite: foraDaJanela };
}

/** Prévia SOMENTE LEITURA: valida o destino e mostra impacto nas próximas e alternativas legais. Não grava nada. */
export async function previaMover(empresaId: number, planoId: number, ocId: number, data: string, hora: string): Promise<PreviaMover> {
  const ctx = await carregarContexto(empresaId, planoId, ocId);
  const hoje = brtISODate();
  const { equipe, busca } = await equipeEBusca(ctx, dataValida(data) ? maiorData(data, hoje) : hoje, false);
  const d = await avaliarDestino(ctx, data, hora, busca, equipe);

  const vagasDoDia: PreviaMover["vagasDoDia"] = [];
  if (dataValida(data) && data >= hoje) {
    try {
      const { ocupados, paciente } = ocupacaoDoPlano(ctx, ctx.alvo.id);
      for (const v of await busca.vagas(data, data, [], [])) {
        if (busca.choca(v, ocupados, paciente)) continue;
        vagasDoDia.push({ time: v.time, agendas: [...new Set((v.parts as { agenda?: string }[]).map((p) => String(p.agenda ?? "")).filter(Boolean))] });
        if (vagasDoDia.length >= 24) break;
      }
    } catch (e) {
      if (!(e instanceof EquipeErro)) throw e; // equipe pendente: o bloqueio já explica
    }
  }

  // Alternativas: dentro da janela nominal ±4, respeitando mínimo da anterior e da próxima reservada/escolhida.
  const alternativas: VagaAlternativa[] = [];
  try {
    const freq = Number(ctx.item.intervalo_dias), minimo = intervaloMinimo(freq);
    const doItem = ctx.linhas.filter((l) => l.item === ctx.alvo.item).sort((a, b) => a.numero - b.numero);
    const anterior = [...doItem].reverse().find((l) => l.numero < ctx.alvo.numero && l.data) ?? null;
    const proxFixa = doItem.find((l) => l.numero > ctx.alvo.numero && l.data && (l.reservada || l.origem === "manual")) ?? null;
    const nominal = dataNominal(baseNominal(ctx.item.data_inicio, ctx.plano.created_at), ctx.alvo.numero, freq);
    const j = janelaDaSessao(nominal, hoje, anterior?.data ? somarDias(anterior.data, minimo) : null);
    const ate = proxFixa?.data ? (somarDias(proxFixa.data, -minimo) < j.ate ? somarDias(proxFixa.data, -minimo) : j.ate) : j.ate;
    if (j.de <= ate) {
      const buscaJanela = criarBuscador({ empresaId, equipe, duracaoSegundos: Number(ctx.item.duracao_segundos), origem: j.de });
      const { ocupados, paciente } = ocupacaoDoPlano(ctx, ctx.alvo.id);
      const prefs = await preferenciasDoCliente(empresaId, Number(ctx.plano.client_id));
      const pref = prefs[await tipoPreferenciaDoItem(db, equipe)];
      const vagas = await buscaJanela.vagas(j.de, ate, ocupados, paciente, null);
      for (const v of ordenarVagas(vagas, nominal, pref)) {
        if (v.date === data && v.time === hora) continue;
        alternativas.push({ date: v.date, time: v.time, rank: v.rank, diferenca: v.diferenca,
          agendas: [...new Set((v.parts as { agenda?: string }[]).map((p) => String(p.agenda ?? "")).filter(Boolean))] });
        if (alternativas.length >= 6) break;
      }
    }
  } catch (e) {
    if (!(e instanceof EquipeErro)) throw e; // equipe pendente: o bloqueio já explica; sem alternativas inventadas
  }
  return {
    ocorrenciaId: ctx.alvo.id, itemId: ctx.alvo.item, itemNome: String(ctx.item.nome_snapshot), numero: ctx.alvo.numero,
    de: { data: ctx.alvo.data, hora: ctx.alvo.hora }, para: { data, hora },
    podeMover: d.bloqueios.length === 0, exigeAceite: d.exigeAceite, bloqueios: d.bloqueios, avisos: d.avisos,
    avaliacao: d.avaliacao, rankPreferencia: d.rankPref, impacto: d.impacto, alternativas, vagasDoDia,
  };
}

function recusarPrevia(p: { bloqueios: Aviso[]; alternativas?: VagaAlternativa[] }): never {
  const b = p.bloqueios[0];
  throw new EquipeErro(422, b.message, b.code, { bloqueios: p.bloqueios, alternativas: p.alternativas ?? [] });
}

/**
 * Move UMA ocorrência do plano. O revisor e a versão são conferidos sob bloqueio da linha do plano e a validação roda
 * depois disso, então dois movimentos simultâneos nunca passam juntos. Se algo falha, o plano continua exatamente como estava.
 */
export async function moverOcorrencia(empresaId: number, planoId: number, me: number, versao: number, ocId: number,
  data: string, hora: string, aceitarForaDaJanela: boolean) {
  let itemId = 0;
  await db.transaction(async (tx) => {
    await exigirRevisorTx(tx, empresaId, planoId, me, versao);
    const previa = await previaMover(empresaId, planoId, ocId, data, hora);
    if (!previa.podeMover) recusarPrevia(previa);
    if (previa.exigeAceite && !aceitarForaDaJanela) {
      throw new EquipeErro(422, "A nova data fica fora da janela de 4 dias. Confirme o aceite para continuar.", "fora_da_janela_exige_aceite",
        { bloqueios: [], avisos: previa.avisos, alternativas: previa.alternativas });
    }
    const r = await tx.execute(sql`UPDATE agendamento_plano_ocorrencias SET data=${data}, hora=${hora}, origem='manual', motivo=NULL
      WHERE id=${ocId} AND plano_id=${planoId} AND ocorrencia_id IS NULL RETURNING protocolo_procedimento_id AS item`);
    if (!r.rows.length) throw new EquipeErro(404, "Ocorrência não encontrada neste plano.", "ocorrencia_nao_encontrada");
    itemId = Number(r.rows[0].item);
    await auditarPlano(tx, empresaId, planoId, me, "moveu_ocorrencia", {
      ocorrenciaId: ocId, numero: previa.numero, de: previa.de, para: previa.para, foraDaJanelaAceito: previa.exigeAceite && aceitarForaDaJanela,
    });
    await renovar(tx, planoId);
  });
  await proporDatas(planoId, itemId);
}

/** HH:MM atual de Brasília (única fonte de hora: lib/brt). */
export function horaAtualBrt(): string {
  const p = parseBrtParts();
  return `${p.hour}:${p.minute}`;
}

/**
 * Encaixa a 1ª sessão do procedimento HOJE, a partir do término da consulta (`horaTermino`, padrão = agora em Brasília),
 * na primeira vaga livre da EQUIPE COMPLETA. Só este caminho dispensa a antecedência mínima, e só para a data de hoje;
 * a marca fica no plano e é reaplicada na confirmação. Sem vaga hoje: nada é alterado e voltam alternativas reais.
 */
export async function encaixarPrimeiraSessao(empresaId: number, planoId: number, me: number, versao: number, itemId: number,
  horaTermino: string | undefined, aceitarForaDaJanela: boolean) {
  const termino = horaTermino ?? horaAtualBrt();
  if (!HHMM.test(termino)) throw new EquipeErro(400, "Horário de término inválido.", "data_invalida");
  const primeira = (await db.execute(sql`SELECT id FROM agendamento_plano_ocorrencias WHERE plano_id=${planoId}
    AND protocolo_procedimento_id=${itemId} AND numero=1`)).rows[0];
  if (!primeira) throw new EquipeErro(404, "Procedimento não encontrado neste plano.", "item_nao_encontrado");
  const hoje = brtISODate();
  let escolhido: { date: string; time: string } | null = null;
  await db.transaction(async (tx) => {
    await exigirRevisorTx(tx, empresaId, planoId, me, versao);
    const ctx = await carregarContexto(empresaId, planoId, Number(primeira.id));
    const { equipe, busca } = await equipeEBusca(ctx, hoje, true);
    const { ocupados, paciente } = ocupacaoDoPlano(ctx, ctx.alvo.id);
    let candidatas: Awaited<ReturnType<Buscador["vagas"]>>;
    try {
      candidatas = (await busca.vagas(hoje, hoje, ocupados, paciente, null)).filter((v) => v.time >= termino).sort((a, b) => a.time.localeCompare(b.time));
    } catch (e) {
      if (!(e instanceof EquipeErro)) throw e;
      throw new EquipeErro(422, e.message, e.code, e.detalhes);
    }
    for (const v of candidatas) {
      const d = await avaliarDestino(ctx, v.date, v.time, busca, equipe);
      if (d.bloqueios.length) continue; // ex.: paciente com outra visita nesse horário: tenta a próxima vaga
      if (d.exigeAceite && !aceitarForaDaJanela) {
        throw new EquipeErro(422, "Hoje fica fora da janela de 4 dias da primeira sessão. Confirme o aceite para encaixar.", "fora_da_janela_exige_aceite",
          { bloqueios: [], avisos: d.avisos, alternativas: [] });
      }
      escolhido = { date: v.date, time: v.time };
      break;
    }
    if (!escolhido) {
      const futuras = await criarBuscador({ empresaId, equipe, duracaoSegundos: Number(ctx.item.duracao_segundos), origem: hoje })
        .vagas(hoje, somarDias(hoje, TOLERANCIA_DIAS), ocupados, paciente, null);
      throw new EquipeErro(409, `Não há vaga livre hoje a partir de ${termino} para a equipe completa. Nada foi alterado.`, "sem_vaga_no_termino",
        { bloqueios: [], alternativas: futuras.slice(0, 6).map((v) => ({ date: v.date, time: v.time, rank: null, diferenca: 0,
          agendas: [...new Set((v.parts as { agenda?: string }[]).map((p) => String(p.agenda ?? "")).filter(Boolean))] })) });
    }
    const r = await tx.execute(sql`UPDATE agendamento_plano_ocorrencias SET data=${escolhido.date}, hora=${escolhido.time}, origem='manual', motivo=${MOTIVO_ENCAIXE}
      WHERE id=${ctx.alvo.id} AND plano_id=${planoId} AND ocorrencia_id IS NULL RETURNING id`);
    if (!r.rows.length) throw new EquipeErro(409, "A primeira sessão já está reservada; não há o que encaixar.", "ocorrencia_ja_reservada");
    await auditarPlano(tx, empresaId, planoId, me, "encaixou_primeira_sessao", { itemId, horaTermino: termino, data: escolhido.date, hora: escolhido.time });
    await renovar(tx, planoId);
  });
  await proporDatas(planoId, itemId);
  return escolhido as { date: string; time: string } | null;
}
