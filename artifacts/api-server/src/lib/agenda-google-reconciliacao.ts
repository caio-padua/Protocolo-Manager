import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { carregarCategorias, validarRecursoDeCategoria } from "./agenda-recurso-categoria.js";

/**
 * Reconciliação entre as agendas do Google (conta da clínica) e as agendas do sistema.
 * Identidade = google_calendar_id (estável). O nome vem do Google; o sistema se adapta:
 *   - agenda do sistema com o mesmo identificador e nome diferente  -> RENOMEIA (agenda e local ligado);
 *   - calendário do Google reconhecido e sem nenhuma agenda no sistema -> CRIA a agenda (só no cadastro; nenhum evento);
 *   - tudo o mais (pessoal, aniversários, geral, outra empresa, forma divergente, nome igual sem vínculo) -> só RELATA.
 * Nunca apaga, funde nem desliga agenda; histórico de sessões não é tocado. O plano é sempre recalculado no servidor.
 */
export type CalendarioGoogle = { id: string; nome: string; cor?: string | null; somenteLeitura?: boolean };

export type Forma = "local" | "online" | "externo" | "home_care";
export const ROTULO_FORMA: Record<Forma, string> = { local: "SEDE", online: "ON LINE", externo: "OUTRO LOCAL", home_care: "HOME CARE" };

export const normalizarNome = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

/** "AGENDA <MEDICO|ENFERMAGEM> [- PESSOA] - <FORMA>" -> partes; null quando o nome não segue o padrão de agenda de atendimento. */
export function interpretarNome(nome: string): { grupo: "medicina" | "enfermagem"; prefixo: string; forma: Forma } | null {
  const n = normalizarNome(nome);
  const m = n.match(/^(AGENDA (MEDICO|ENFERMAGEM)(?: - .+?)?) - (SEDE|LOCAL|ON ?LINE|REMOTO|OUTRO LOCAL|EXTERNO|HOME CARE)$/);
  if (!m) return null;
  const forma: Forma = m[3] === "SEDE" || m[3] === "LOCAL" ? "local"
    : /ON ?LINE|REMOTO/.test(m[3]) ? "online" : m[3] === "HOME CARE" ? "home_care" : "externo";
  return { grupo: m[2] === "MEDICO" ? "medicina" : "enfermagem", prefixo: m[1], forma };
}

export type ItemReconciliacao =
  | { acao: "renomear"; googleCalendarId: string; agendaId: number; localId: number | null; nomeAntes: string; nomeDepois: string; forma: Forma }
  | { acao: "criar"; googleCalendarId: string; nome: string; forma: Forma; categoriaId: number; categoria: string; professionalId: number | null; cor: string | null }
  | { acao: "igual"; googleCalendarId: string; agendaId: number; nome: string }
  | { acao: "relatar"; googleCalendarId: string | null; nome: string; motivo: MotivoRelato; detalhe: string };

export type MotivoRelato =
  | "agenda_pessoal_ou_geral" | "fora_do_padrao" | "de_outra_empresa" | "forma_divergente" | "nome_igual_sem_vinculo"
  | "somente_leitura" | "agenda_sem_calendario_google" | "categoria_nao_encontrada";

export type PlanoReconciliacao = { itens: ItemReconciliacao[]; resumo: Record<string, number> };

type LinhaAgenda = { id: number; name: string; modality: string; googleCalendarId: string | null; professionalId: number | null; empresaId: number | null };

export async function planejarReconciliacao(empresaId: number, calendarios: CalendarioGoogle[]): Promise<PlanoReconciliacao> {
  const todas = (await db.execute(sql`SELECT id, name, modality, google_calendar_id, professional_id, empresa_id
    FROM agenda_resources WHERE google_calendar_id IS NOT NULL OR empresa_id=${empresaId}`)).rows;
  const agendas: LinhaAgenda[] = todas.map((r) => ({ id: Number(r.id), name: String(r.name), modality: String(r.modality),
    googleCalendarId: r.google_calendar_id ? String(r.google_calendar_id) : null,
    professionalId: r.professional_id == null ? null : Number(r.professional_id), empresaId: r.empresa_id == null ? null : Number(r.empresa_id) }));
  const locais = (await db.execute(sql`SELECT id, name, google_calendar_id, empresa_id FROM locations
    WHERE google_calendar_id IS NOT NULL`)).rows;
  const categorias = await carregarCategorias(db);
  const itens: ItemReconciliacao[] = [];
  const vistos = new Set<string>();

  for (const cal of calendarios) {
    vistos.add(cal.id);
    const nome = cal.nome.trim();
    const donas = agendas.filter((a) => a.googleCalendarId === cal.id);
    const minhas = donas.filter((a) => a.empresaId === empresaId);
    const alheia = donas.some((a) => a.empresaId !== empresaId) ||
      locais.some((l) => String(l.google_calendar_id) === cal.id && Number(l.empresa_id) !== empresaId);
    const info = interpretarNome(nome);

    if (!minhas.length && alheia) {
      // Não revela nome nem dados da outra empresa.
      itens.push({ acao: "relatar", googleCalendarId: cal.id, nome, motivo: "de_outra_empresa",
        detalhe: "Este calendário já está ligado a outra empresa; nada foi feito." });
      continue;
    }
    if (minhas.length) {
      const a = minhas[0];
      if (info && info.forma !== a.modality) {
        itens.push({ acao: "relatar", googleCalendarId: cal.id, nome, motivo: "forma_divergente",
          detalhe: `No sistema a agenda "${a.name}" está como ${a.modality}; no Google o nome indica ${ROTULO_FORMA[info.forma]}. Corrija a forma no cadastro antes de renomear.` });
        continue;
      }
      if (normalizarNome(a.name) === normalizarNome(nome) && a.name === nome) {
        itens.push({ acao: "igual", googleCalendarId: cal.id, agendaId: a.id, nome });
      } else {
        const local = locais.find((l) => String(l.google_calendar_id) === cal.id && Number(l.empresa_id) === empresaId);
        itens.push({ acao: "renomear", googleCalendarId: cal.id, agendaId: a.id, localId: local ? Number(local.id) : null,
          nomeAntes: a.name, nomeDepois: nome, forma: (info?.forma ?? a.modality) as Forma });
      }
      continue;
    }
    // Sem agenda no sistema para este identificador.
    const n = normalizarNome(nome);
    if (n.startsWith("AGENDA PESSOAL") || n.startsWith("AGENDA GERAL") || n === "ANIVERSARIOS") {
      itens.push({ acao: "relatar", googleCalendarId: cal.id, nome, motivo: "agenda_pessoal_ou_geral",
        detalhe: "Agenda pessoal, geral ou de aniversários: não é agenda de atendimento; não foi criada." });
      continue;
    }
    if (cal.somenteLeitura) {
      itens.push({ acao: "relatar", googleCalendarId: cal.id, nome, motivo: "somente_leitura", detalhe: "A conta só lê este calendário; não serve para enviar visitas." });
      continue;
    }
    if (!info) {
      itens.push({ acao: "relatar", googleCalendarId: cal.id, nome, motivo: "fora_do_padrao",
        detalhe: 'O nome não segue "AGENDA MEDICO|ENFERMAGEM [- PESSOA] - SEDE|ON LINE|OUTRO LOCAL|HOME CARE"; nada foi criado.' });
      continue;
    }
    const mesmoNome = agendas.find((a) => a.empresaId === empresaId && !a.googleCalendarId && normalizarNome(a.name) === n);
    if (mesmoNome) {
      itens.push({ acao: "relatar", googleCalendarId: cal.id, nome, motivo: "nome_igual_sem_vinculo",
        detalhe: `Já existe a agenda "${mesmoNome.name}" sem calendário Google ligado. Ligue-a em vez de criar outra (evita duplicidade).` });
      continue;
    }
    const categoria = categorias.find((c) => c.active && c.slug === info.grupo);
    if (!categoria) {
      itens.push({ acao: "relatar", googleCalendarId: cal.id, nome, motivo: "categoria_nao_encontrada", detalhe: `Categoria ${info.grupo} não existe ou está inativa.` });
      continue;
    }
    // Profissional: só herda quando TODAS as agendas da mesma pessoa (mesmo prefixo) apontam para o mesmo profissional.
    const irmas = agendas.filter((a) => a.empresaId === empresaId && a.professionalId != null && prefixoDoNome(a.name) === info.prefixo);
    const profs = [...new Set(irmas.map((a) => a.professionalId))];
    itens.push({ acao: "criar", googleCalendarId: cal.id, nome, forma: info.forma, categoriaId: categoria.id, categoria: categoria.name,
      professionalId: profs.length === 1 ? profs[0] : null, cor: cal.cor ?? null });
  }

  // Agenda do sistema cujo calendário não aparece mais no Google: só relata.
  for (const a of agendas) {
    if (a.empresaId === empresaId && a.googleCalendarId && !vistos.has(a.googleCalendarId)) {
      itens.push({ acao: "relatar", googleCalendarId: a.googleCalendarId, nome: a.name, motivo: "agenda_sem_calendario_google",
        detalhe: "O calendário ligado a esta agenda não apareceu na lista do Google. Nada foi alterado nem desligado." });
    }
  }
  const resumo: Record<string, number> = {};
  for (const i of itens) resumo[i.acao] = (resumo[i.acao] ?? 0) + 1;
  return { itens, resumo };
}

function prefixoDoNome(nome: string): string | null {
  return interpretarNome(nome)?.prefixo ?? null;
}

export type ResultadoAplicacao = {
  aplicados: { acao: "renomear" | "criar"; googleCalendarId: string; nome: string; agendaId: number }[];
  falhas: { googleCalendarId: string; motivo: string }[];
};

/** Aplica o plano RECALCULADO (nunca o enviado pelo navegador). `somente` restringe a alguns calendários. Idempotente. */
export async function aplicarReconciliacao(empresaId: number, atorId: number | null, plano: PlanoReconciliacao, somente?: string[]): Promise<ResultadoAplicacao> {
  const out: ResultadoAplicacao = { aplicados: [], falhas: [] };
  for (const item of plano.itens) {
    if (item.acao !== "renomear" && item.acao !== "criar") continue;
    if (somente && !somente.includes(item.googleCalendarId)) continue;
    try {
      if (item.acao === "renomear") {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${empresaId})`);
          const r = await tx.execute(sql`UPDATE agenda_resources SET name=${item.nomeDepois}
            WHERE id=${item.agendaId} AND empresa_id=${empresaId} AND google_calendar_id=${item.googleCalendarId} AND name=${item.nomeAntes} RETURNING id`);
          if (!r.rows.length) throw new Error("A agenda mudou desde a pré-visualização; refaça a conferência.");
          await tx.execute(sql`INSERT INTO agenda_google_reconciliacoes (empresa_id, ator_id, acao, agenda_id, google_calendar_id, nome_antes, nome_depois)
            VALUES (${empresaId}, ${atorId}, 'renomeou_agenda', ${item.agendaId}, ${item.googleCalendarId}, ${item.nomeAntes}, ${item.nomeDepois})`);
          if (item.localId != null) {
            const l = await tx.execute(sql`SELECT name FROM locations WHERE id=${item.localId} AND empresa_id=${empresaId} AND google_calendar_id=${item.googleCalendarId}`);
            if (l.rows[0] && String(l.rows[0].name) !== item.nomeDepois) {
              await tx.execute(sql`UPDATE locations SET name=${item.nomeDepois} WHERE id=${item.localId}`);
              await tx.execute(sql`INSERT INTO agenda_google_reconciliacoes (empresa_id, ator_id, acao, location_id, google_calendar_id, nome_antes, nome_depois)
                VALUES (${empresaId}, ${atorId}, 'renomeou_local', ${item.localId}, ${item.googleCalendarId}, ${String(l.rows[0].name)}, ${item.nomeDepois})`);
            }
          }
        });
        out.aplicados.push({ acao: "renomear", googleCalendarId: item.googleCalendarId, nome: item.nomeDepois, agendaId: item.agendaId });
      } else {
        const id = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${empresaId})`);
          const ja = await tx.execute(sql`SELECT 1 FROM agenda_resources WHERE google_calendar_id=${item.googleCalendarId}`);
          if (ja.rows.length) throw new Error("Este calendário já tem agenda no sistema.");
          const decisao = await validarRecursoDeCategoria(tx, { categoryId: item.categoriaId, locationId: null,
            professionalId: item.professionalId, empresaId, modality: item.forma });
          if (!decisao.ok) throw new Error(decisao.error);
          const criado = (await tx.execute(sql`INSERT INTO agenda_resources
            (name, kind, category_id, modality, color, slot_minutes, professional_id, location_id, empresa_id, google_calendar_id, sort_order)
            VALUES (${item.nome}, ${decisao.kind}, ${decisao.categoryId}, ${item.forma}, ${item.cor ?? "#3D7A7A"}, 30,
              ${item.professionalId}, NULL, ${empresaId}, ${item.googleCalendarId}, 0) RETURNING id`)).rows[0];
          await tx.execute(sql`INSERT INTO agenda_resource_category_audit (resource_id, previous_category_id, category_id, origin, actor_professional_id)
            VALUES (${criado.id}, NULL, ${decisao.categoryId}, 'reconciliacao_google', ${atorId})`);
          await tx.execute(sql`INSERT INTO agenda_google_reconciliacoes (empresa_id, ator_id, acao, agenda_id, google_calendar_id, nome_depois, detalhe)
            VALUES (${empresaId}, ${atorId}, 'criou_agenda', ${criado.id}, ${item.googleCalendarId}, ${item.nome},
              ${JSON.stringify({ forma: item.forma, categoriaId: item.categoriaId, professionalId: item.professionalId })}::jsonb)`);
          return Number(criado.id);
        });
        out.aplicados.push({ acao: "criar", googleCalendarId: item.googleCalendarId, nome: item.nome, agendaId: id });
      }
    } catch (e) {
      out.falhas.push({ googleCalendarId: item.googleCalendarId, motivo: (e as Error).message });
    }
  }
  return out;
}
