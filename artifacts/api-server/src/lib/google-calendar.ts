import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.find((i: any) => i.connector_name === 'google-calendar'));

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

export async function getUncachableGoogleCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export type SubstanceStatus = "disp" | "prox" | "applied" | "missed";

export interface CalendarSubstance {
  name: string;
  dose: string;
  sessionNumber: number;
  totalSessions: number;
  status: SubstanceStatus;
}

export interface CalendarEventData {
  sessionId: number;
  clientName: string;
  clientCpf?: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  weekNumber: number;
  unit: string;
  locationAddress?: string;
  calendarId?: string;
  procedureType?: string;
  procedureLabel: string;
  activeProcedureTypes: string[];
  substances: CalendarSubstance[];
  clientEmail?: string;
  sessionStatus?: string;
  summaryPrefix?: string;
  // Total de idas (sessoes) do protocolo. Alimenta "Agendamento Número: N/Total".
  totalAppointments?: number;
  // Telefone da clínica da sessão (SUB-05). Vira blocos LIGAR/WHATSAPP no evento.
  locationPhone?: string;
}

// Número oficial da clínica (SUB-05). Fallback quando a clínica não tem telefone próprio.
const OFFICIAL_CLINIC_PHONE = "+5511977154000";

// Normaliza um telefone para E.164 (+DDI...). Respeita o DDI informado (não força +55
// quando já vem com sinal de mais); assume Brasil (+55) só para números locais sem DDI.
function normalizePhoneE164(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) return "+" + digits; // já internacional: respeita o DDI
  if (digits.length === 10 || digits.length === 11) return "+55" + digits; // DDD + número
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return "+" + digits;
  return "+" + digits; // fallback genérico
}

function getColorIdForProcedure(procType: string): string {
  switch (procType) {
    case "iv": return "5";
    case "im": return "5";
    case "implant": return "3";
    case "consultation": return "9";
    default: return "5";
  }
}

function buildAddressBlock(address: string | undefined, unitName: string): string | null {
  if (!address) return null;

  const parts = address.split(",").map(p => p.trim());

  let rua = "";
  let numero = "";
  let bairro = "";
  let cidadeEstado = "";
  let cep = "";

  const cepMatch = address.match(/CEP\s*([\d\-\.]+)/i) || address.match(/(\d{5}[\-\.]?\d{3})/);
  if (cepMatch) {
    cep = cepMatch[1].replace(/\./g, "").replace(/(\d{5})(\d{3})/, "$1-$2");
  }

  if (parts.length >= 4) {
    rua = parts[0];
    numero = parts[1];
    bairro = parts[2];
    cidadeEstado = parts.slice(3).join(", ").replace(/CEP\s*[\d\-\.]+/i, "").trim().replace(/,\s*$/, "");
  } else if (parts.length === 3) {
    rua = parts[0];
    numero = parts[1];
    bairro = parts[2].replace(/CEP\s*[\d\-\.]+/i, "").trim();
  } else if (parts.length === 2) {
    rua = parts[0];
    numero = parts[1].replace(/CEP\s*[\d\-\.]+/i, "").trim();
  } else {
    rua = parts[0].replace(/CEP\s*[\d\-\.]+/i, "").trim();
  }

  let block = `\uD83D\uDCCD ENDEREÇO\n${(rua + (numero ? ", " + numero : "")).toUpperCase()}`;
  if (bairro) block += `\n${bairro.toUpperCase()}`;
  if (cidadeEstado) block += `\n${cidadeEstado.toUpperCase()}`;
  if (cep) block += `\nCEP ${cep}`;

  return block;
}

// Lista FIXA de procedimentos exibida no evento (padrao Paxter dos prints).
// Cada linha leva polegar (ativo/inativo) e a contagem de tempo entre colchetes.
const PROCEDURE_ROWS: Array<{ key: string; label: string; min: number }> = [
  { key: "im", label: "Aplicação Intramuscular", min: 15 },
  { key: "iv", label: "Aplicação Endovenosa", min: 30 },
  { key: "consultation", label: "Consulta", min: 60 },
  { key: "__retorno", label: "Retorno ou Avaliação", min: 30 },
  { key: "__especifico", label: "Procedimento Específico", min: 60 },
  { key: "implant", label: "Implante", min: 60 },
];

const MARK_OK = "\u2705"; // ✅ ocorre
const MARK_NO = "\u274C"; // ❌ não ocorre

// Emoji de relógio para um horário "HH:MM". Os emojis existem de 30 em 30 min,
// entao arredondamos para o mais proximo (minuto<15 -> :00; 15..44 -> :30; >=45 -> :00 da hora seguinte).
function clockEmojiForTime(time: string): string {
  const [hRaw, mRaw] = time.split(":").map(Number);
  let h = hRaw % 24;
  const m = mRaw;
  let half = false;
  if (m < 15) {
    half = false;
  } else if (m < 45) {
    half = true;
  } else {
    half = false;
    h = (h + 1) % 24;
  }
  const h12 = (h % 12) || 12; // 1..12
  const base = half ? 0x1f55c : 0x1f550; // 🕜.. ou 🕐..
  return String.fromCodePoint(base + (h12 - 1));
}

// Soma minutos a "HH:MM" e devolve "HH:MM" (24h).
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const STATUS_SQUARE: Record<SubstanceStatus, string> = {
  disp: "\uD83D\uDFE9", // 🟩 verde
  prox: "\uD83D\uDFE8", // 🟨 amarelo
  applied: "\uD83D\uDFE6", // 🟦 azul
  missed: "\u2B1C", // ⬜ branco
};

const STATUS_ABBR: Record<SubstanceStatus, string> = {
  disp: "DISP",
  prox: "PROX",
  applied: "APLI",
  missed: "INDI",
};

const SUBSTANCE_LEGEND =
  "LEGENDA:\n" +
  `${STATUS_SQUARE.disp} Disponível para Aplicação [DISP]\n` +
  `${STATUS_SQUARE.prox} Disponível Próxima Sessão [PROX]\n` +
  `${STATUS_SQUARE.applied} Substância Aplicada [APLI]\n` +
  `${STATUS_SQUARE.missed} Substância Indisponível [INDI]`;

/** Soma das duracoes (min) so dos procedimentos ATIVOS, sem repetir tipo. */
function computeActiveDuration(activeProcTypes: string[]): number {
  const active = new Set(activeProcTypes);
  let total = 0;
  for (const row of PROCEDURE_ROWS) {
    if (active.has(row.key)) total += row.min;
  }
  return total;
}

function buildProcedureChecklist(activeProcTypes: string[]): string {
  const active = new Set(activeProcTypes);
  return PROCEDURE_ROWS.map(row => {
    const mark = active.has(row.key) ? MARK_OK : MARK_NO;
    return `${mark} ${row.label} [${row.min}min]`;
  }).join("\n");
}

function getSessionStatusLine(sessionStatus?: string): string {
  if (sessionStatus === "completed") {
    return `${STATUS_SQUARE.applied} Aplicação Realizada`;
  }
  if (sessionStatus === "missed" || sessionStatus === "cancelled") {
    return `${STATUS_SQUARE.missed} Não Realizada`;
  }
  return `${STATUS_SQUARE.prox} Aplicação Programada`;
}

function buildSubstanceList(substances: CalendarSubstance[]): string {
  if (substances.length === 0) return "(sem substâncias nesta sessão)";
  return substances
    .map(s => {
      const idx = s.sessionNumber > 0 ? `${s.sessionNumber}/${s.totalSessions}` : `–/${s.totalSessions}`;
      const square = STATUS_SQUARE[s.status] ?? STATUS_SQUARE.prox;
      const abbr = STATUS_ABBR[s.status] ?? "PROX";
      return `${square} [${idx}] ${s.name} ${s.dose} [${abbr}]`;
    })
    .join("\n");
}

function buildEventTitle(clientName: string, cpf: string, prefix: string): string {
  const nameUpper = clientName.toUpperCase();
  const cpfPart = cpf ? ` CPF ${cpf}` : "";
  return `${prefix}${nameUpper}${cpfPart} [SESS]`;
}

function buildDescriptionBody(data: CalendarEventData): string {
  const totalAppointments = data.totalAppointments ?? data.weekNumber;
  const durationTotal = computeActiveDuration(data.activeProcedureTypes) || data.durationMinutes;
  const procedureChecklist = buildProcedureChecklist(data.activeProcedureTypes);
  const statusLine = getSessionStatusLine(data.sessionStatus);
  const substanceList = buildSubstanceList(data.substances);

  const addressBlock = buildAddressBlock(data.locationAddress, data.unit);
  const mapsLink = data.locationAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.locationAddress)}`
    : null;
  const wazeLink = data.locationAddress
    ? `https://waze.com/ul?q=${encodeURIComponent(data.locationAddress)}`
    : null;
  const appleMapsLink = data.locationAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent(data.locationAddress)}`
    : null;

  const horaInicio = data.scheduledTime;
  const horaFim = addMinutesToTime(horaInicio, durationTotal);
  const relogio = clockEmojiForTime(horaInicio);
  const horarioBlock = `HORÁRIO:\n${relogio} ${horaInicio} às ${horaFim}`;

  let desc =
    `Developed by: Padcon \u00b7 Paxter\n\n` +
    `${data.clientName}\n` +
    `CPF.: ${data.clientCpf || "-"}\n` +
    `Agendamento Número: ${data.weekNumber}/${totalAppointments}\n` +
    `UNIDADE: ${data.unit}\n\n` +
    `${horarioBlock}\n\n` +
    `PROCEDIMENTOS:\n${procedureChecklist}\n` +
    `DURAÇÃO TOTAL: ${durationTotal}min\n\n` +
    `STATUS:\n${statusLine}\n\n` +
    `SUBSTÂNCIAS PROTOCOLO:\n${substanceList}\n\n` +
    `${SUBSTANCE_LEGEND}`;

  if (addressBlock) {
    desc += `\n\n${addressBlock}`;
  }

  if (mapsLink) {
    desc += `\n\nNAVEGAÇÃO:`;
    desc += `\nGoogle Maps: ${mapsLink}`;
    if (wazeLink) {
      desc += `\nWaze: ${wazeLink}`;
    }
    if (appleMapsLink) {
      desc += `\nApple Maps: ${appleMapsLink}`;
    }
  }

  // CONTATO (SUB-05): telefone da clínica da sessão; fallback para o número oficial.
  // Só omite se não houver telefone nem fallback (evita link quebrado).
  const phoneE164 = normalizePhoneE164(data.locationPhone) ?? OFFICIAL_CLINIC_PHONE;
  if (phoneE164) {
    const waNumber = phoneE164.replace(/^\+/, "");
    desc += `\n\nCONTATO:`;
    desc += `\n\uD83D\uDCDE LIGAR: tel:${phoneE164}`;
    desc += `\n\uD83D\uDCAC WHATSAPP: https://wa.me/${waNumber}`;
  }

  return desc;
}

export async function createCalendarEvent(data: CalendarEventData): Promise<string | null> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();

    // Mesmo corpo usado na atualizacao (convite B): 1 so verdade, sem drift create vs update.
    const event: any = buildEventRequestBody(data);

    // Convite A (decisao CEO): o evento vive nos calendarios da clinica e NAO depende de
    // aceite do cliente. Nao adicionamos participante (attendee) nem disparamos convite/RSVP.
    // A entrega ao cliente (arquivo .ics "Adicionar"/feed) e do proximo loop.
    const targetCalendarId = data.calendarId || 'primary';

    const result = await calendar.events.insert({
      calendarId: targetCalendarId,
      requestBody: event,
      sendUpdates: 'none',
    });

    return result.data.id ?? null;
  } catch (err: any) {
    console.error("Failed to create calendar event:", err.message);
    throw err;
  }
}

// Constroi o corpo completo do evento (titulo, descricao, horarios, lembretes, cor).
// Usado tanto na criacao quanto na atualizacao completa (convite B) para manter 1 so verdade.
function buildEventRequestBody(data: CalendarEventData) {
  const [h, m] = data.scheduledTime.split(":").map(Number);
  const startDate = new Date(`${data.scheduledDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
  const durationTotal = computeActiveDuration(data.activeProcedureTypes) || data.durationMinutes;
  const endDate = new Date(startDate.getTime() + durationTotal * 60 * 1000);
  const cpfFormatted = data.clientCpf || "";
  const prefix = data.summaryPrefix ? `${data.summaryPrefix} ` : "";
  return {
    summary: buildEventTitle(data.clientName, cpfFormatted, prefix),
    description: buildDescriptionBody(data),
    location: data.locationAddress || data.unit,
    start: { dateTime: startDate.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: endDate.toISOString(), timeZone: 'America/Sao_Paulo' },
    colorId: getColorIdForProcedure(data.procedureType || "iv"),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 1440 },
        { method: 'popup', minutes: 120 },
      ],
    },
  };
}

// Convite B (decisao CEO): atualiza o MESMO evento (events.update, corpo completo) em vez de
// apagar+recriar. Mantem o evento no celular de quem ja salvou; NAO dispara "Evento cancelado".
export async function updateCalendarEvent(eventId: string, calendarId: string, data: CalendarEventData): Promise<void> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    await calendar.events.update({
      calendarId: calendarId || 'primary',
      eventId,
      requestBody: buildEventRequestBody(data),
      sendUpdates: 'none',
    });
  } catch (err: any) {
    console.error("Failed to update calendar event:", err.message);
    throw err;
  }
}

export async function updateCalendarEventDescription(eventId: string, calendarId: string, data: CalendarEventData): Promise<void> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();

    const description = buildDescriptionBody(data);

    await calendar.events.patch({
      calendarId: calendarId || 'primary',
      eventId,
      requestBody: { description },
    });
  } catch (err: any) {
    console.error("Failed to update calendar event:", err.message);
    throw err;
  }
}

export async function deleteCalendarEvent(eventId: string, calendarId?: string): Promise<void> {
  const calendar = await getUncachableGoogleCalendarClient();
  await calendar.events.delete({
    calendarId: calendarId || 'primary',
    eventId,
    // Nao dispara "Evento cancelado" ao mover de calendario.
    sendUpdates: 'none',
  });
}

export async function listCalendars(): Promise<any[]> {
  const calendar = await getUncachableGoogleCalendarClient();
  const res = await calendar.calendarList.list();
  return res.data.items ?? [];
}

// ── CRUD de CALENDÁRIOS (agendas) na conta da clínica ──────────────────────
// Usa o mesmo cliente/autenticação dos eventos. Escopos já concedidos:
// auth/calendar, calendar.calendars, calendar.acls, calendar.calendarlist.

export interface CreateCalendarOpts {
  timeZone?: string;
  description?: string;
}

// Cria uma agenda nova na conta da clínica. Retorna o id do calendário criado.
export async function createCalendar(summary: string, opts: CreateCalendarOpts = {}): Promise<string> {
  const calendar = await getUncachableGoogleCalendarClient();
  const res = await calendar.calendars.insert({
    requestBody: {
      summary,
      timeZone: opts.timeZone || "America/Sao_Paulo",
      description: opts.description,
    },
  });
  const id = res.data.id;
  if (!id) throw new Error("Google não retornou id do calendário criado");
  return id;
}

// Renomeia / atualiza summary, timeZone e description de uma agenda existente.
export async function renameCalendar(
  calendarId: string,
  newSummary: string,
  opts: CreateCalendarOpts = {},
): Promise<void> {
  const calendar = await getUncachableGoogleCalendarClient();
  await calendar.calendars.patch({
    calendarId,
    requestBody: {
      summary: newSummary,
      ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
      ...(opts.description !== undefined ? { description: opts.description } : {}),
    },
  });
}

// Apaga a agenda inteira (todos os eventos dentro são perdidos).
export async function deleteCalendar(calendarId: string): Promise<void> {
  const calendar = await getUncachableGoogleCalendarClient();
  await calendar.calendars.delete({ calendarId });
}

// Compartilha a agenda com um e-mail. role "writer" torna editável; "reader" só leitura.
export async function shareCalendar(
  calendarId: string,
  email: string,
  role: "reader" | "writer" | "owner" = "writer",
): Promise<void> {
  const calendar = await getUncachableGoogleCalendarClient();
  await calendar.acl.insert({
    calendarId,
    requestBody: { role, scope: { type: "user", value: email } },
  });
}

// Conta Google oficial da clinica. So empurramos eventos quando a conta
// conectada e exatamente esta (a agenda primaria identifica a conta logada).
export const CLINIC_GOOGLE_ACCOUNT = "clinica.padua.agenda@gmail.com";

let _clinicCheck: { ok: boolean; account: string | null; at: number } | null = null;
const CLINIC_CHECK_TTL = 5 * 60 * 1000;

/**
 * Confirma, via listCalendars(), que a conta Google conectada e a da clinica
 * ANTES de empurrar qualquer evento. Cacheia por 5 min. Se a conta nao for a
 * da clinica (ou nao der para confirmar), retorna ok:false e NAO se deve empurrar.
 */
export async function verifyClinicAccount(): Promise<{ ok: boolean; account: string | null }> {
  if (_clinicCheck && Date.now() - _clinicCheck.at < CLINIC_CHECK_TTL) {
    return { ok: _clinicCheck.ok, account: _clinicCheck.account };
  }
  try {
    const cals = await listCalendars();
    const primary = cals.find((c) => c.primary);
    const account = (primary?.id as string | undefined) ?? null;
    const ok = account === CLINIC_GOOGLE_ACCOUNT;
    _clinicCheck = { ok, account, at: Date.now() };
    return { ok, account };
  } catch {
    _clinicCheck = { ok: false, account: null, at: Date.now() };
    return { ok: false, account: null };
  }
}
