import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { BOLOES_COMPROVANTE_MAX_BYTES } from "./boloes.js";
import {
  ingerirArquivo, lerConfig, processarRecebimento, type ArmazenamentoPrivado, type LeitorRecibo,
} from "./boloes-gestao.js";

/**
 * Robo de recebimento de Boloes. Vigia SOMENTE a pasta do Drive que a propria clinica configurou
 * (canal que a clinica controla). Nao acessa CAIXA, nao faz login, nao compra, nao resolve CAPTCHA.
 * Cada arquivo novo entra na quarentena, e lido e so vira comprovante apos aprovacao
 * (humana, ou regra automatica que a clinica precisa ligar e que vem DESLIGADA).
 */

export interface ArquivoDaPasta { id: string; name: string; mimeType: string; isFolder: boolean; size: number | null }
export interface DepsRobo {
  storage: ArmazenamentoPrivado;
  leitor: LeitorRecibo;
  listar: (folderId: string) => Promise<ArquivoDaPasta[]>;
  baixar: (fileId: string) => Promise<Buffer>;
  alertar?: (texto: string) => Promise<void>;
  maxPorEmpresa?: number;
}

export interface ResumoVarredura {
  empresasComPasta: number;
  novos: number;
  emRevisao: number;
  aprovadosAutomaticos: number;
  duplicados: number;
  rejeitados: number;
  erros: number;
}

const MIMES_ACEITOS = new Set(["application/pdf", "image/png", "image/jpeg"]);

async function empresasComPasta(): Promise<Array<{ empresaId: number; folderId: string }>> {
  const r = (await db.execute(sql`SELECT key FROM app_settings WHERE key LIKE 'boloes.config.%'`)) as unknown as { rows: Array<{ key: string }> };
  const out: Array<{ empresaId: number; folderId: string }> = [];
  for (const { key } of r.rows) {
    const empresaId = Number(key.slice("boloes.config.".length));
    if (!Number.isSafeInteger(empresaId) || empresaId <= 0) continue;
    const cfg = await lerConfig(empresaId);
    if (cfg.driveFolderId) out.push({ empresaId, folderId: cfg.driveFolderId });
  }
  return out;
}

/** Sem pasta configurada em nenhuma clinica = nao faz nada (e diz isso no resumo). */
export async function varrerPastasBoloes(deps: DepsRobo): Promise<ResumoVarredura> {
  const resumo: ResumoVarredura = { empresasComPasta: 0, novos: 0, emRevisao: 0, aprovadosAutomaticos: 0, duplicados: 0, rejeitados: 0, erros: 0 };
  const alvos = await empresasComPasta();
  resumo.empresasComPasta = alvos.length;
  const limite = deps.maxPorEmpresa ?? 20;

  for (const alvo of alvos) {
    try {
      const arquivos = (await deps.listar(alvo.folderId)).filter((f) => !f.isFolder);
      if (arquivos.length === 0) continue;
      const ja = new Set(
        ((await db.execute(sql`SELECT drive_file_id FROM boloes_recebimentos WHERE empresa_id = ${alvo.empresaId} AND drive_file_id IS NOT NULL`)) as unknown as { rows: Array<{ drive_file_id: string }> })
          .rows.map((x) => x.drive_file_id),
      );
      const novos = arquivos.filter((f) => !ja.has(f.id)).slice(0, limite);
      let revisaoNestaEmpresa = 0;
      for (const f of novos) {
        try {
          if ((f.size !== null && f.size > BOLOES_COMPROVANTE_MAX_BYTES) || (f.mimeType && !MIMES_ACEITOS.has(f.mimeType))) {
            await db.execute(sql`
              INSERT INTO boloes_recebimentos (empresa_id, origem, drive_file_id, nome_original, status, motivo_rejeicao, decidido_por, decidido_em)
              VALUES (${alvo.empresaId}, 'drive', ${f.id}, ${f.name.slice(0, 200)}, 'rejeitado', 'Tipo ou tamanho de arquivo não aceito (PDF, PNG ou JPEG até 10 MB).', 'robo', NOW())
              ON CONFLICT DO NOTHING`);
            resumo.rejeitados++;
            continue;
          }
          const buffer = await deps.baixar(f.id);
          const r = await ingerirArquivo(deps.storage, {
            empresaId: alvo.empresaId, origem: "drive", buffer, nomeOriginal: f.name, driveFileId: f.id,
            ator: { texto: "robo", profissionalId: null },
          });
          if (!r.ok) { resumo.rejeitados++; continue; }
          if (r.status === "duplicado") { resumo.duplicados++; continue; }
          if (r.status === "rejeitado") { resumo.rejeitados++; continue; }
          resumo.novos++;
          const p = r.id ? await processarRecebimento(deps.storage, r.id, deps.leitor) : { estado: "ignorado" as const };
          if (p.estado === "aprovado_automatico") resumo.aprovadosAutomaticos++;
          else if (p.estado === "em_revisao") { resumo.emRevisao++; revisaoNestaEmpresa++; }
        } catch (err) {
          // Erro em um arquivo nao derruba a varredura; ele sera tentado de novo apenas se nao chegou a ser registrado.
          resumo.erros++;
          logger.error({ err: err instanceof Error ? err.message : String(err), empresaId: alvo.empresaId }, "boloes-robo: falha em arquivo");
        }
      }
      if (revisaoNestaEmpresa > 0 && deps.alertar) {
        await deps.alertar(`Bolões: ${revisaoNestaEmpresa} recibo(s) novo(s) aguardam conferência humana na Central de Bolões (clínica ${alvo.empresaId}).`)
          .catch((err) => logger.error({ err: String(err) }, "boloes-robo: alerta Slack falhou"));
      }
    } catch (err) {
      resumo.erros++;
      logger.error({ err: err instanceof Error ? err.message : String(err), empresaId: alvo.empresaId }, "boloes-robo: falha ao varrer pasta");
    }
  }
  return resumo;
}

/** Montagem real (Drive + armazenamento privado + leitura por IA). Importada dinamicamente pelo api-worker. */
export async function varrerPastasBoloesAgora(): Promise<ResumoVarredura> {
  const [{ driveListChildren, driveDownloadFile }, { ObjectStorageService }, { lerComprovanteIA }, { postSlackAlertChecked }] = await Promise.all([
    import("./google-drive.js"), import("./objectStorage.js"), import("./boloes-leitura.js"), import("./slack-reporter.js"),
  ]);
  const canal = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";
  return varrerPastasBoloes({
    storage: new ObjectStorageService(),
    leitor: lerComprovanteIA,
    listar: driveListChildren,
    baixar: driveDownloadFile,
    alertar: (t) => postSlackAlertChecked(canal, t),
  });
}
