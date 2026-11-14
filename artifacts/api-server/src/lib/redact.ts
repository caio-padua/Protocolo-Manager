// Redacao central de credenciais (Etapa 0). Fonte unica usada por logger,
// tratador de erro, diagnosticos e cofre. Nunca confie so no NOME do campo:
// tambem varre o VALOR (formatos conhecidos de token) em qualquer texto.

// Nomes sensiveis, sem diferenciar maiusculas/minusculas nem separadores
// (botToken, BOT_TOKEN, bot-token, access_token, Authorization...).
const NOME_SENSIVEL =
  /(token|secret|senha|password|passwd|authorization|api[-_.]?key|apikey|access[-_.]?key|private[-_.]?key|credential|credencial|cookie|bearer|auth[-_.]?tag|ciphertext|signature)/i;

// Valores com formato de credencial conhecido.
const PADROES_VALOR: RegExp[] = [
  /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, // token de bot do Telegram
  /\bbot\d{6,12}:[A-Za-z0-9_-]{30,}/gi, // URL /bot<token>/
  /\$aact_[A-Za-z0-9_.\-$]{20,}/g, // chave Asaas
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bAC[0-9a-f]{32}\b/g, // SID Twilio
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g, // GitHub
];

export const MASCARA = "[REDIGIDO]";

export function nomeEhSensivel(nome: string): boolean {
  return NOME_SENSIVEL.test(nome);
}

export function redigirTexto(texto: string): string {
  let t = texto;
  for (const p of PADROES_VALOR) t = t.replace(p, MASCARA);
  // access_token=..., token: "...", ?key=...
  t = t.replace(
    /((?:token|secret|senha|password|api[-_.]?key|access[-_.]?token)["']?\s*[:=]\s*["']?)[^\s"'&,}]{6,}/gi,
    `$1${MASCARA}`,
  );
  return t;
}

export function redigir<T>(valor: T, profundidade = 0): T {
  if (profundidade > 8 || valor == null) return valor;
  if (typeof valor === "string") return redigirTexto(valor) as unknown as T;
  if (valor instanceof Error) {
    const e = new Error(redigirTexto(valor.message));
    e.name = valor.name;
    e.stack = valor.stack ? redigirTexto(valor.stack) : undefined;
    return e as unknown as T;
  }
  if (Array.isArray(valor)) return valor.map((v) => redigir(v, profundidade + 1)) as unknown as T;
  if (typeof valor === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = nomeEhSensivel(k) && v != null && typeof v !== "boolean" ? MASCARA : redigir(v, profundidade + 1);
    }
    return out as T;
  }
  return valor;
}

// Varredura SOMENTE por valor (formatos conhecidos). Usada na rede de
// seguranca das respostas HTTP, onde mascarar por nome quebraria contratos.
export function redigirPorValor<T>(valor: T, profundidade = 0): T {
  if (profundidade > 10 || valor == null) return valor;
  if (typeof valor === "string") {
    let t = valor as string;
    for (const p of PADROES_VALOR) t = t.replace(p, MASCARA);
    return t as unknown as T;
  }
  if (Array.isArray(valor)) return valor.map((v) => redigirPorValor(v, profundidade + 1)) as unknown as T;
  if (typeof valor === "object" && !(valor instanceof Date) && !Buffer.isBuffer(valor)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) out[k] = redigirPorValor(v, profundidade + 1);
    return out as T;
  }
  return valor;
}
