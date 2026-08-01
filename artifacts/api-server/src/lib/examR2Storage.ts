/**
 * examR2Storage — espelho de exames no Cloudflare R2 (Item 40 — provider real).
 *
 * ESPELHO, NÃO TROCA. O Google Drive continua funcionando como antes.
 * Esta lib grava uma cópia no bucket R2 "institutopadua-exames-padaxor"
 * via Cloudflare REST API v4 usando o CF_API_TOKEN do ambiente.
 *
 * CONVENÇÃO DE CHAVE (imutável após definida):
 *   exames/cliente-<clientId>/<aaaa-mm-dd>/exame-<documentId>.pdf
 *
 * IDEMPOTÊNCIA (Art. 57 da Bíblia):
 *   Mesmo (clientId, documentId, date) → mesmo caminho → PUT sobrescreve
 *   com os mesmos bytes. Gravar duas vezes não duplica nem corrompe.
 *
 * DRY-RUN (Art. 58 da Bíblia):
 *   dryRun=true retorna o que SERIA gravado sem escrever nenhum byte.
 */

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? "c68f93d5feb576ea2862974ec3564c48";
const CF_R2_BUCKET  = process.env.CF_R2_BUCKET  ?? "institutopadua-exames-padaxor";
const CF_API_TOKEN  = process.env.CF_API_TOKEN;

function r2BaseUrl(objectKey: string): string {
  const encoded = objectKey.split("/").map(encodeURIComponent).join("/");
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${CF_R2_BUCKET}/objects/${encoded}`;
}

// ─── Chave padronizada ────────────────────────────────────────────────────────

/**
 * Gera a chave canônica do exame no cofre.
 * collectionDate deve estar em formato ISO "YYYY-MM-DD"; se ausente usa hoje.
 */
export function examR2Key(opts: {
  clientId: number;
  documentId: number;
  collectionDate: string | null | undefined;
}): string {
  const date = opts.collectionDate ?? new Date().toISOString().slice(0, 10);
  return `exames/cliente-${opts.clientId}/${date}/exame-${opts.documentId}.pdf`;
}

// ─── Verificação de existência ────────────────────────────────────────────────

async function existsInR2(key: string): Promise<boolean> {
  if (!CF_API_TOKEN) return false;
  try {
    const res = await fetch(r2BaseUrl(key), {
      method: "HEAD",
      headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// ─── Resultado ────────────────────────────────────────────────────────────────

export interface ExamR2Result {
  /** Chave gerada para este exame no cofre de objetos */
  r2Key: string;
  /** O arquivo já existia antes desta chamada? */
  alreadyExists: boolean;
  /** Foi efetivamente gravado agora? (false em dry-run ou se já existia e pulou) */
  uploaded: boolean;
  /** Tamanho do buffer em bytes */
  bytes: number;
  /** true = simulação; nenhum byte foi gravado */
  dryRun: boolean;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Grava (ou simula a gravação de) um PDF de exame no Cloudflare R2.
 *
 * Uso em produção (dentro do pipeline de processamento):
 *   await mirrorExamToR2({ clientId, documentId, collectionDate, buffer });
 *
 * Uso em dry-run (rota GET /exames-lab/r2-dry-run):
 *   await mirrorExamToR2({ clientId, documentId, collectionDate, buffer, dryRun: true });
 */
export async function mirrorExamToR2(opts: {
  clientId: number;
  documentId: number;
  collectionDate: string | null | undefined;
  buffer: Buffer;
  dryRun?: boolean;
}): Promise<ExamR2Result> {
  if (!CF_API_TOKEN) {
    console.warn("[examR2Storage] CF_API_TOKEN ausente — espelho desabilitado.");
    return {
      r2Key: examR2Key(opts),
      alreadyExists: false,
      uploaded: false,
      bytes: opts.buffer.length,
      dryRun: opts.dryRun ?? false,
    };
  }

  const key = examR2Key({
    clientId: opts.clientId,
    documentId: opts.documentId,
    collectionDate: opts.collectionDate,
  });

  const alreadyExists = await existsInR2(key);

  if (opts.dryRun) {
    return { r2Key: key, alreadyExists, uploaded: false, bytes: opts.buffer.length, dryRun: true };
  }

  // PUT — idempotente: mesmo caminho sobrescreve com os mesmos bytes
  const res = await fetch(r2BaseUrl(key), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/pdf",
    },
    body: opts.buffer,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`[examR2Storage] R2 PUT falhou (${res.status}): ${text}`);
  }

  return { r2Key: key, alreadyExists, uploaded: true, bytes: opts.buffer.length, dryRun: false };
}
