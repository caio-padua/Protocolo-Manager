import { createHmac, randomBytes } from "node:crypto";

// Token HMAC assinado para o portal publico (cliente se identifica por CPF +
// data de nascimento e recebe este token de curta duracao). Usado tanto no
// portal de upload de arquivos quanto no portal de anamnese.
const TOKEN_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const TOKEN_TTL_MS = 30 * 60 * 1000;

export function createPortalToken(clientId: number, opts?: { preview?: boolean }): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = opts?.preview ? `${clientId}:${exp}:preview` : `${clientId}:${exp}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function parseToken(token: string): { clientId: number; preview: boolean } | null {
  try {
    const parts = Buffer.from(token, "base64url").toString().split(":");
    if (parts.length !== 3 && parts.length !== 4) return null;
    const preview = parts.length === 4;
    if (preview && parts[2] !== "preview") return null;
    const sig = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(":");
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (sig !== expected) return null;
    if (Date.now() > Number(parts[1])) return null;
    const clientId = Number(parts[0]);
    return Number.isSafeInteger(clientId) ? { clientId, preview } : null;
  } catch {
    return null;
  }
}

/** Aceita token de paciente e token de previa do administrador (telas somente de visualizacao). */
export function verifyPortalToken(token: string): number | null {
  return parseToken(token)?.clientId ?? null;
}

/** Somente o paciente autenticado: previa do administrador NUNCA passa (cofre, consentimento, contratacao). */
export function verifyPatientToken(token: string): number | null {
  const t = parseToken(token);
  return t && !t.preview ? t.clientId : null;
}


// Token de FOTO de perfil — assinado por HMAC, com validade de 7 dias. O médico
// gera o link e manda ao cliente (e-mail/WhatsApp); o cliente pode demorar a
// subir a foto, por isso a janela é maior que a do portal (30 min). O escopo
// "foto" impede reaproveitar este token nas demais rotas do portal.
const PHOTO_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createPhotoToken(clientId: number): string {
  const exp = Date.now() + PHOTO_TOKEN_TTL_MS;
  const payload = `foto:${clientId}:${exp}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyPhotoToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 4) return null;
    const [scope, clientIdStr, expStr, sig] = parts;
    if (scope !== "foto") return null;
    const payload = `${scope}:${clientIdStr}:${expStr}`;
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (sig !== expected) return null;
    if (Date.now() > Number(expStr)) return null;
    return Number(clientIdStr);
  } catch {
    return null;
  }
}

// Token de CADASTRO completo — assinado por HMAC, validade de 7 dias. O médico
// gera o link e manda ao cliente; o cliente preenche o cadastro completo (dados
// + foto) pelo próprio celular. Escopo "cadastro" impede reaproveitar este token
// nas rotas de foto/portal e vice-versa.
const REGISTRATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createRegistrationToken(clientId: number): string {
  const exp = Date.now() + REGISTRATION_TOKEN_TTL_MS;
  const payload = `cadastro:${clientId}:${exp}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyRegistrationToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 4) return null;
    const [scope, clientIdStr, expStr, sig] = parts;
    if (scope !== "cadastro") return null;
    const payload = `${scope}:${clientIdStr}:${expStr}`;
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (sig !== expected) return null;
    if (Date.now() > Number(expStr)) return null;
    return Number(clientIdStr);
  } catch {
    return null;
  }
}

// Token de AGENDAMENTO Concierge ("crachá") — assinado por HMAC, validade de
// 24h. O fluxo público /agendar é anônimo (sem login): ao criar a solicitação,
// o servidor emite este crachá amarrado ao id da solicitação e o devolve no
// corpo da resposta. As rotas públicas de cobrança, status de pagamento e
// confirmação passam a EXIGIR o crachá, impedindo que alguém manipule a
// solicitação de outra pessoa apenas adivinhando o número (IDOR/enumeração).
// O escopo "agendar" impede reaproveitar este token nas demais rotas.
const SCHEDULING_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function createSchedulingToken(requestId: number): string {
  const exp = Date.now() + SCHEDULING_TOKEN_TTL_MS;
  const payload = `agendar:${requestId}:${exp}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifySchedulingToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 4) return null;
    const [scope, idStr, expStr, sig] = parts;
    if (scope !== "agendar") return null;
    const payload = `${scope}:${idStr}:${expStr}`;
    const expected = createHmac("sha256", TOKEN_SECRET)
      .update(payload)
      .digest("hex");
    if (sig !== expected) return null;
    if (Date.now() > Number(expStr)) return null;
    return Number(idStr);
  } catch {
    return null;
  }
}

// Token de STATUS do agendamento — assinado por HMAC, validade de 30 dias.
// Vai no e-mail de chegada (Bloco C, R9): o paciente abre a página de status do
// pagamento sem login. NÃO pode ser o passwordSetToken (esse é limpo na troca de
// senha e mataria o link); por isso é stateless e independente do acesso. O escopo
// "bstatus" impede reaproveitar este token nas demais rotas. Só revela pago/aguardando.
const BOOKING_STATUS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createBookingStatusToken(requestId: number): string {
  const exp = Date.now() + BOOKING_STATUS_TOKEN_TTL_MS;
  const payload = `bstatus:${requestId}:${exp}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyBookingStatusToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 4) return null;
    const [scope, idStr, expStr, sig] = parts;
    if (scope !== "bstatus") return null;
    const payload = `${scope}:${idStr}:${expStr}`;
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (sig !== expected) return null;
    if (Date.now() > Number(expStr)) return null;
    return Number(idStr);
  } catch {
    return null;
  }
}

// SUB-04 item 7: token de FEED iCal — assinado por HMAC, SEM expiração.
// Uma assinatura de calendário (Google/Apple) é permanente: o app do cliente
// busca a URL periodicamente. O escopo "ical" no payload impede reaproveitar
// este token nas rotas do portal (e vice-versa).
export function createFeedToken(clientId: number): string {
  const payload = `ical:${clientId}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyFeedToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [scope, clientIdStr, sig] = parts;
    if (scope !== "ical") return null;
    const payload = `${scope}:${clientIdStr}`;
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (sig !== expected) return null;
    return Number(clientIdStr);
  } catch {
    return null;
  }
}

// Confirmação de EXCLUIR CONTA: emitida só depois de reautenticar (senha ou nascimento), vale 10 minutos
// e só serve para esta ação (escopo "exclusao"); não abre nenhuma outra rota.
const EXCLUSAO_TTL_MS = 10 * 60 * 1000;
export function createExclusaoToken(clientId: number): string {
  const payload = `exclusao:${clientId}:${Date.now() + EXCLUSAO_TTL_MS}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}
export function verifyExclusaoToken(token: string): number | null {
  try {
    const parts = Buffer.from(token, "base64url").toString().split(":");
    if (parts.length !== 4 || parts[0] !== "exclusao") return null;
    const expected = createHmac("sha256", TOKEN_SECRET).update(parts.slice(0, 3).join(":")).digest("hex");
    if (parts[3] !== expected || Date.now() > Number(parts[2])) return null;
    return Number(parts[1]);
  } catch { return null; }
}
