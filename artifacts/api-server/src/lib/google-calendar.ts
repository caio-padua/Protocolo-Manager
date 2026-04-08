// Replit Integration: Google Calendar (connector: google-calendar)
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
  substances: CalendarSubstance[];
  clientEmail?: string;
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

export async function createCalendarEvent(data: CalendarEventData): Promise<string | null> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();

    const [h, m] = data.scheduledTime.split(":").map(Number);
    const startDate = new Date(`${data.scheduledDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
    const endDate = new Date(startDate.getTime() + data.durationMinutes * 60 * 1000);

    const clientNameUpper = removeAccents(data.clientName).toUpperCase();
    const cpfPart = data.clientCpf ? ` ${data.clientCpf}` : "";

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

    const addressBlock = buildAddressBlock(data.locationAddress, data.unit);
    const mapsLink = data.locationAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.locationAddress)}`
      : null;
    const wazeLink = data.locationAddress
      ? `https://waze.com/ul?q=${encodeURIComponent(data.locationAddress)}`
      : null;

    let description = `PADCOM - Protocolos Injetaveis\n\nCliente: ${clientNameUpper}${cpfPart}\nProcedimento: ${data.procedureLabel}\nSemana: ${data.weekNumber}\nUnidade: ${data.unit}\n\nSUBSTANCIAS DO PROTOCOLO:\n${substanceList}${legend}`;

    if (addressBlock) {
      description += `\n\n${addressBlock}`;
    }

    if (mapsLink) {
      description += `\n\nNAVEGACAO:`;
      description += `\nGoogle Maps: ${mapsLink}`;
      if (wazeLink) {
        description += `\nWaze: ${wazeLink}`;
      }
    }

    const locationField = data.locationAddress || data.unit;

    const event: any = {
      summary: `${clientNameUpper}${cpfPart} - Sem ${data.weekNumber} - ${data.procedureLabel}`,
      description,
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
    const cpfPart = data.clientCpf ? ` ${data.clientCpf}` : "";

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

    const addressBlock = buildAddressBlock(data.locationAddress, data.unit);
    const mapsLink = data.locationAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.locationAddress)}`
      : null;
    const wazeLink = data.locationAddress
      ? `https://waze.com/ul?q=${encodeURIComponent(data.locationAddress)}`
      : null;

    let description = `PADCOM - Protocolos Injetaveis\n\nCliente: ${clientNameUpper}${cpfPart}\nProcedimento: ${data.procedureLabel}\nSemana: ${data.weekNumber}\nUnidade: ${data.unit}\n\nSUBSTANCIAS DO PROTOCOLO:\n${substanceList}${legend}`;

    if (addressBlock) {
      description += `\n\n${addressBlock}`;
    }

    if (mapsLink) {
      description += `\n\nNAVEGACAO:`;
      description += `\nGoogle Maps: ${mapsLink}`;
      if (wazeLink) {
        description += `\nWaze: ${wazeLink}`;
      }
    }

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

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const calendar = await getUncachableGoogleCalendarClient();
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });
}

export async function listCalendars(): Promise<any[]> {
  const calendar = await getUncachableGoogleCalendarClient();
  const res = await calendar.calendarList.list();
  return res.data.items ?? [];
}
