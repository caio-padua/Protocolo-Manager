/**
 * Anexos (PDF/foto) enviados por um cliente VINCULADO no Telegram.
 * Nada aqui fala com o Telegram por conta própria: o download e o envio são injetados,
 * o que permite testar sem rede e sem contato com pessoas reais.
 *
 * Regras:
 *  - só chat já vinculado a um único cliente chega aqui (a vinculação é feita antes, por prova de posse);
 *  - PDF vira exame no MESMO motor da Área do Cliente (hash por paciente evita duplicar);
 *  - imagem/outro tipo é registrado na Caixa de Entrada como anexo recebido, SEM leitura automática
 *    (o motor lê somente PDF) e a resposta ao cliente diz isso;
 *  - o conteúdo é validado pela assinatura real do arquivo, nunca pelo tipo declarado.
 */
import { getSecret } from "./secure-settings";

export const LIMITE_BYTES_ANEXO = 20 * 1024 * 1024; // limite do getFile do Telegram

export interface AnexoTelegram {
  fileId: string;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  origem: "documento" | "foto";
  legenda: string;
}

type MensagemTelegram = {
  document?: { file_id?: unknown; file_name?: unknown; mime_type?: unknown; file_size?: unknown };
  photo?: Array<{ file_id?: unknown; file_size?: unknown }>;
  caption?: unknown;
};

export function extrairAnexo(msg: MensagemTelegram | null | undefined): AnexoTelegram | null {
  if (!msg) return null;
  const legenda = typeof msg.caption === "string" ? msg.caption.trim().slice(0, 500) : "";
  const doc = msg.document;
  if (doc && typeof doc.file_id === "string" && doc.file_id) {
    return {
      fileId: doc.file_id,
      fileName: typeof doc.file_name === "string" && doc.file_name.trim() ? doc.file_name.trim().slice(0, 200) : "documento",
      mimeType: typeof doc.mime_type === "string" ? doc.mime_type : null,
      size: typeof doc.file_size === "number" ? doc.file_size : null,
      origem: "documento",
      legenda,
    };
  }
  const fotos = Array.isArray(msg.photo) ? msg.photo.filter((f) => typeof f?.file_id === "string") : [];
  if (fotos.length > 0) {
    const maior = fotos[fotos.length - 1];
    return {
      fileId: maior.file_id as string,
      fileName: "foto-telegram.jpg",
      mimeType: "image/jpeg",
      size: typeof maior.file_size === "number" ? maior.file_size : null,
      origem: "foto",
      legenda,
    };
  }
  return null;
}

export function tipoPorAssinatura(buf: Buffer): "pdf" | "jpeg" | "png" | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}

export interface DependenciasAnexo {
  /** Baixa o arquivo; null = Telegram respondeu que não existe/venceu; lança em falha transitória (rede). */
  baixar: (fileId: string) => Promise<Buffer | null>;
  iniciarIngestao: (p: { clientId: number; buffer: Buffer; fileName: string; empresaId: number }) => Promise<{ documentId: number; duplicate: boolean }>;
}

export type ResultadoAnexo =
  | { resultado: "exame_iniciado"; documentId: number; resumo: string; resposta: string }
  | { resultado: "exame_duplicado"; documentId: number; resumo: string; resposta: string }
  | { resultado: "anexo_registrado"; resumo: string; resposta: string }
  | { resultado: "recusado"; motivo: "tamanho" | "tipo" | "indisponivel" | "falha_leitura"; resumo: string; resposta: string };

export async function tratarAnexo(
  cliente: { id: number; empresaId: number },
  anexo: AnexoTelegram,
  deps: DependenciasAnexo,
): Promise<ResultadoAnexo> {
  if (anexo.size !== null && anexo.size > LIMITE_BYTES_ANEXO) {
    return { resultado: "recusado", motivo: "tamanho", resumo: `[Anexo recusado por tamanho: ${anexo.fileName}]`, resposta: "Este arquivo é grande demais para o Telegram. Envie pela Área do Cliente." };
  }
  const buffer = await deps.baixar(anexo.fileId); // erro transitório propaga: o webhook responde 500 e o Telegram reentrega
  if (!buffer) {
    return { resultado: "recusado", motivo: "indisponivel", resumo: `[Anexo indisponível: ${anexo.fileName}]`, resposta: "Não consegui abrir o arquivo. Pode enviá-lo novamente?" };
  }
  if (buffer.length > LIMITE_BYTES_ANEXO || buffer.length === 0) {
    return { resultado: "recusado", motivo: "tamanho", resumo: `[Anexo recusado por tamanho: ${anexo.fileName}]`, resposta: "Este arquivo é grande demais ou está vazio. Envie pela Área do Cliente." };
  }
  const tipo = tipoPorAssinatura(buffer);
  if (!tipo) {
    return { resultado: "recusado", motivo: "tipo", resumo: `[Anexo recusado por tipo: ${anexo.fileName}]`, resposta: "Só consigo receber PDF, JPEG ou PNG." };
  }
  if (tipo === "pdf") {
    try {
      const r = await deps.iniciarIngestao({ clientId: cliente.id, buffer, fileName: anexo.fileName.toLowerCase().endsWith(".pdf") ? anexo.fileName : `${anexo.fileName}.pdf`, empresaId: cliente.empresaId });
      if (r.duplicate) {
        return { resultado: "exame_duplicado", documentId: r.documentId, resumo: `[PDF já recebido antes: ${anexo.fileName}]`, resposta: "Este arquivo já foi recebido antes. A equipe está acompanhando." };
      }
      return { resultado: "exame_iniciado", documentId: r.documentId, resumo: `[PDF recebido, leitura iniciada: ${anexo.fileName}]`, resposta: "Arquivo recebido. A leitura foi iniciada e a equipe confere antes de entrar no seu histórico." };
    } catch {
      return { resultado: "recusado", motivo: "falha_leitura", resumo: `[PDF guardado sem leitura: ${anexo.fileName}]`, resposta: "Recebi o arquivo, mas não consegui iniciar a leitura. A equipe foi avisada na Caixa de Entrada." };
    }
  }
  return { resultado: "anexo_registrado", resumo: `[Imagem recebida, sem leitura automática: ${anexo.fileName}]`, resposta: "Imagem recebida. Ela fica na Caixa de Entrada para a equipe; a leitura automática funciona só com PDF." };
}

/** Download real pelo Telegram. O token nunca é registrado; falhas não carregam a URL. */
export async function baixarArquivoTelegram(fileId: string): Promise<Buffer | null> {
  const token = (await getSecret("telegram.botToken"))?.trim();
  if (!token) throw new Error("telegram: token indisponível");
  const meta = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`).catch(() => {
    throw new Error("telegram: getFile sem resposta");
  });
  if (meta.status >= 500) throw new Error("telegram: getFile indisponível");
  if (!meta.ok) return null;
  const j = (await meta.json().catch(() => null)) as { ok?: boolean; result?: { file_path?: string; file_size?: number } } | null;
  const caminho = j?.result?.file_path;
  if (!j?.ok || !caminho) return null;
  if (typeof j.result?.file_size === "number" && j.result.file_size > LIMITE_BYTES_ANEXO) return Buffer.alloc(LIMITE_BYTES_ANEXO + 1);
  const arq = await fetch(`https://api.telegram.org/file/bot${token}/${caminho}`).catch(() => {
    throw new Error("telegram: download sem resposta");
  });
  if (arq.status >= 500) throw new Error("telegram: download indisponível");
  if (!arq.ok) return null;
  return Buffer.from(await arq.arrayBuffer());
}
