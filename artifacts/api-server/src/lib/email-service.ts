import { isGmailConnected } from "./google-gmail";
import { buildVCalendar, durationFromProcedureTypes, nextSequence, type IcsEventInput } from "./ics";
import { enviarMensagemPaxter, baseUrlFromEnv, type PaxterDoc } from "./messaging/index.js";
import { blocoTabelaSubstancias } from "./messaging/substance-table.js";

export interface PreSessionEmailData {
  clientName: string;
  clientEmail: string;
  validationCode: string;
  scheduledDate: string;
  scheduledTime: string;
  procedureLabel: string;
  substances: Array<{
    name: string;
    dose: string;
    color: string;
    procedureType: string;
    sessionNumber: number;
    totalSessions: number;
    description?: string;
    mainFunction?: string;
    perceivedEffects?: string;
    timeToEffect?: string;
    longevityBenefit?: string;
    sleepBenefit?: string;
    energyBenefit?: string;
    physicalPerformance?: string;
    skinHairNails?: string;
    categoryType?: string;
    starRating?: number;
    bodySystemEffects?: Record<string, number>;
  }>;
  unit: string;
  locationAddress?: string;
  isFirstSession?: boolean;
  // SUB-04: dados para anexar o convite .ics (METHOD:PUBLISH) ao e-mail.
  sessionId?: number;
  weekNumber?: number;
  sessionStatus?: string;
}

export interface PostSessionEmailData {
  clientName: string;
  clientEmail: string;
  scheduledDate: string;
  substances: Array<{
    name: string;
    dose: string;
    color: string;
    status: string;
  }>;
  rasPdfBuffer?: Buffer;
  rasId?: number;
}

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function procedureTypeLabel(type: string): string {
  switch (type) {
    case "iv": return "Aplicacao Endovenosa";
    case "im": return "Aplicacao Intramuscular";
    case "implant": return "Implante";
    default: return "Procedimento";
  }
}

function procedureTypeEmoji(type: string): string {
  switch (type) {
    case "iv": return "&#128167;";
    case "im": return "&#128137;";
    case "implant": return "&#9881;";
    default: return "&#9733;";
  }
}

const BODY_SYSTEM_LABELS: Record<string, { label: string; color: string }> = {
  cardiovascular: { label: "Cardiovascular", color: "#EF4444" },
  respiratorio: { label: "Respiratorio", color: "#06B6D4" },
  muscular_hipertrofia: { label: "Muscular / Hipertrofia", color: "#F97316" },
  emagrecimento: { label: "Emagrecimento / Sobrepeso", color: "#84CC16" },
  neurocognicao: { label: "Neurocognicao", color: "#8B5CF6" },
  metabolismo_tireoide: { label: "Metabolismo / Tireoide", color: "#F59E0B" },
  libido_sexual: { label: "Libido / Sexual", color: "#EC4899" },
  performance_fisica: { label: "Performance Fisica", color: "#14B8A6" },
  imunologico: { label: "Imunologico", color: "#10B981" },
  dermatologico: { label: "Pele / Cabelo / Unhas", color: "#A855F7" },
  hepatico: { label: "Hepatico / Detox", color: "#6366F1" },
  longevidade: { label: "Longevidade", color: "#0EA5E9" },
};

function starsHTML(rating: number): string {
  const filled = "&#9733;";
  const empty = "&#9734;";
  return `<span style="color: #F59E0B; font-size: 14px; letter-spacing: 1px;">${filled.repeat(rating)}${empty.repeat(5 - rating)}</span>`;
}

function percentBar(score: number, color: string): string {
  const pct = score * 20;
  return `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
      <div style="width: 100px; height: 8px; background: rgba(255,255,255,.10); border-radius: 4px; overflow: hidden;">
        <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
      </div>
      <span style="font-size: 11px; color: #7e90ab; min-width: 35px;">${pct}%</span>
    </div>`;
}

function buildBodySystemTable(effects: Record<string, number>): string {
  const rows = Object.entries(BODY_SYSTEM_LABELS)
    .filter(([key]) => effects[key] !== undefined && effects[key] > 0)
    .map(([key, info]) => {
      const score = effects[key];
      const pct = score * 20;
      return `
      <tr>
        <td style="padding: 6px 12px; border-bottom: 1px solid rgba(201,162,79,.12); font-size: 12px; color: #c2cee0;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${info.color}; margin-right: 6px;"></span>
          ${info.label}
        </td>
        <td style="padding: 6px 12px; border-bottom: 1px solid rgba(201,162,79,.12); text-align: center;">
          ${starsHTML(score)}
        </td>
        <td style="padding: 6px 12px; border-bottom: 1px solid rgba(201,162,79,.12); width: 150px;">
          <div style="width: 100%; height: 8px; background: rgba(255,255,255,.10); border-radius: 4px; overflow: hidden;">
            <div style="width: ${pct}%; height: 100%; background: ${info.color}; border-radius: 4px;"></div>
          </div>
        </td>
        <td style="padding: 6px 12px; border-bottom: 1px solid rgba(201,162,79,.12); text-align: center; font-size: 12px; color: #7e90ab; font-weight: 600;">
          ${pct}%
        </td>
      </tr>`;
    }).join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(201,162,79,.25); border-radius: 8px; overflow: hidden; margin-top: 8px;">
      <thead>
        <tr style="background: #102043;">
          <th style="padding: 8px 12px; text-align: left; color: #c9a24f; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Sistema</th>
          <th style="padding: 8px 12px; text-align: center; color: #c9a24f; font-size: 11px; text-transform: uppercase;">Impacto</th>
          <th style="padding: 8px 12px; text-align: center; color: #c9a24f; font-size: 11px; text-transform: uppercase;">Barra</th>
          <th style="padding: 8px 12px; text-align: center; color: #c9a24f; font-size: 11px; text-transform: uppercase;">%</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

function buildSubstanceDetailBlock(s: PreSessionEmailData["substances"][0]): string {
  const chip = (label: string, value: string) =>
    `<div style="background: #0b1426; border: 1px solid rgba(201,162,79,.20); border-radius: 6px; padding: 8px 12px;"><span style="color: #c2cee0; font-size: 12px;"><strong style="color: #c9a24f;">${label}:</strong> ${value}</span></div>`;
  return `
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.20); border-left: 5px solid ${s.color}; border-radius: 0 12px 12px 0; padding: 20px; margin-bottom: 16px;">
      <div style="margin-bottom: 12px;">
        <div style="margin-bottom: 4px;">
          <strong style="font-size: 17px; color: #f3ead6;">${s.name}</strong>
        </div>
        <div style="margin-top: 4px;">
          ${s.categoryType ? `<span style="background: #102043; color: #c9a24f; border: 1px solid rgba(201,162,79,.30); padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-right: 6px;">${s.categoryType}</span>` : ""}
          ${s.starRating ? starsHTML(s.starRating) : ""}
        </div>
      </div>

      ${s.description ? `<p style="color: #c2cee0; font-size: 13px; margin: 0 0 10px; line-height: 1.6;">${s.description}</p>` : ""}
      ${s.mainFunction ? `<p style="color: #9fc7d6; font-size: 13px; margin: 0 0 10px;"><strong style="color: #c9a24f;">Funcao principal:</strong> ${s.mainFunction}</p>` : ""}

      ${s.bodySystemEffects && Object.keys(s.bodySystemEffects).length > 0 ? `
        <h4 style="color: #f3ead6; font-size: 13px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">Impacto por Sistema Corporal</h4>
        ${buildBodySystemTable(s.bodySystemEffects)}
      ` : ""}

      <div style="display: grid; gap: 6px; margin-top: 12px;">
        ${s.perceivedEffects ? chip("Efeitos percebidos", s.perceivedEffects) : ""}
        ${s.timeToEffect ? chip("Tempo para resultado", s.timeToEffect) : ""}
        ${s.energyBenefit ? chip("Energia", s.energyBenefit) : ""}
        ${s.sleepBenefit ? chip("Sono", s.sleepBenefit) : ""}
        ${s.physicalPerformance ? chip("Performance fisica", s.physicalPerformance) : ""}
        ${s.skinHairNails ? chip("Pele, cabelo e unhas", s.skinHairNails) : ""}
        ${s.longevityBenefit ? chip("Longevidade", s.longevityBenefit) : ""}
      </div>

      ${s.timeToEffect ? `
      <div style="background: #0b1426; border: 1px solid rgba(201,162,79,.16); border-radius: 6px; padding: 8px 12px; margin-top: 8px;">
        <span style="color: #7e90ab; font-size: 11px; font-style: italic;">* Os resultados podem variar de paciente para paciente, de acordo com o organismo e estilo de vida individual.</span>
      </div>
      ` : ""}
    </div>`;
}

function preSessionBlocks(data: PreSessionEmailData): string[] {
  const blocks: string[] = [];

  // Caixa do codigo de validacao (navy + codigo em ouro)
  blocks.push(`
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.30); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 16px;">
      <p style="margin: 0 0 8px; color: #7e90ab; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Seu codigo de validacao</p>
      <p style="margin: 0; font-size: 34px; font-weight: 800; color: #c9a24f; letter-spacing: 6px; font-family: 'Courier New', monospace;">${data.validationCode}</p>
      <p style="margin: 8px 0 0; color: #62748f; font-size: 12px;">Apresente este codigo na recepcao</p>
    </div>`);

  // Aviso do .ics (so quando ha sessionId)
  if (data.sessionId != null) {
    blocks.push(`
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.25); border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 16px;">
      <p style="margin: 0 0 4px; color: #c9a24f; font-size: 15px; font-weight: 700; font-family: Georgia,serif;">Adicione a sua agenda</p>
      <p style="margin: 0; color: #c2cee0; font-size: 13px;">O convite <strong>agenda-paxter.ics</strong> esta anexado a este e-mail. Toque nele para salvar a sessao no calendario do seu celular.</p>
    </div>`);
  }

  // Cabecalho do procedimento + substancias em CARTOES ALINHADOS (fonte unica
  // blocoTabelaSubstancias: dose so na miligramagem, colunas alinhadas por
  // linha vertical imaginaria — decisao do CEO 30/06/2026).
  blocks.push(
    `<h2 style="color: #f3ead6; font-family: Georgia,serif; font-size: 18px; margin: 8px 0 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(201,162,79,.25);">${procedureTypeEmoji(data.substances[0]?.procedureType ?? "iv")} ${data.procedureLabel}</h2>` +
      blocoTabelaSubstancias(
        data.substances.map(s => ({
          nome: s.name,
          dose: s.dose,
          sessao: `${s.sessionNumber}/${s.totalSessions}`,
          cor: s.color,
        })),
      ),
  );

  // Primeira sessao: detalhe por substancia + termos de consentimento
  if (data.isFirstSession) {
    blocks.push(`
    <h2 style="color: #f3ead6; font-family: Georgia,serif; font-size: 18px; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(201,162,79,.25);">Sobre suas substancias</h2>
    <p style="color: #7e90ab; font-size: 13px; margin: 0 0 16px;">Abaixo, apresentamos cada substancia do seu protocolo com informacoes detalhadas sobre os beneficios, impacto por sistema corporal e classificacao de eficacia.</p>
    ${data.substances.map(s => buildSubstanceDetailBlock(s)).join("")}
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.20); border-radius: 8px; padding: 16px; margin-top: 8px;">
      <h3 style="color: #c9a24f; font-size: 14px; margin: 0 0 8px;">Termos de Consentimento</h3>
      <p style="color: #c2cee0; font-size: 12px; margin: 0; line-height: 1.6;">Ao prosseguir com o tratamento, o(a) paciente declara estar ciente dos procedimentos a serem realizados, incluindo aplicacoes endovenosas, intramusculares e/ou implantes subcutaneos. O paciente foi informado sobre os beneficios esperados, possiveis efeitos colaterais e contraindicacoes de cada substancia. O consentimento formal sera registrado presencialmente antes da primeira aplicacao, conforme exigencias da ANVISA e do Conselho Federal de Medicina (CFM). O RAS (Registro de Administracao de Substancias) sera emitido e assinado digitalmente com certificado ICP-Brasil A1 apos cada sessao.</p>
    </div>`);
  }

  // Aviso RAS
  blocks.push(`
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.25); border-radius: 8px; padding: 16px; margin-top: 16px;">
      <p style="margin: 0; color: #c2cee0; font-size: 13px;"><strong style="color: #c9a24f;">Importante:</strong> Este e-mail contem as substancias previstas para sua sessao. Apos a aplicacao, voce recebera o RAS (Registro de Administracao de Substancias) completo assinado digitalmente.</p>
    </div>`);

  // Local
  if (data.locationAddress) {
    blocks.push(`
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.20); border-radius: 8px; padding: 12px 16px; margin-top: 12px;">
      <p style="margin: 0; color: #c2cee0; font-size: 13px;"><strong style="color: #c9a24f;">Local:</strong> ${data.unit}<br><span style="color: #7e90ab;">${data.locationAddress}</span></p>
    </div>`);
  }

  return blocks;
}

function postSessionBlocks(data: PostSessionEmailData): string[] {
  // Substancias aplicadas em CARTOES ALINHADOS (mesma fonte unica): dose so na
  // miligramagem, pilula de status Aplicado/Nao aplicado.
  const blocks: string[] = [
    blocoTabelaSubstancias(
      data.substances.map(s => ({
        nome: s.name,
        dose: s.dose,
        status: s.status === "applied" ? "applied" : "notApplied",
        cor: s.color,
      })),
    ),
  ];

  if (data.rasPdfBuffer) {
    blocks.push(`
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.25); border-radius: 8px; padding: 16px; text-align: center;">
      <p style="margin: 0; color: #c2cee0; font-size: 14px;"><strong style="color: #c9a24f;">RAS assinado digitalmente em anexo</strong><br><span style="color: #7e90ab; font-size: 13px;">Documento com assinatura digital ICP-Brasil A1</span></p>
    </div>`);
  }

  return blocks;
}

export async function sendPreSessionEmail(data: PreSessionEmailData): Promise<{ success: boolean; error?: string }> {
  const procType = data.substances[0]?.procedureType ?? "iv";
  const subject = `Instituto Padua | ${procedureTypeLabel(procType)} | ${data.validationCode}`;

  // SUB-04: anexa o convite .ics (PUBLISH, UID estável, SEQUENCE, fuso BRT) para
  // o cliente ADICIONAR à própria agenda. Só anexa quando há sessionId.
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (data.sessionId != null) {
    const ics = buildVCalendar([
      {
        sessionId: data.sessionId,
        clientName: data.clientName,
        scheduledDate: data.scheduledDate,
        scheduledTime: data.scheduledTime,
        weekNumber: data.weekNumber ?? 1,
        unit: data.unit,
        status: data.sessionStatus ?? "confirmed",
        durationMinutes: durationFromProcedureTypes(data.substances.map(s => s.procedureType)),
        descriptionLines: data.substances.map(s => `${s.name} ${s.sessionNumber}/${s.totalSessions}`),
        sequence: nextSequence(),
      },
    ]);
    attachments.push({
      filename: "agenda-paxter.ics",
      content: Buffer.from(ics, "utf-8"),
      contentType: "text/calendar; charset=utf-8; method=PUBLISH",
    });
  }

  const intro: string[] = [
    `Voce tem uma sessao agendada para ${formatDateBR(data.scheduledDate)} as ${data.scheduledTime} na unidade ${data.unit}.`,
  ];
  if (data.locationAddress) intro.push(`Endereco: ${data.locationAddress}`);

  const doc: PaxterDoc = {
    eyebrow: `Ola, ${data.clientName}`,
    titulo: "Sessao agendada",
    paragrafos: intro,
    blocosHtml: preSessionBlocks(data),
    anexos: attachments,
    assunto: subject,
  };
  const envio = await enviarMensagemPaxter(doc, { email: data.clientEmail, nome: data.clientName }, ["EMAIL"], { baseUrl: baseUrlFromEnv() });
  const r0 = envio.resultados[0];
  return { success: r0?.sent ?? false, error: r0?.sent ? undefined : (r0?.error ?? "Falha no envio") };
}

export interface OnboardingEmailData {
  clientName: string;
  clientEmail: string;
  events: IcsEventInput[];
}

// SUB-04 item 5: e-mail de boas-vindas ao FECHAR/VALIDAR o protocolo, com o
// .ics CONSOLIDADO de todas as sessões (mesmo UID por sessão, então reimportar
// não duplica). Evento-disparado (não é tarefa agendada).
export async function sendProtocolOnboardingEmail(data: OnboardingEmailData): Promise<{ success: boolean; error?: string }> {
  if (data.events.length === 0) {
    return { success: false, error: "no sessions to onboard" };
  }
  const ics = buildVCalendar(data.events, { calName: `Instituto Pádua — ${data.clientName}` });
  const subject = `Instituto Padua | Bem-vindo ao seu protocolo | Agenda anexada`;

  const doc: PaxterDoc = {
    eyebrow: `Ola, ${data.clientName}`,
    titulo: "Bem-vindo ao seu protocolo",
    paragrafos: ["Seu protocolo foi confirmado. Abaixo estao todas as suas sessoes."],
    blocosHtml: onboardingBlocks(data),
    anexos: [{
      filename: "agenda-completa-paxter.ics",
      content: Buffer.from(ics, "utf-8"),
      contentType: "text/calendar; charset=utf-8; method=PUBLISH",
    }],
    assunto: subject,
  };
  const envio = await enviarMensagemPaxter(doc, { email: data.clientEmail, nome: data.clientName }, ["EMAIL"], { baseUrl: baseUrlFromEnv() });
  const r0 = envio.resultados[0];
  return { success: r0?.sent ?? false, error: r0?.sent ? undefined : (r0?.error ?? "Falha no envio") };
}

function onboardingBlocks(data: OnboardingEmailData): string[] {
  const rows = data.events.map(ev => `
    <tr>
      <td style="padding: 10px 16px; border-bottom: 1px solid rgba(201,162,79,.12); color: #f3ead6;"><strong>Semana ${ev.weekNumber}</strong></td>
      <td style="padding: 10px 16px; border-bottom: 1px solid rgba(201,162,79,.12); color: #c2cee0;">${formatDateBR(ev.scheduledDate)} as ${ev.scheduledTime}</td>
      <td style="padding: 10px 16px; border-bottom: 1px solid rgba(201,162,79,.12); color: #7e90ab;">${ev.unit ?? "Instituto Pádua"}</td>
    </tr>`).join("");

  return [`
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.25); border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 16px;">
      <p style="margin: 0 0 4px; color: #c9a24f; font-size: 15px; font-weight: 700; font-family: Georgia,serif;">Adicione a sua agenda</p>
      <p style="margin: 0; color: #c2cee0; font-size: 13px;">O convite <strong>agenda-completa-paxter.ics</strong> esta anexado: toque nele para salvar TODAS as sessoes no calendario do seu celular de uma vez.</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(201,162,79,.25); border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #102043;">
          <th style="padding: 10px 16px; text-align: left; color: #c9a24f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Semana</th>
          <th style="padding: 10px 16px; text-align: left; color: #c9a24f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Data</th>
          <th style="padding: 10px 16px; text-align: left; color: #c9a24f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Unidade</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`];
}

export async function sendPostSessionEmail(data: PostSessionEmailData): Promise<{ success: boolean; error?: string }> {
  const subject = `Instituto Padua | Sessao Concluida | ${formatDateBR(data.scheduledDate)}`;

  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (data.rasPdfBuffer && data.rasId) {
    attachments.push({
      filename: `RAS_${data.rasId}_${data.clientName.replace(/\s+/g, "_")}.pdf`,
      content: data.rasPdfBuffer,
      contentType: "application/pdf",
    });
  }

  const doc: PaxterDoc = {
    eyebrow: `Ola, ${data.clientName}`,
    titulo: "Sessao concluida",
    paragrafos: [
      `Sua sessao do dia ${formatDateBR(data.scheduledDate)} foi concluida com sucesso.`,
      "Segue abaixo o resumo das substancias administradas.",
    ],
    blocosHtml: postSessionBlocks(data),
    anexos: attachments,
    assunto: subject,
  };
  const envio = await enviarMensagemPaxter(doc, { email: data.clientEmail, nome: data.clientName }, ["EMAIL"], { baseUrl: baseUrlFromEnv() });
  const r0 = envio.resultados[0];
  return { success: r0?.sent ?? false, error: r0?.sent ? undefined : (r0?.error ?? "Falha no envio") };
}

export interface ProtocolEmailData {
  clientName: string;
  clientEmail: string;
  protocolTitle: string;
  professionalName: string;
  startDate: string;
  substances: Array<{ name: string; color: string; totalSessions: number }>;
  pdfBuffer: Buffer;
  pdfFileName: string;
}

function protocolBlocks(data: ProtocolEmailData): string[] {
  // Substancias do protocolo em CARTOES ALINHADOS (mesma fonte unica). Este
  // e-mail de onboarding nao carrega dose por substancia — o detalhamento
  // completo (doses e cronograma) vai no RAS FAP anexo, como o texto avisa.
  // Aqui os cartoes trazem nome + ponto colorido + total de sessoes previstas
  // (rotulo "Sessoes" na linha 2, sem coluna de frequencia).
  const substList = blocoTabelaSubstancias(
    data.substances.map(s => ({
      nome: s.name,
      cor: s.color,
      sessao: String(s.totalSessions),
      sessaoLabel: "Sessões",
    })),
  );

  return [`
    <p style="color: #c2cee0; font-size: 15px; margin: 0 0 16px; line-height: 1.7;">Este e-mail tem o objetivo de informar que o seu protocolo medico personalizado <strong style="color: #c9a24f;">${data.protocolTitle}</strong> foi elaborado pelo Dr(a). <strong style="color: #f3ead6;">${data.professionalName}</strong>, com inicio previsto para <strong style="color: #c9a24f;">${formatDateBR(data.startDate)}</strong>.</p>
    <p style="color: #c2cee0; font-size: 15px; margin: 0 0 20px; line-height: 1.7;">Segue em anexo o documento <strong style="color: #c9a24f;">RAS FAP</strong> (Registro de Administracao de Substancias) contendo o detalhamento completo das substancias, cronograma de sessoes e espacos para controle presencial de cada aplicacao.</p>
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.25); border-radius: 8px; padding: 20px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 12px; color: #c9a24f; font-size: 15px;">Substancias do seu protocolo:</h3>
      ${substList}
    </div>
    <div style="background: #0f1d3a; border: 1px solid rgba(201,162,79,.25); border-radius: 8px; padding: 16px;">
      <p style="margin: 0; color: #c2cee0; font-size: 13px; line-height: 1.6;"><strong style="color: #c9a24f;">Importante:</strong> Este documento deve ser apresentado em todas as sessoes presenciais para controle e rubrica da enfermeira responsavel. Em caso de duvidas, entre em contato com a clinica.</p>
    </div>`];
}

export async function sendProtocolEmail(data: ProtocolEmailData): Promise<{ success: boolean; error?: string }> {
  const doc: PaxterDoc = {
    eyebrow: `Prezado(a) Sr(a). ${data.clientName}`,
    titulo: "Protocolo medico personalizado",
    paragrafos: ["Seu protocolo medico personalizado foi elaborado. Veja os detalhes abaixo."],
    blocosHtml: protocolBlocks(data),
    anexos: [{
      filename: data.pdfFileName,
      content: data.pdfBuffer,
      contentType: "application/pdf",
    }],
    assunto: "Instituto Padua | Protocolo medico personalizado",
  };
  const envio = await enviarMensagemPaxter(doc, { email: data.clientEmail, nome: data.clientName }, ["EMAIL"], { baseUrl: baseUrlFromEnv() });
  const r0 = envio.resultados[0];
  return { success: r0?.sent ?? false, error: r0?.sent ? undefined : (r0?.error ?? "Falha no envio") };
}

export async function isEmailConfigured(): Promise<boolean> {
  return isGmailConnected();
}
