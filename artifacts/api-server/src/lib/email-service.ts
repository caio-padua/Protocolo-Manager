import { sendGmailMessage, isGmailConnected } from "./google-gmail";

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
  }>;
  unit: string;
  isFirstSession?: boolean;
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

function buildPreSessionHTML(data: PreSessionEmailData): string {
  const substanceRows = data.substances.map(s => `
    <tr>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${s.color}; margin-right: 8px;"></span>
          <strong style="color: #1e293b;">${s.name}</strong>
        </div>
        ${s.mainFunction ? `<div style="color: #64748b; font-size: 13px; margin-top: 4px;">${s.mainFunction}</div>` : ""}
      </td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; text-align: center; color: #475569;">
        ${s.dose}
      </td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; text-align: center;">
        <span style="background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
          ${s.sessionNumber}/${s.totalSessions}
        </span>
      </td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f1f5f9; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
          
          <tr>
            <td style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 1px;">CLINICA PADUA</h1>
              <p style="margin: 8px 0 0; color: #bfdbfe; font-size: 14px;">Protocolos Injetaveis</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 40px;">
              <p style="color: #475569; font-size: 16px; margin: 0 0 8px;">Ola, <strong style="color: #1e293b;">${data.clientName}</strong>!</p>
              <p style="color: #64748b; font-size: 15px; margin: 0 0 24px;">
                Voce tem uma sessao agendada para <strong style="color: #1e40af;">${formatDateBR(data.scheduledDate)}</strong> 
                as <strong style="color: #1e40af;">${data.scheduledTime}</strong> na unidade <strong>${data.unit}</strong>.
              </p>

              <div style="background: #f0f9ff; border: 2px solid #bae6fd; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Seu codigo de validacao</p>
                <p style="margin: 0; font-size: 36px; font-weight: 800; color: #0369a1; letter-spacing: 6px; font-family: 'Courier New', monospace;">${data.validationCode}</p>
                <p style="margin: 8px 0 0; color: #94a3b8; font-size: 12px;">Apresente este codigo na recepcao</p>
              </div>

              <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">
                ${procedureTypeEmoji(data.substances[0]?.procedureType ?? "iv")} ${data.procedureLabel}
              </h2>

              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background: #f8fafc;">
                    <th style="padding: 10px 16px; text-align: left; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Substancia</th>
                    <th style="padding: 10px 16px; text-align: center; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Dose</th>
                    <th style="padding: 10px 16px; text-align: center; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Sessao</th>
                  </tr>
                </thead>
                <tbody>
                  ${substanceRows}
                </tbody>
              </table>

              ${data.isFirstSession ? `
              <h2 style="color: #1e293b; font-size: 18px; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">
                Sobre suas substancias
              </h2>
              ${data.substances.map(s => `
              <div style="background: #f8fafc; border-left: 4px solid ${s.color}; border-radius: 0 8px 8px 0; padding: 16px; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                  <strong style="font-size: 16px; color: #1e293b;">${s.name}</strong>
                  ${s.categoryType ? `<span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-size: 11px;">${s.categoryType}</span>` : ""}
                  ${s.starRating ? `<span style="color: #f59e0b; font-size: 14px;">${"&#9733;".repeat(s.starRating)}${"&#9734;".repeat(5 - s.starRating)}</span>` : ""}
                </div>
                ${s.description ? `<p style="color: #475569; font-size: 13px; margin: 0 0 8px; line-height: 1.5;">${s.description}</p>` : ""}
                ${s.mainFunction ? `<p style="color: #1e40af; font-size: 13px; margin: 0 0 8px;"><strong>Funcao:</strong> ${s.mainFunction}</p>` : ""}
                <div style="display: grid; gap: 6px;">
                  ${s.perceivedEffects ? `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px;"><span style="color: #166534; font-size: 12px;"><strong>Efeitos Percebidos:</strong> ${s.perceivedEffects}</span></div>` : ""}
                  ${s.timeToEffect ? `<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px;"><span style="color: #92400e; font-size: 12px;"><strong>Tempo para Resultado:</strong> ${s.timeToEffect}</span></div>` : ""}
                  ${s.energyBenefit ? `<div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 8px 12px;"><span style="color: #92400e; font-size: 12px;"><strong>Energia:</strong> ${s.energyBenefit}</span></div>` : ""}
                  ${s.sleepBenefit ? `<div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 8px 12px;"><span style="color: #3730a3; font-size: 12px;"><strong>Sono:</strong> ${s.sleepBenefit}</span></div>` : ""}
                  ${s.physicalPerformance ? `<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 8px 12px;"><span style="color: #9a3412; font-size: 12px;"><strong>Performance Fisica:</strong> ${s.physicalPerformance}</span></div>` : ""}
                  ${s.skinHairNails ? `<div style="background: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 6px; padding: 8px 12px;"><span style="color: #9d174d; font-size: 12px;"><strong>Pele, Cabelo e Unhas:</strong> ${s.skinHairNails}</span></div>` : ""}
                  ${s.longevityBenefit ? `<div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 8px 12px;"><span style="color: #065f46; font-size: 12px;"><strong>Longevidade:</strong> ${s.longevityBenefit}</span></div>` : ""}
                </div>
              </div>
              `).join("")}
              ` : ""}

              <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-top: 24px;">
                <p style="margin: 0; color: #92400e; font-size: 13px;">
                  <strong>Importante:</strong> Este e-mail contem as substancias previstas para sua sessao. 
                  Apos a aplicacao, voce recebera o RAS (Registro de Administracao de Substancias) completo assinado digitalmente.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                Clinica Padua -- Protocolos Injetaveis<br>
                Este e-mail foi enviado automaticamente pelo sistema PADCOM.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPostSessionHTML(data: PostSessionEmailData): string {
  const substanceRows = data.substances.map(s => `
    <tr>
      <td style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0;">
        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${s.color}; margin-right: 6px;"></span>
        <strong>${s.name}</strong>
      </td>
      <td style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; text-align: center;">${s.dose}</td>
      <td style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; text-align: center;">
        <span style="background: ${s.status === 'applied' ? '#dcfce7' : '#fee2e2'}; color: ${s.status === 'applied' ? '#166534' : '#991b1b'}; padding: 2px 10px; border-radius: 12px; font-size: 12px;">
          ${s.status === 'applied' ? 'Aplicado' : 'Nao aplicado'}
        </span>
      </td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f1f5f9; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
          
          <tr>
            <td style="background: linear-gradient(135deg, #059669, #10b981); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 1px;">CLINICA PADUA</h1>
              <p style="margin: 8px 0 0; color: #a7f3d0; font-size: 14px;">Sessao Concluida</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 40px;">
              <p style="color: #475569; font-size: 16px; margin: 0 0 8px;">Ola, <strong style="color: #1e293b;">${data.clientName}</strong>!</p>
              <p style="color: #64748b; font-size: 15px; margin: 0 0 24px;">
                Sua sessao do dia <strong style="color: #059669;">${formatDateBR(data.scheduledDate)}</strong> foi concluida com sucesso.
                Segue abaixo o resumo das substancias administradas.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
                <thead>
                  <tr style="background: #f8fafc;">
                    <th style="padding: 10px 16px; text-align: left; color: #64748b; font-size: 12px; text-transform: uppercase;">Substancia</th>
                    <th style="padding: 10px 16px; text-align: center; color: #64748b; font-size: 12px; text-transform: uppercase;">Dose</th>
                    <th style="padding: 10px 16px; text-align: center; color: #64748b; font-size: 12px; text-transform: uppercase;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${substanceRows}
                </tbody>
              </table>

              ${data.rasPdfBuffer ? `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center;">
                <p style="margin: 0; color: #166534; font-size: 14px;">
                  <strong>RAS assinado digitalmente em anexo</strong><br>
                  <span style="color: #4ade80; font-size: 13px;">Documento com assinatura digital ICP-Brasil A1</span>
                </p>
              </div>
              ` : ""}
            </td>
          </tr>

          <tr>
            <td style="background: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                Clinica Padua -- Protocolos Injetaveis<br>
                Este e-mail foi enviado automaticamente pelo sistema PADCOM.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPreSessionEmail(data: PreSessionEmailData): Promise<{ success: boolean; error?: string }> {
  const procType = data.substances[0]?.procedureType ?? "iv";
  const subject = `Clinica Padua | ${procedureTypeLabel(procType)} | ${data.validationCode}`;

  return sendGmailMessage({
    to: data.clientEmail,
    subject,
    html: buildPreSessionHTML(data),
  });
}

export async function sendPostSessionEmail(data: PostSessionEmailData): Promise<{ success: boolean; error?: string }> {
  const subject = `Clinica Padua | Sessao Concluida | ${formatDateBR(data.scheduledDate)}`;

  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (data.rasPdfBuffer && data.rasId) {
    attachments.push({
      filename: `RAS_${data.rasId}_${data.clientName.replace(/\s+/g, "_")}.pdf`,
      content: data.rasPdfBuffer,
      contentType: "application/pdf",
    });
  }

  return sendGmailMessage({
    to: data.clientEmail,
    subject,
    html: buildPostSessionHTML(data),
    attachments,
  });
}

export async function isEmailConfigured(): Promise<boolean> {
  return isGmailConnected();
}
