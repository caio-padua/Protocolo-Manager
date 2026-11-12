import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, locationsTable, agendaCompromissosTable, sessionsTable } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { getUncachableGoogleCalendarClient, listCalendars, verifyClinicAccount } from "../lib/google-calendar";
import { lerIcs, chaveEvento, type ResultadoIcs } from "../lib/ics-parser";
import { mayManageAgenda } from "../lib/agenda-governance";

// Aba "Agenda Google" do cadastro do local — Fase 1: so LE o Google (nada e escrito la).
const router: IRouter = Router();
router.use("/locations/:id/agenda-google", requireCollaborator, async (req,res,next) => {
  if (["GET","HEAD","OPTIONS"].includes(req.method)) {next();return;}
  if (!(await mayManageAgenda(req,Number(req.params.id)))) {
    res.status(403).json({error:"Vínculo de agenda exige administrador autorizado ou responsável técnico."});return;
  }
  next();
});

const PAPEIS = ["local", "online", "externo", "home_care", "pessoal", "geral"] as const;
type Papel = (typeof PAPEIS)[number];
const LIMITE_ICS_BYTES = 10 * 1024 * 1024;

function papelSugerido(nome: string): Papel | null {
  const n = nome.toUpperCase().trim();
  if (n.endsWith("- LOCAL") || n.endsWith("- SEDE")) return "local";
  // Os calendarios do Google podem terminar em "- REMOTO", "- ONLINE" ou "- ON LINE"; o papel gravado e sempre "online".
  if (n.endsWith("- REMOTO") || n.endsWith("- ONLINE") || n.endsWith("- ON LINE")) return "online";
  if (n.endsWith("- EXTERNO") || n.endsWith("- OUTRO LOCAL")) return "externo";
  if (n.endsWith("- HOME CARE")) return "home_care";
  if (n.startsWith("AGENDA PESSOAL")) return "pessoal";
  if (n.startsWith("AGENDA GERAL")) return "geral";
  return null;
}

// Local existe e pertence a empresa do chamador (dono da plataforma enxerga todas).
async function carregarLocalAutorizado(req: Request, res: Response) {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Id de local inválido." }); return null; }
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, id));
  if (!loc) { res.status(404).json({ error: "Local não encontrado." }); return null; }
  if (!req.tenantContext.isPlatformOwner && loc.empresaId !== req.tenantContext.empresaId) {
    res.status(403).json({ error: "Este local pertence a outra empresa." });
    return null;
  }
  return loc;
}

async function contaClinicaOk(res: Response): Promise<boolean> {
  const conta = await verifyClinicAccount();
  if (!conta.ok) {
    res.status(409).json({ error: "A conta Google conectada não é a da clínica (ou não foi possível confirmar). Nada foi feito." });
    return false;
  }
  return true;
}

// ── Lista as agendas da conta Google (com cor e descricao reais) ─────────────
router.get("/locations/google/agendas", requireCollaborator, async (req, res): Promise<void> => {
  try {
    if (!(await contaClinicaOk(res))) return;
    const calendario = await getUncachableGoogleCalendarClient();
    const itens = (await listCalendars()).filter((c) => c.accessRole === "owner" || c.accessRole === "writer");
    const locais = await db
      .select({ id: locationsTable.id, name: locationsTable.name, g: locationsTable.googleCalendarId, empresaId: locationsTable.empresaId })
      .from(locationsTable);
    const agendas = [];
    for (const c of itens) {
      let descricao: string | null = null;
      try {
        const det = await calendario.calendars.get({ calendarId: c.id });
        descricao = det.data.description ?? null;
      } catch { /* descricao e opcional */ }
      const ligado = locais.find((l) => l.g === c.id && l.empresaId === req.tenantContext.empresaId);
      agendas.push({
        googleCalendarId: c.id as string,
        nome: String(c.summary ?? "").trim(),
        cor: (c.backgroundColor as string | undefined) ?? null,
        descricao,
        principal: Boolean(c.primary),
        papelSugerido: papelSugerido(String(c.summary ?? "")),
        vinculadaLocalId: ligado?.id ?? null,
        vinculadaLocalNome: ligado?.name ?? null,
      });
    }
    res.json({ agendas });
  } catch (err) {
    res.status(502).json({ error: `Não foi possível consultar o Google Agenda: ${(err as Error).message}` });
  }
});

// ── Vincula a agenda escolhida ao local (e, se pedido, copia a cor real) ──────
router.post("/locations/:id/agenda-google/vincular", requireCollaborator, async (req, res): Promise<void> => {
  const loc = await carregarLocalAutorizado(req, res);
  if (!loc) return;
  const googleCalendarId = String(req.body?.googleCalendarId ?? "").trim();
  const papel = req.body?.papel === null || req.body?.papel === "" ? null : String(req.body?.papel ?? "");
  if (!googleCalendarId) { res.status(400).json({ error: "googleCalendarId é obrigatório." }); return; }
  if (papel !== null && !(PAPEIS as readonly string[]).includes(papel)) {
    res.status(422).json({ error: "Papel deve ser local, online, externo, home_care, pessoal ou geral." });
    return;
  }
  try {
    if (!(await contaClinicaOk(res))) return;
    const g = (await listCalendars()).find((c) => c.id === googleCalendarId);
    if (!g) { res.status(404).json({ error: "Essa agenda não existe na conta Google da clínica." }); return; }
    const [outro] = await db.select({ id: locationsTable.id, name: locationsTable.name }).from(locationsTable)
      .where(and(eq(locationsTable.googleCalendarId, googleCalendarId), eq(locationsTable.empresaId, loc.empresaId ?? -1)));
    if (outro && outro.id !== loc.id) {
      res.status(409).json({ error: `Esta agenda já está vinculada ao local "${outro.name}".` });
      return;
    }
    const updates: Record<string, unknown> = { googleCalendarId, agendaPapel: papel };
    if (req.body?.aplicarCor === true && typeof g.backgroundColor === "string") updates.color = g.backgroundColor;
    await db.update(locationsTable).set(updates).where(eq(locationsTable.id, loc.id));
    res.json({ ok: true, localId: loc.id, googleCalendarId, papel, cor: updates.color ?? loc.color });
  } catch (err) {
    res.status(502).json({ error: `Não foi possível vincular: ${(err as Error).message}` });
  }
});

// ── Cores reais do Google para todos os locais da empresa que tem agenda ──────
router.post("/locations/agenda-google/sincronizar-cores", requireCollaborator, async (req, res): Promise<void> => {
  try {
    if (!(await contaClinicaOk(res))) return;
    const doGoogle = new Map((await listCalendars()).map((c) => [c.id as string, c.backgroundColor as string | undefined]));
    const locais = await db.select().from(locationsTable).where(eq(locationsTable.empresaId, req.tenantContext.empresaId));
    const alterados: Array<{ id: number; nome: string; de: string; para: string }> = [];
    for (const l of locais) {
      const cor = l.googleCalendarId ? doGoogle.get(l.googleCalendarId) : undefined;
      if (cor && cor.toLowerCase() !== (l.color ?? "").toLowerCase()) {
        await db.update(locationsTable).set({ color: cor }).where(eq(locationsTable.id, l.id));
        alterados.push({ id: l.id, nome: l.name, de: l.color, para: cor });
      }
    }
    res.json({ ok: true, alterados });
  } catch (err) {
    res.status(502).json({ error: `Não foi possível sincronizar as cores: ${(err as Error).message}` });
  }
});

// ── Importacao de .ics (arquivo ou link): previa e confirmacao ────────────────
async function obterTextoIcs(body: { texto?: unknown; url?: unknown }): Promise<{ texto: string } | { erro: string; status: number }> {
  if (typeof body.texto === "string" && body.texto.trim()) {
    if (Buffer.byteLength(body.texto, "utf8") > LIMITE_ICS_BYTES) return { erro: "Arquivo maior que 10 MB.", status: 413 };
    return { texto: body.texto };
  }
  if (typeof body.url === "string" && body.url.trim()) {
    let u: URL;
    try { u = new URL(body.url.trim()); } catch { return { erro: "Link inválido.", status: 422 }; }
    // Defesa contra SSRF: so aceitamos o endereco publico de exportacao do Google Agenda.
    if (u.protocol !== "https:" || u.hostname !== "calendar.google.com" || !u.pathname.startsWith("/calendar/ical/")) {
      return { erro: "Só aceito links de exportação do Google Agenda (https://calendar.google.com/calendar/ical/...).", status: 422 };
    }
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(15000), redirect: "error" });
      if (!r.ok) return { erro: `O Google recusou o link (código ${r.status}). Confira se o endereço secreto está correto.`, status: 502 };
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > LIMITE_ICS_BYTES) return { erro: "O calendário passa de 10 MB.", status: 413 };
      return { texto: buf.toString("utf8") };
    } catch (err) {
      return { erro: `Não foi possível baixar o link: ${(err as Error).message}`, status: 502 };
    }
  }
  return { erro: "Envie o arquivo .ics ou informe o link.", status: 400 };
}

async function chavesExistentes(localId: number, chaves: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  for (let i = 0; i < chaves.length; i += 1000) {
    const parte = chaves.slice(i, i + 1000);
    const linhas = await db.select({ chave: agendaCompromissosTable.chave }).from(agendaCompromissosTable)
      .where(and(eq(agendaCompromissosTable.locationId, localId), inArray(agendaCompromissosTable.chave, parte)));
    for (const l of linhas) set.add(l.chave);
  }
  return set;
}

// Eventos que o PROPRIO sistema criou no Google (sessoes de cliente) NAO sao compromissos externos:
// o UID do .ics e "<id do evento>@google.com" e o id fica em sessions.google_event_id.
async function idsDeSessoesDoSistema(eventos: ResultadoIcs["eventos"]): Promise<Set<string>> {
  const ids = [...new Set(eventos.map((e) => e.uid.replace(/@google\.com$/, "")))];
  const set = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const linhas = await db.select({ g: sessionsTable.googleEventId }).from(sessionsTable)
      .where(inArray(sessionsTable.googleEventId, ids.slice(i, i + 1000)));
    for (const l of linhas) if (l.g) set.add(l.g);
  }
  return set;
}
const ehSessaoDoSistema = (uid: string, sessoes: Set<string>) => sessoes.has(uid.replace(/@google\.com$/, ""));

function resumir(r: ResultadoIcs, jaExistem: Set<string>, sessoes: Set<string>) {
  const doSistema = r.eventos.filter((e) => ehSessaoDoSistema(e.uid, sessoes));
  const candidatos = r.eventos.filter((e) => !ehSessaoDoSistema(e.uid, sessoes));
  const novos = candidatos.filter((e) => !jaExistem.has(chaveEvento(e)));
  const datas = r.eventos.map((e) => e.inicio.getTime()).sort((a, b) => a - b);
  const motivos = new Map<string, number>();
  for (const i of r.ignorados) motivos.set(i.motivo, (motivos.get(i.motivo) ?? 0) + 1);
  return {
    calendarioNome: r.calendarioNome,
    calendarioDescricao: r.calendarioDescricao,
    totalLidos: r.eventos.length,
    sessoesDoSistema: doSistema.length,
    novos: novos.length,
    jaExistem: candidatos.length - novos.length,
    recorrentes: r.eventos.filter((e) => e.recorrencia).length,
    cancelados: r.eventos.filter((e) => e.status === "cancelado").length,
    ignorados: r.ignorados.length,
    motivosIgnorados: [...motivos.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })),
    periodo: datas.length ? { de: new Date(datas[0]).toISOString(), ate: new Date(datas[datas.length - 1]).toISOString() } : null,
    amostra: novos.slice(0, 5).map((e) => ({ titulo: e.titulo, inicio: e.inicio.toISOString(), diaInteiro: e.diaInteiro })),
  };
}

router.post("/locations/:id/agenda-google/ics/previa", requireCollaborator, async (req, res): Promise<void> => {
  const loc = await carregarLocalAutorizado(req, res);
  if (!loc) return;
  const fonte = await obterTextoIcs(req.body ?? {});
  if ("erro" in fonte) { res.status(fonte.status).json({ error: fonte.erro }); return; }
  if (!/BEGIN:VCALENDAR/.test(fonte.texto)) {
    res.status(422).json({ error: "Isto não parece um arquivo .ics do Google Agenda (não encontrei BEGIN:VCALENDAR)." });
    return;
  }
  const lido = lerIcs(fonte.texto);
  const sessoes = await idsDeSessoesDoSistema(lido.eventos);
  const existentes = await chavesExistentes(loc.id, lido.eventos.map(chaveEvento));
  res.json({ ok: true, previa: resumir(lido, existentes, sessoes) });
});

router.post("/locations/:id/agenda-google/ics/confirmar", requireCollaborator, async (req, res): Promise<void> => {
  const loc = await carregarLocalAutorizado(req, res);
  if (!loc) return;
  const fonte = await obterTextoIcs(req.body ?? {});
  if ("erro" in fonte) { res.status(fonte.status).json({ error: fonte.erro }); return; }
  if (!/BEGIN:VCALENDAR/.test(fonte.texto)) { res.status(422).json({ error: "Isto não parece um arquivo .ics do Google Agenda." }); return; }
  const lido = lerIcs(fonte.texto);
  const sessoes = await idsDeSessoesDoSistema(lido.eventos);
  const paraImportar = lido.eventos.filter((e) => !ehSessaoDoSistema(e.uid, sessoes));
  if (paraImportar.length === 0) {
    res.json({ ok: true, gravados: 0, jaExistiam: 0, sessoesDoSistema: lido.eventos.length, ignorados: lido.ignorados.length });
    return;
  }
  let gravados = 0;
  for (let i = 0; i < paraImportar.length; i += 500) {
    const lote = paraImportar.slice(i, i + 500).map((e) => ({
      locationId: loc.id,
      googleCalendarId: loc.googleCalendarId ?? null,
      chave: chaveEvento(e),
      icalUid: e.uid,
      titulo: e.titulo,
      descricao: e.descricao,
      localTexto: e.localTexto,
      inicio: e.inicio,
      fim: e.fim,
      diaInteiro: e.diaInteiro,
      recorrencia: e.recorrencia,
      status: e.status,
      origem: "ics",
    }));
    const inseridos = await db.insert(agendaCompromissosTable).values(lote)
      .onConflictDoNothing({ target: [agendaCompromissosTable.locationId, agendaCompromissosTable.chave] })
      .returning({ id: agendaCompromissosTable.id });
    gravados += inseridos.length;
  }
  res.json({
    ok: true,
    gravados,
    jaExistiam: paraImportar.length - gravados,
    sessoesDoSistema: lido.eventos.length - paraImportar.length,
    ignorados: lido.ignorados.length,
  });
});

// Compromissos ja importados (contagem por local, usada na aba).
router.get("/locations/:id/agenda-google/compromissos/resumo", requireCollaborator, async (req, res): Promise<void> => {
  const loc = await carregarLocalAutorizado(req, res);
  if (!loc) return;
  const linhas = await db.select({ status: agendaCompromissosTable.status, recorrencia: agendaCompromissosTable.recorrencia })
    .from(agendaCompromissosTable).where(eq(agendaCompromissosTable.locationId, loc.id));
  res.json({ total: linhas.length, cancelados: linhas.filter((l) => l.status === "cancelado").length, recorrentes: linhas.filter((l) => l.recorrencia).length });
});

export default router;
