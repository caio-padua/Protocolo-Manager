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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

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

  let block = `\uD83D\uDCCD ENDERECO\n${(rua + (numero ? ", " + numero : "")).toUpperCase()}`;
  if (bairro) block += `\n${bairro.toUpperCase()}`;
  if (cidadeEstado) block += `\n${cidadeEstado.toUpperCase()}`;
  if (cep) block += `\nCEP ${cep}`;

  return block;
}

// Lista FIXA de procedimentos exibida no evento (padrao Pawards MedCore dos prints).
// Cada linha leva polegar (ativo/inativo) e a contagem de tempo entre colchetes.
const PROCEDURE_ROWS: Array<{ key: string; label: string; min: number }> = [
  { key: "im", label: "Aplicação Intramuscular", min: 15 },
  { key: "iv", label: "Aplicação Endovenosa", min: 30 },
  { key: "consultation", label: "Consulta", min: 60 },
  { key: "__retorno", label: "Retorno ou Avaliação", min: 30 },
  { key: "__especifico", label: "Procedimento Específico", min: 60 },
  { key: "implant", label: "Implante", min: 60 },
];

const THUMBS_UP = "\uD83D\uDC4D"; // 👍
const THUMBS_DOWN = "\uD83D\uDC4E"; // 👎

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
  "Legenda:\n" +
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
    const mark = active.has(row.key) ? THUMBS_UP : THUMBS_DOWN;
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

  let desc =
    `Developed by: Pawards MedCore\n\n` +
    `${data.clientName}\n` +
    `CPF.: ${data.clientCpf || "-"}\n` +
    `Agendamento Número: ${data.weekNumber}/${totalAppointments}\n` +
    `Unidade: ${data.unit}\n\n` +
    `Procedimentos:\n${procedureChecklist}\n` +
    `Duração Total: ${durationTotal}min\n\n` +
    `Status:\n${statusLine}\n\n` +
    `Substâncias Protocolo:\n${substanceList}\n\n` +
    `${SUBSTANCE_LEGEND}`;

  if (addressBlock) {
    desc += `\n\n${addressBlock}`;
  }

  if (mapsLink) {
    desc += `\n\nNavegação:`;
    desc += `\nGoogle Maps: ${mapsLink}`;
    if (wazeLink) {
      desc += `\nWaze: ${wazeLink}`;
    }
  }

  return desc;
}

export async function createCalendarEvent(data: CalendarEventData): Promise<string | null> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();

    const [h, m] = data.scheduledTime.split(":").map(Number);
    const startDate = new Date(`${data.scheduledDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
    const durationTotal = computeActiveDuration(data.activeProcedureTypes) || data.durationMinutes;
    const endDate = new Date(startDate.getTime() + durationTotal * 60 * 1000);

    const cpfFormatted = data.clientCpf || "";
    const prefix = data.summaryPrefix ? `${data.summaryPrefix} ` : "";

    const descriptionBody = buildDescriptionBody(data);

    const locationField = data.locationAddress || data.unit;

    const event: any = {
      summary: buildEventTitle(data.clientName, cpfFormatted, prefix),
      description: descriptionBody,
      location: locationField,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      colorId: getColorIdForProcedure(data.procedureType || "iv"),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    };

    if (data.clientEmail) {
      event.attendees = [{ email: data.clientEmail, displayName: data.clientName }];
    }

    const targetCalendarId = data.calendarId || 'primary';

    const result = await calendar.events.insert({
      calendarId: targetCalendarId,
      requestBody: event,
      sendUpdates: data.clientEmail ? 'all' : 'none',
    });

    return result.data.id ?? null;
  } catch (err: any) {
    console.error("Failed to create calendar event:", err.message);
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
  });
}

export async function listCalendars(): Promise<any[]> {
  const calendar = await getUncachableGoogleCalendarClient();
  const res = await calendar.calendarList.list();
  return res.data.items ?? [];
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
