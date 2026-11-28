import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { parseBrtParts } from "./brt";
import { lerRubricaHistorica } from "./client-rubrica";
import { ensureVisitConfirmations } from "./ensure-visit-confirmations";
import { marcaDoEstado, type RegistroRasFap } from "./ras-fap-rubrica";

/**
 * K9 — o que o RAS FAP mostra do que JÁ aconteceu em cada visita: data e hora efetivas, enfermeira que
 * registrou, rubrica do cliente (estado da confirmação da K8) e quais substâncias foram aplicadas.
 *
 * Só protocolos de datas exatas: a linha da grade deles É uma visita (sessão). No protocolo semanal antigo a
 * linha é uma semana consolidada e ligá-la a uma sessão seria adivinhar; ele continua exatamente como era.
 * Lê substance_applications, professionals, clients, visit_confirmations e a versão
 * histórica da imagem (client_rubricas), nunca a imagem ativa por inferência.
 */

interface SessionRow { id: number; week_number: number | null; empresa_id: number | null; client_id: number | null }
interface ApplicationRow {
  session_id: number; substance_id: number; status: string; applied_at: string | null; confirmed_by: number | null;
}
interface ConfirmationRow { session_id: number; state: string; rubrica_version_id:number|null;
  rubrica_sha256:string|null;rubrica_snapshot_at:Date|string|null }

async function rowsOf<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

function brtParts(appliedAt: string): { data: string; hora: string } {
  const instante = new Date(appliedAt);
  if (!Number.isFinite(instante.getTime())) throw new Error("RASP: data de aplicação inválida no registro");
  const p = parseBrtParts(instante);
  return { data: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour}:${p.minute}` };
}

export async function loadProtocolRasRegistros(
  protocol: { id: number; schedulingMode: string; empresaId: number | null; clientId: number },
  substanceIds: number[],
): Promise<Map<number, RegistroRasFap> | undefined> {
  if (protocol.schedulingMode !== "exact") return undefined;
  const empresaId = protocol.empresaId;
  if (!Number.isInteger(empresaId)) throw new Error("RASP: protocolo sem empresa; os registros não podem ser isolados");
  if (!substanceIds.length || new Set(substanceIds).size !== substanceIds.length) {
    throw new Error("RASP: identificação ambígua das substâncias");
  }
  const registros = new Map<number, RegistroRasFap>();
  const sessions = await rowsOf<SessionRow>(sql`
    SELECT id, week_number, empresa_id, client_id FROM sessions
     WHERE protocol_id = ${protocol.id} AND status IS DISTINCT FROM 'cancelled'
     ORDER BY scheduled_date, id`);
  if (sessions.length === 0) return registros;

  // Sessões antigas podem ter empresa nula (legado); sessão de OUTRA empresa dentro do protocolo é anomalia.
  if (sessions.some((s) => s.empresa_id != null && s.empresa_id !== empresaId)) {
    throw new Error("RASP: o protocolo contém visita de outra empresa; os registros não podem ser emitidos");
  }
  // Data, hora, enfermeira e checks vêm da visita: ela TEM de ser do cliente do protocolo (o nome impresso é dele).
  if (sessions.some((s) => s.client_id !== protocol.clientId)) {
    throw new Error("RASP: o protocolo contém visita de outro cliente; os registros não podem ser emitidos");
  }
  // Número 0 é preenchimento da folha (linha de escrita) e nunca recebe registro: visita real começa em 1.
  const numeros = sessions.map((s) => s.week_number);
  if (numeros.some((n) => !Number.isInteger(n) || (n as number) < 1) || new Set(numeros).size !== numeros.length) {
    throw new Error("RASP: numeração das visitas ambígua; os registros não podem ser ligados à grade");
  }

  const sessionIds = sessions.map((s) => s.id);
  const idList = sql.join(sessionIds.map((id) => sql`${id}`), sql`, `);
  const apps = await rowsOf<ApplicationRow>(sql`
    SELECT session_id, substance_id, status, applied_at, confirmed_by
      FROM substance_applications
     WHERE session_id IN (${idList}) AND availability = 'disp'`);

  await ensureVisitConfirmations();
  const confirmacoes = await rowsOf<ConfirmationRow>(sql`
    SELECT session_id, state, rubrica_version_id, rubrica_sha256, rubrica_snapshot_at FROM visit_confirmations
     WHERE session_id IN (${idList}) AND empresa_id = ${empresaId} AND client_id = ${protocol.clientId}`);
  const estadoPorSessao = new Map(confirmacoes.map((c) => [c.session_id, c.state]));
  const confirmacaoPorSessao = new Map(confirmacoes.map(c=>[c.session_id,c]));

  const [cliente] = await rowsOf<{ name: string }>(sql`
    SELECT name FROM clients WHERE id = ${protocol.clientId} AND empresa_id = ${empresaId}`);
  if (!cliente) throw new Error("RASP: cliente do protocolo não encontrado nesta empresa");

  const aplicadasPorSessao = new Map<number, ApplicationRow[]>();
  for (const app of apps) {
    if (app.status !== "applied" || !app.applied_at) continue;
    const lista = aplicadasPorSessao.get(app.session_id) ?? [];
    lista.push(app);
    aplicadasPorSessao.set(app.session_id, lista);
  }

  const registradores = [...new Set([...aplicadasPorSessao.values()].flat().map((a) => a.confirmed_by)
    .filter((id): id is number => Number.isInteger(id)))];
  const nomePorProfissional = new Map<number, string>();
  if (registradores.length) {
    const lista = sql.join(registradores.map((id) => sql`${id}`), sql`, `);
    const nomes = await rowsOf<{ id: number; name: string }>(sql`SELECT id, name FROM professionals WHERE id IN (${lista})`);
    for (const n of nomes) nomePorProfissional.set(n.id, n.name);
  }

  for (const session of sessions) {
    const aplicadas = aplicadasPorSessao.get(session.id) ?? [];
    const primeira = [...aplicadas].sort((a, b) => Date.parse(a.applied_at!) - Date.parse(b.applied_at!))[0];
    const quando = primeira ? brtParts(primeira.applied_at!) : null;
    registros.set(session.week_number!, {
      dataEfetiva: quando?.data ?? null,
      hora: quando?.hora ?? null,
      enfermeira: primeira?.confirmed_by != null ? (nomePorProfissional.get(primeira.confirmed_by) ?? null) : null,
      clienteNome: cliente.name,
      // Confirmação sem aplicação registrada não aparece: a rubrica diz "a aplicação aconteceu".
      confirmacaoCliente: primeira ? marcaDoEstado(estadoPorSessao.get(session.id)) : null,
      aplicadas: substanceIds.map((id) => aplicadas.some((a) => a.substance_id === id)),
    });
  }

  // Cada visita usa sua própria versão. Sem prova legada não se inventa imagem.
  const mostraRubrica = (r: RegistroRasFap) => r.confirmacaoCliente === "plena" || r.confirmacaoCliente === "cadastro";
  for(const session of sessions) {
    const registro=registros.get(session.week_number!)!;
    if(!mostraRubrica(registro)) continue;
    const c=confirmacaoPorSessao.get(session.id);
    if(!c?.rubrica_snapshot_at) { registro.rubricaHistorica="legado_sem_versao";continue; }
    if(c.rubrica_version_id===null && c.rubrica_sha256===null) {registro.rubricaHistorica="sem_imagem";continue;}
    if(!c.rubrica_version_id||!c.rubrica_sha256) throw new Error("RASP: vínculo histórico da rubrica incompleto");
    registro.rubricaPng=await lerRubricaHistorica(protocol.clientId,empresaId as number,c.rubrica_version_id,c.rubrica_sha256);
    registro.rubricaHistorica="imagem";
    registro.rubricaVersionId=c.rubrica_version_id;
    registro.rubricaSha256=c.rubrica_sha256;
  }
  return registros;
}
