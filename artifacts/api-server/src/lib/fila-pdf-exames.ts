/**
 * PDFs/imagens de exame processados por IA FORA da requisição web: entram em mensagens_fila
 * (tipo pdf_exame) e só o api-worker consome, com concorrência 2 e prazo de 120 s por item.
 *
 * Idempotência: a chave é o identificador do arquivo no Drive; reenfileirar o mesmo arquivo não duplica.
 * O resultado da IA continua passando pela conferência de identidade (regra existente): este módulo
 * só muda ONDE e QUANDO o processamento roda, nunca o que é aceito no prontuário.
 */
import type { Pool } from "pg";
import {
  enfileirar,
  ErroDefinitivo,
  LIMITES,
  processarLote,
  type HandlerFila,
  type PoolFila,
  type ResumoLote,
} from "./fila-motor.js";

export interface PayloadPdfExame {
  clienteId: number;
  driveFileId: string;
  nome: string;
  caminho: string;
  mimeType: string;
  tipoArquivo: "pdf" | "image";
}

export function payloadPdfValido(p: unknown): p is PayloadPdfExame {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    Number.isSafeInteger(o.clienteId) && (o.clienteId as number) > 0 &&
    typeof o.driveFileId === "string" && o.driveFileId.length > 0 && o.driveFileId.length <= 200 &&
    typeof o.nome === "string" && typeof o.caminho === "string" && typeof o.mimeType === "string" &&
    (o.tipoArquivo === "pdf" || o.tipoArquivo === "image")
  );
}

export async function enfileirarPdfExame(
  pool: Pick<Pool, "query">,
  p: { empresaId: number } & PayloadPdfExame,
): Promise<{ id: number | null; duplicada: boolean }> {
  const { empresaId, ...payload } = p;
  if (!payloadPdfValido(payload)) throw new Error("payload_pdf_invalido");
  return enfileirar(pool, {
    tipo: "pdf_exame",
    empresaId,
    chave: `drive:${payload.driveFileId}`,
    payload: { ...payload },
  });
}

/** Handler real: baixa do Drive e ingere. "erro" já foi gravado no documento: reprocessar é decisão humana. */
export const handlerPdfExameReal: HandlerFila = async (item, sinal) => {
  if (!payloadPdfValido(item.payload)) throw new ErroDefinitivo("payload_pdf_invalido");
  if (sinal.aborted) throw new Error("abortado");
  const { ingerirArquivoDriveParaCliente } = await import("./drive-import/worker.js");
  const p = item.payload;
  const efeito = await ingerirArquivoDriveParaCliente(p.clienteId, {
    id: p.driveFileId,
    name: p.nome,
    path: p.caminho,
    mimeType: p.mimeType,
    kind: p.tipoArquivo,
  });
  if (efeito === "erro") throw new ErroDefinitivo("extracao_com_erro_gravado_no_documento");
};

export async function processarFilaPdfExames(
  pool: PoolFila,
  workerId: string,
  handler: HandlerFila = handlerPdfExameReal,
): Promise<ResumoLote> {
  return processarLote(pool, {
    tipo: "pdf_exame",
    handler,
    workerId,
    concorrencia: LIMITES.concorrenciaPdf,
    timeoutMs: LIMITES.timeoutPdfMs,
    leaseMs: LIMITES.leasePdfMs,
  });
}
