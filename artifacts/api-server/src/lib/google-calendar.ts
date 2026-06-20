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

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

function getDurationLabel(procKey: string): string {
  switch (procKey) {
    case "iv": return "30 MIN";
    case "im": return "15 MIN";
    case "implant": return "60 MIN";
    case "consultation": return "60 MIN";
    default: return "30 MIN";
  }
}

function buildProcedureChecklist(activeProcTypes: string[], totalDurationMinutes: number): string {
  const allProcedures = [
    { key: "consultation", label: "CONSULTA" },
    { key: "iv", label: "APLICACAO ENDOVENOSA" },
    { key: "im", label: "APLICACAO INTRAMUSCULAR" },
    { key: "implant", label: "IMPLANTE" },
  ];
  const lines = allProcedures
    .map(p => {
      const isActive = activeProcTypes.includes(p.key);
      if (isActive) {
        return `${p.label} ${getDurationLabel(p.key)} \u2705`;
      }
      return `${p.label} \u274C`;
    })
    .join("\n");

  const horas = Math.floor(totalDurationMinutes / 60);
  const minutos = totalDurationMinutes % 60;
  let totalLabel: string;
  if (horas > 0 && minutos > 0) {
    totalLabel = `${horas}H${String(minutos).padStart(2, '0')}MIN`;
  } else if (horas > 0) {
    totalLabel = `${horas}H00`;
  } else {
    totalLabel = `${totalDurationMinutes} MINUTOS`;
  }

  return `${lines}\n\nDURACAO TOTAL: ${totalLabel}`;
}

function getSessionStatusLine(sessionStatus?: string): string {
  if (sessionStatus === "completed") {
    return "STATUS: REALIZADO \uD83D\uDD35";
  } else if (sessionStatus === "missed" || sessionStatus === "cancelled") {
    return "STATUS: NAO REALIZADO \u26AB";
  }
  return "STATUS: A REALIZAR \uD83D\uDFE1";
}

function buildDescriptionBody(
  data: CalendarEventData,
  clientNameUpper: string,
  cpfFormatted: string,
  substanceList: string,
  legend: string,
): string {
  const procedureChecklist = buildProcedureChecklist(data.activeProcedureTypes, data.durationMinutes);
  const statusLine = getSessionStatusLine(data.sessionStatus);

  const addressBlock = buildAddressBlock(data.locationAddress, data.unit);
  const mapsLink = data.locationAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.locationAddress)}`
    : null;
  const wazeLink = data.locationAddress
    ? `https://waze.com/ul?q=${encodeURIComponent(data.locationAddress)}`
    : null;

  let desc = `PADCON CONECT - Protocolos Injetaveis\n\nCLIENTE ${clientNameUpper}\nCPF ${cpfFormatted}\nATENDIMENTO ${data.weekNumber}\nUNIDADE ${data.unit}\n\nPROCEDIMENTOS:\n${procedureChecklist}\n\n${statusLine}\n\nSUBSTANCIAS DO PROTOCOLO:\n${substanceList}${legend}`;

  if (addressBlock) {
    desc += `\n\n${addressBlock}`;
  }

  if (mapsLink) {
    desc += `\n\nNAVEGACAO:`;
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
    const endDate = new Date(startDate.getTime() + data.durationMinutes * 60 * 1000);

    const clientNameUpper = removeAccents(data.clientName).toUpperCase();
    const cpfFormatted = data.clientCpf || "";

    const statusDot: Record<SubstanceStatus, string> = {
      disp: "\uD83D\uDFE2",
      applied: "\uD83D\uDD35",
      prox: "\uD83D\uDFE4",
      missed: "\u26AB",
    };
    const statusTag: Record<SubstanceStatus, string> = {
      disp: "(DISP)",
      applied: "(APLICADA)",
      prox: "(PROX)",
      missed: "(N/A)",
    };

    const substanceList = data.substances
      .map(s => `${statusDot[s.status]} ${s.name} ${s.dose} (${s.sessionNumber}/${s.totalSessions}) ${statusTag[s.status]}`)
      .join("\n");

    const legend = `\n\n---\nLEGENDA\n\uD83D\uDFE2 DISP - DISPONIVEL PARA APLICACAO HOJE\n\uD83D\uDD35 APLICADA - SUBSTANCIA JA APLICADA\n\uD83D\uDFE4 PROX - PROXIMA APLICACAO (OUTRA DATA)\n\u26AB N/A - NAO DISPONIVEL`;

    const descriptionBody = buildDescriptionBody(data, clientNameUpper, cpfFormatted, substanceList, legend);

    const locationField = data.locationAddress || data.unit;

    const prefix = data.summaryPrefix ? `${data.summaryPrefix} ` : "";
    const event: any = {
      summary: `${prefix}${clientNameUpper} ${cpfFormatted} - Atend ${data.weekNumber} - ${data.procedureLabel}`,
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

    const clientNameUpper = removeAccents(data.clientName).toUpperCase();
    const cpfFormatted = data.clientCpf || "";

    const statusDot: Record<SubstanceStatus, string> = {
      disp: "\uD83D\uDFE2",
      applied: "\uD83D\uDD35",
      prox: "\uD83D\uDFE4",
      missed: "\u26AB",
    };
    const statusTag: Record<SubstanceStatus, string> = {
      disp: "(DISP)",
      applied: "(APLICADA)",
      prox: "(PROX)",
      missed: "(N/A)",
    };

    const substanceList = data.substances
      .map(s => `${statusDot[s.status]} ${s.name} ${s.dose} (${s.sessionNumber}/${s.totalSessions}) ${statusTag[s.status]}`)
      .join("\n");

    const legend = `\n\n---\nLEGENDA\n\uD83D\uDFE2 DISP - DISPONIVEL PARA APLICACAO HOJE\n\uD83D\uDD35 APLICADA - SUBSTANCIA JA APLICADA\n\uD83D\uDFE4 PROX - PROXIMA APLICACAO (OUTRA DATA)\n\u26AB N/A - NAO DISPONIVEL`;

    const description = buildDescriptionBody(data, clientNameUpper, cpfFormatted, substanceList, legend);

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
