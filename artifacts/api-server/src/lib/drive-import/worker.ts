import { createHash } from "node:crypto";
import { db, examDocumentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { driveListChildren, driveDownloadFile } from "../google-drive";
import { extractPdfText } from "../exam-extraction/pdf-text";
import { extractExamFromText, extractExamFromMedia } from "../exam-extraction/extract";
import {
  examTextVerdict,
  classifyMedia,
  extractImageFromText,
  extractImageFromMedia,
} from "../exam-extraction/extract-image";
import {
  persistExtractedResults,
  finalizeDocument,
  markDocumentError,
} from "../exam-extraction/persist";
import { persistExtractedImage, finalizeImageDocument } from "../exam-extraction/persist-image";
import {
  loadClients,
  clearClientCache,
  resolveClient,
  onlyDigits,
  parseCpfFromFolder,
  type ClientLite,
} from "./matcher";

// ============================================================================
// Worker de importacao em massa do Drive (spec + revisao CEO 10/07/2026). Roda
// DENTRO do processo persistente do api-server (bash em background NAO sobrevive
// entre chamadas). Estado em memoria; a saida duravel fica no banco
// (exam_documents + resultados/achados). O Excel e um retrato do run.
//
// Regras novas do CEO (10/07/2026):
//  - Homonimo = MESMA pessoa (matcher nunca retorna ambiguo).
//  - Varre TODAS as subpastas uteis (denylist abaixo), nao so EXAMES.
//  - Coleta PDF *e* IMAGEM; PDF escaneado e imagem sao lidos por VISAO.
//  - Porteiro anti-lixo: so vira exame o que for exame (senao doc "ignorado").
// ============================================================================

const DEFAULT_ROOT = "1kZJ4x2c-UyT4FBz5j8EvY8jYLJ0BUs1J";
const MAX_DEPTH = 3;

/** Subpastas que sabidamente NAO guardam exames (nao gastar leitura/IA nelas). */
const DENY_SUBFOLDERS = new Set([
  "CADASTRO",
  "CADASTROS ANTIGOS",
  "RECEITAS",
  "PROTOCOLOS",
  "FINANCEIRO",
  "CONTRATOS",
  "ATESTADOS",
  "TERMOS",
  "FOTO PERFIL",
  "PESQUISA",
  "OUVIDORIA",
]);

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i;

function normFolder(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
function isPdf(name: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || /\.pdf$/i.test(name);
}
function isImage(name: string, mimeType: string): boolean {
  return mimeType.startsWith("image/") || IMAGE_EXT.test(name);
}

export interface HomonimEntry {
  folderName: string;
  chosenClientId: number;
  chosenClientName: string;
  candidateNames: string[];
}
export interface NoMatchEntry {
  folderName: string;
  fileCount: number;
}
export interface ErrorEntry {
  folderName: string;
  fileName: string;
  message: string;
}
export interface ClientResultEntry {
  clientId: number;
  clientName: string;
  folderName: string;
  matchedHow: string;
  labDocs: number;
  imageDocs: number;
  duplicates: number;
  nonExam: number;
  errors: number;
}
// Feed AO VIVO: cada exame lancado entra aqui (mais recente no topo) para a tela
// de acompanhamento em tempo real. Limitado a RECENT_CAP itens.
export interface RecentEntry {
  clientId: number;
  clientName: string;
  fileName: string;
  kind: "lab" | "imagem";
  at: string;
}

export interface ImportState {
  status: "idle" | "scanning" | "running" | "done" | "error";
  mode: "scan" | "full" | null;
  scope: "active" | "all";
  startedAt: string | null;
  finishedAt: string | null;
  currentFolder: string | null;
  message: string;
  totals: {
    foldersScanned: number;
    foldersTotal: number;
    filesFound: number;
    ingested: number;
    duplicates: number;
    labDocs: number;
    imageDocs: number;
    nonExam: number;
    errors: number;
    noMatch: number;
    homonimUnited: number;
    skippedInactive: number;
  };
  homonims: HomonimEntry[];
  noMatches: NoMatchEntry[];
  errors: ErrorEntry[];
  clientResults: ClientResultEntry[];
  recent: RecentEntry[];
}

const RECENT_CAP = 80;

function emptyState(): ImportState {
  return {
    status: "idle",
    mode: null,
    scope: "active",
    startedAt: null,
    finishedAt: null,
    currentFolder: null,
    message: "Nenhuma importacao executada ainda.",
    totals: {
      foldersScanned: 0,
      foldersTotal: 0,
      filesFound: 0,
      ingested: 0,
      duplicates: 0,
      labDocs: 0,
      imageDocs: 0,
      nonExam: 0,
      errors: 0,
      noMatch: 0,
      homonimUnited: 0,
      skippedInactive: 0,
    },
    homonims: [],
    noMatches: [],
    errors: [],
    clientResults: [],
    recent: [],
  };
}

let state: ImportState = emptyState();

export function getImportState(): ImportState {
  return state;
}

export interface RunOptions {
  mode: "scan" | "full";
  scope?: "active" | "all";
  rootId?: string;
  /** Limita numero de pastas processadas (teste). 0 = sem limite. */
  maxFolders?: number;
  /** Limita numero de arquivos ingeridos no modo full (teste). 0 = sem limite. */
  maxFiles?: number;
}

interface FileRef {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  kind: "pdf" | "image";
}

/**
 * Coleta recursivamente PDFs e IMAGENS de exame numa pasta de cliente. Varre
 * TODAS as subpastas exceto a denylist (spec/revisao CEO). Arquivos soltos na
 * raiz do cliente entram como "(raiz)".
 */
async function collectExamFiles(
  folderId: string,
  pathLabel: string,
  depth: number,
): Promise<FileRef[]> {
  const children = await driveListChildren(folderId);
  const out: FileRef[] = [];
  for (const c of children) {
    if (!c.isFolder) {
      if (isPdf(c.name, c.mimeType)) {
        out.push({ id: c.id, name: c.name, path: pathLabel, mimeType: "application/pdf", kind: "pdf" });
      } else if (isImage(c.name, c.mimeType)) {
        const mime = c.mimeType.startsWith("image/") ? c.mimeType : "image/jpeg";
        out.push({ id: c.id, name: c.name, path: pathLabel, mimeType: mime, kind: "image" });
      }
      continue;
    }
    if (depth >= MAX_DEPTH) continue;
    if (DENY_SUBFOLDERS.has(normFolder(c.name))) continue;
    const childLabel = pathLabel === "(raiz)" ? c.name : `${pathLabel}/${c.name}`;
    out.push(...(await collectExamFiles(c.id, childLabel, depth + 1)));
  }
  return out;
}

/** Ja existe documento com este hash para este cliente? (idempotencia por paciente) */
async function documentExists(clientId: number, hash: string): Promise<boolean> {
  const rows = await db
    .select({ id: examDocumentsTable.id })
    .from(examDocumentsTable)
    .where(and(eq(examDocumentsTable.clientId, clientId), eq(examDocumentsTable.hash, hash)));
  return rows.length > 0;
}

/** Insere a linha do documento. status/examKind conforme o veredito. */
async function insertDoc(
  client: ClientLite,
  hash: string,
  fileName: string,
  sourcePath: string,
  driveId: string,
  status: string,
  examKind: string,
): Promise<number | null> {
  const [doc] = await db
    .insert(examDocumentsTable)
    .values({
      clientId: client.id,
      hash,
      fileName,
      status,
      examKind,
      origin: "drive-import",
      sourcePath: `${client.name} / ${sourcePath}`,
      sourcePdfDriveId: driveId,
    })
    .onConflictDoNothing()
    .returning({ id: examDocumentsTable.id });
  return doc?.id ?? null;
}

type Effect = "lab" | "imagem" | "dup" | "nao-exame" | "erro";

/** Ingere 1 arquivo (PDF ou imagem) ja baixado para um cliente resolvido. */
async function ingestFile(client: ClientLite, buffer: Buffer, file: FileRef): Promise<Effect> {
  const hash = createHash("sha256").update(buffer).digest("hex");
  if (await documentExists(client.id, hash)) return "dup";

  // --- Caminho por VISAO: imagens sempre; PDFs so aqui se forem escaneados. ---
  const runMedia = async (kind: "lab" | "imagem", mimeType: string): Promise<Effect> => {
    const docId = await insertDoc(client, hash, file.name, file.path, file.id, "recebido", kind);
    if (docId === null) return "dup";
    try {
      if (kind === "imagem") {
        const { data, modelUsed } = await extractImageFromMedia(buffer, mimeType);
        await finalizeImageDocument(docId, data, modelUsed);
        await persistExtractedImage(docId, client.id, data);
        return "imagem";
      }
      const { data, modelUsed } = await extractExamFromMedia(buffer, mimeType);
      await finalizeDocument(docId, data, modelUsed);
      await persistExtractedResults({ documentId: docId, clientId: client.id, extracted: data });
      return "lab";
    } catch (err) {
      await markDocumentError(docId, (err as Error).message);
      return "erro";
    }
  };

  if (file.kind === "image") {
    const kind = await classifyMedia(buffer, file.mimeType);
    if (kind === "none") {
      await insertDoc(client, hash, file.name, file.path, file.id, "ignorado", "nao-exame");
      return "nao-exame";
    }
    return runMedia(kind, file.mimeType);
  }

  // --- PDF: tenta texto; sem texto -> visao (PDF escaneado). ---
  const pdfText = await extractPdfText(buffer);
  if (!pdfText.enough) {
    const kind = await classifyMedia(buffer, "application/pdf");
    if (kind === "none") {
      await insertDoc(client, hash, file.name, file.path, file.id, "ignorado", "nao-exame");
      return "nao-exame";
    }
    return runMedia(kind, "application/pdf");
  }

  const verdict = examTextVerdict(pdfText.text);
  if (verdict === "none") {
    await insertDoc(client, hash, file.name, file.path, file.id, "ignorado", "nao-exame");
    return "nao-exame";
  }

  const docId = await insertDoc(client, hash, file.name, file.path, file.id, "recebido", verdict);
  if (docId === null) return "dup";
  try {
    if (verdict === "imagem") {
      const { data, modelUsed } = await extractImageFromText(pdfText.text);
      await finalizeImageDocument(docId, data, modelUsed);
      await persistExtractedImage(docId, client.id, data);
      return "imagem";
    }
    const { data, modelUsed } = await extractExamFromText(pdfText.text);
    await finalizeDocument(docId, data, modelUsed);
    await persistExtractedResults({ documentId: docId, clientId: client.id, extracted: data });
    return "lab";
  } catch (err) {
    await markDocumentError(docId, (err as Error).message);
    return "erro";
  }
}

/**
 * Le o CPF do PRIMEIRO arquivo da pasta (texto do PDF; se escaneado/imagem, visao).
 * Serve so para desempatar homonimos com CPFs diferentes. Best-effort: qualquer
 * falha devolve null (a pasta segue como "mesma pessoa" — regra padrao do CEO).
 */
async function sniffCpfFromFirstFile(files: FileRef[]): Promise<string | null> {
  const first = files[0];
  if (!first) return null;
  try {
    const buffer = await driveDownloadFile(first.id);
    if (first.kind === "pdf") {
      const pdfText = await extractPdfText(buffer);
      if (pdfText.enough) {
        const verdict = examTextVerdict(pdfText.text);
        if (verdict === "imagem") return (await extractImageFromText(pdfText.text)).data.patient.cpf ?? null;
        if (verdict === "lab") return (await extractExamFromText(pdfText.text)).data.patient.cpf ?? null;
        return null;
      }
      const kind = await classifyMedia(buffer, "application/pdf");
      if (kind === "imagem") return (await extractImageFromMedia(buffer, "application/pdf")).data.patient.cpf ?? null;
      if (kind === "lab") return (await extractExamFromMedia(buffer, "application/pdf")).data.patient.cpf ?? null;
      return null;
    }
    const kind = await classifyMedia(buffer, first.mimeType);
    if (kind === "imagem") return (await extractImageFromMedia(buffer, first.mimeType)).data.patient.cpf ?? null;
    if (kind === "lab") return (await extractExamFromMedia(buffer, first.mimeType)).data.patient.cpf ?? null;
    return null;
  } catch {
    return null;
  }
}

let running = false;

/** Dispara o run em background (nao aguarda). Retorna erro se ja houver run. */
export function startImport(opts: RunOptions): { ok: boolean; message: string } {
  if (running) return { ok: false, message: "Ja existe uma importacao em andamento." };
  running = true;
  state = emptyState();
  state.status = opts.mode === "scan" ? "scanning" : "running";
  state.mode = opts.mode;
  state.scope = opts.scope ?? "active";
  state.startedAt = new Date().toISOString();
  state.message = opts.mode === "scan" ? "Varrendo o Drive (sem IA)..." : "Importando exames...";
  void runImport(opts).finally(() => {
    running = false;
  });
  return { ok: true, message: "Importacao iniciada." };
}

async function runImport(opts: RunOptions): Promise<void> {
  const scope = opts.scope ?? "active";
  const rootId = opts.rootId ?? DEFAULT_ROOT;
  const maxFolders = opts.maxFolders ?? 0;
  const maxFiles = opts.maxFiles ?? 0;
  let processed = 0;
  try {
    clearClientCache();
    const clients = await loadClients(true);
    let folders = (await driveListChildren(rootId)).filter((c) => c.isFolder);
    if (maxFolders > 0) folders = folders.slice(0, maxFolders);
    state.totals.foldersTotal = folders.length;

    for (const folder of folders) {
      state.currentFolder = folder.name;
      state.totals.foldersScanned++;

      const files = await collectExamFiles(folder.id, "(raiz)", 0);
      state.totals.filesFound += files.length;
      if (files.length === 0) continue;

      // Desempate de homonimo (regra CEO): 1o o CPF do NOME da pasta (de graca);
      // se ainda homonimo no modo full, le o CPF do 1o arquivo (custa 1 leitura)
      // para rotear ao cadastro certo — mesma pessoa so quando o CPF nao diverge.
      let outcome = resolveClient(clients, folder.name, { cpf: parseCpfFromFolder(folder.name) });
      if (
        outcome.kind === "matched" &&
        outcome.how === "homonimo-unido" &&
        opts.mode === "full" &&
        (maxFiles === 0 || processed < maxFiles)
      ) {
        // O sniff le/analisa 1 arquivo (pode custar IA) — entra no teto de custo.
        processed++;
        const cpf = await sniffCpfFromFirstFile(files);
        if (cpf) outcome = resolveClient(clients, folder.name, { cpf });
      }
      if (outcome.kind === "none") {
        state.totals.noMatch++;
        state.noMatches.push({ folderName: folder.name, fileCount: files.length });
        continue;
      }

      const client = outcome.client;
      if (outcome.how === "homonimo-unido") {
        state.totals.homonimUnited++;
        state.homonims.push({
          folderName: folder.name,
          chosenClientId: client.id,
          chosenClientName: `${client.name} (CPF ${onlyDigits(client.cpf) || "sem"})`,
          candidateNames: (outcome.candidates ?? []).map(
            (c) => `${c.name} (CPF ${onlyDigits(c.cpf) || "sem"})`,
          ),
        });
      }

      if (scope === "active" && client.status !== "active") {
        state.totals.skippedInactive++;
        continue;
      }

      const cr: ClientResultEntry = {
        clientId: client.id,
        clientName: client.name,
        folderName: folder.name,
        matchedHow: outcome.how,
        labDocs: 0,
        imageDocs: 0,
        duplicates: 0,
        nonExam: 0,
        errors: 0,
      };

      // Modo scan: nao baixa nem chama IA. So conta e casa.
      if (opts.mode === "scan") {
        state.clientResults.push(cr);
        continue;
      }

      for (const file of files) {
        // Teto de custo por ARQUIVOS PROCESSADOS (nao so ingeridos): mesmo
        // nao-exame/duplicado/erro consomem leitura e, no caso da visao, IA.
        if (maxFiles > 0 && processed >= maxFiles) break;
        processed++;
        try {
          const buffer = await driveDownloadFile(file.id);
          const effect = await ingestFile(client, buffer, file);
          if (effect === "dup") {
            cr.duplicates++;
            state.totals.duplicates++;
          } else if (effect === "nao-exame") {
            cr.nonExam++;
            state.totals.nonExam++;
          } else if (effect === "erro") {
            cr.errors++;
            state.totals.errors++;
            state.errors.push({ folderName: folder.name, fileName: file.name, message: "extracao falhou" });
          } else {
            state.totals.ingested++;
            if (effect === "lab") {
              cr.labDocs++;
              state.totals.labDocs++;
            } else {
              cr.imageDocs++;
              state.totals.imageDocs++;
            }
            // Feed ao vivo: registra o exame recem-lancado (mais recente no topo).
            state.recent.unshift({
              clientId: client.id,
              clientName: client.name,
              fileName: file.name,
              kind: effect === "lab" ? "lab" : "imagem",
              at: new Date().toISOString(),
            });
            if (state.recent.length > RECENT_CAP) state.recent.length = RECENT_CAP;
          }
        } catch (err) {
          cr.errors++;
          state.totals.errors++;
          state.errors.push({
            folderName: folder.name,
            fileName: file.name,
            message: (err as Error).message,
          });
        }
      }
      state.clientResults.push(cr);
    }

    state.status = "done";
    state.finishedAt = new Date().toISOString();
    state.currentFolder = null;
    state.message =
      opts.mode === "scan"
        ? `Varredura concluida: ${state.totals.foldersScanned} pastas, ${state.totals.filesFound} arquivos, ${state.totals.homonimUnited} homonimos unidos, ${state.totals.noMatch} sem cliente.`
        : `Importacao concluida: ${state.totals.ingested} exames (${state.totals.labDocs} lab, ${state.totals.imageDocs} imagem), ${state.totals.duplicates} ja existentes, ${state.totals.nonExam} nao-exame, ${state.totals.errors} erros.`;
  } catch (err) {
    state.status = "error";
    state.finishedAt = new Date().toISOString();
    state.message = `Falha na importacao: ${(err as Error).message}`;
  }
}
