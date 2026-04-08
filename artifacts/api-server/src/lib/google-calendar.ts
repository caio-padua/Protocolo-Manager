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

export interface CalendarEventData {
  sessionId: number;
  clientName: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  weekNumber: number;
  unit: string;
  procedureLabel: string;
  substances: Array<{
    name: string;
    dose: string;
    sessionNumber: number;
    totalSessions: number;
  }>;
  clientEmail?: string;
}

export async function createCalendarEvent(data: CalendarEventData): Promise<string | null> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();

    const [h, m] = data.scheduledTime.split(":").map(Number);
    const startDate = new Date(`${data.scheduledDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
    const endDate = new Date(startDate.getTime() + data.durationMinutes * 60 * 1000);

    const substanceList = data.substances
      .map(s => `- ${s.name} ${s.dose} (${s.sessionNumber}/${s.totalSessions})`)
      .join("\n");

    const description = `PADCOM - Protocolos Injetaveis\n\nCliente: ${data.clientName}\nProcedimento: ${data.procedureLabel}\nSemana: ${data.weekNumber}\nUnidade: ${data.unit}\n\nSubstancias:\n${substanceList}`;

    const event: any = {
      summary: `PADCOM: ${data.clientName} - Sem ${data.weekNumber} - ${data.procedureLabel}`,
      description,
      location: data.unit,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      colorId: '9',
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

    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: data.clientEmail ? 'all' : 'none',
    });

    return result.data.id ?? null;
  } catch (err: any) {
    console.error("Failed to create calendar event:", err.message);
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
