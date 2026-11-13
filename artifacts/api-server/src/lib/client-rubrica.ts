import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import type { RubricaPronta } from "./client-rubrica-imagem";

/**
 * Rubrica do cliente como imagem — persistência.
 *
 * SQL bruto de propósito (o push automático do drizzle já propôs apagar colunas com dados reais por drift):
 * aqui só se CRIA. Uma linha por envio; a anterior NUNCA é apagada (Regra de Ouro), só deixa de ser a ativa.
 * O arquivo vai para o armazenamento PRIVADO (fora de `uploads/`, que a rota pública serve) e só sai por
 * rota autenticada da mesma empresa ou pelo gerador do RAS FAP.
 */

let _ready: Promise<void> | null = null;

export async function ensureClientRubricas(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS client_rubricas (
          id SERIAL PRIMARY KEY,
          client_id INTEGER NOT NULL,
          empresa_id INTEGER NOT NULL,
          object_path TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          origem_mime TEXT NOT NULL,
          uploaded_by_professional_id INTEGER,
          ativa BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      // No máximo UMA rubrica ativa por cliente (a troca desativa a anterior sem apagá-la).
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS client_rubricas_ativa_uk
        ON client_rubricas (client_id) WHERE ativa
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS client_rubricas_cliente_idx
        ON client_rubricas (client_id, created_at)
      `);
    })().catch((error) => {
      _ready = null;
      throw error;
    });
  }
  return _ready;
}

interface RubricaRow { id: number; object_path: string; sha256: string; created_at: string }

async function rowsOf<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

export const TRAVA_RUBRICA = 7101; // compartilhada com a captura histórica da confirmação

export interface RubricaSalva {
  /** false = o mesmo arquivo já era a rubrica ativa; nada foi criado. */
  alterada: boolean;
  atualizadaEm: Date;
}

export async function salvarRubricaCliente(entrada: {
  clientId: number;
  empresaId: number;
  professionalId: number | null;
  pronta: RubricaPronta;
}): Promise<RubricaSalva> {
  await ensureClientRubricas();
  const { clientId, empresaId, professionalId, pronta } = entrada;

  const consultaAtiva = sql`
    SELECT id, object_path, sha256, created_at FROM client_rubricas
     WHERE client_id = ${clientId} AND empresa_id = ${empresaId} AND ativa`;
  const [atual] = await rowsOf<RubricaRow>(consultaAtiva);
  if (atual?.sha256 === pronta.sha256) return { alterada: false, atualizadaEm: new Date(atual.created_at) };

  // Primeiro o arquivo, depois a linha: se o banco falhar sobra um arquivo privado inofensivo, nunca uma linha sem imagem.
  const objectPath = `client-rubricas/${empresaId}/${clientId}/${randomUUID()}.png`;
  await new ObjectStorageService().savePrivateObject(objectPath, pronta.png, "image/png");

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${TRAVA_RUBRICA}, ${clientId})`);
    const ativas = (await tx.execute(consultaAtiva) as unknown as { rows: RubricaRow[] }).rows;
    if (ativas[0]?.sha256 === pronta.sha256) return { alterada: false, atualizadaEm: new Date(ativas[0].created_at) };
    await tx.execute(sql`
      UPDATE client_rubricas SET ativa = FALSE
       WHERE client_id = ${clientId} AND empresa_id = ${empresaId} AND ativa`);
    const criadas = (await tx.execute(sql`
      INSERT INTO client_rubricas
        (client_id, empresa_id, object_path, sha256, width, height, origem_mime, uploaded_by_professional_id)
      VALUES
        (${clientId}, ${empresaId}, ${objectPath}, ${pronta.sha256}, ${pronta.largura}, ${pronta.altura},
         ${pronta.origemMime}, ${professionalId})
      RETURNING created_at`) as unknown as { rows: Array<{ created_at: string }> }).rows;
    return { alterada: true, atualizadaEm: new Date(criadas[0]!.created_at) };
  });
}

/**
 * PNG da rubrica ATIVA do cliente (da empresa informada) ou null se ele não tem. Se a linha existe mas o
 * arquivo não pode ser lido, LANÇA: quem emite documento não pode trocar a rubrica por iniciais em silêncio.
 */
export async function lerRubricaAtiva(clientId: number, empresaId: number): Promise<Buffer | null> {
  await ensureClientRubricas();
  const [linha] = await rowsOf<RubricaRow>(sql`
    SELECT id, object_path, sha256, created_at FROM client_rubricas
     WHERE client_id = ${clientId} AND empresa_id = ${empresaId} AND ativa`);
  if (!linha) return null;
  let png: Buffer;
  try {
    png = await new ObjectStorageService().readPrivateObject(linha.object_path);
    if (!png || png.length === 0) throw new Error("arquivo vazio");
  } catch (error) {
    throw new Error(`Rubrica do cliente ${clientId} registrada, mas a imagem não pôde ser lida`, { cause: error });
  }
  // Integridade: o arquivo guardado tem de ser exatamente o que foi registrado. Um PNG válido, porém trocado,
  // seria impresso no RAS como se fosse a rubrica do cliente.
  if (createHash("sha256").update(png).digest("hex") !== linha.sha256) {
    throw new Error(`Rubrica do cliente ${clientId}: o arquivo guardado não confere com o registro`);
  }
  return png;
}

/** A versão histórica não precisa continuar ativa; ausência/divergência é erro, nunca substituição. */
export async function lerRubricaHistorica(clientId:number,empresaId:number,versionId:number,sha256:string):Promise<Buffer> {
  if(!Number.isSafeInteger(versionId)||versionId<=0||!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Rubrica histórica: versão ou hash inválido");
  }
  await ensureClientRubricas();
  const [linha]=await rowsOf<RubricaRow>(sql`SELECT id,object_path,sha256,created_at FROM client_rubricas
    WHERE id=${versionId} AND client_id=${clientId} AND empresa_id=${empresaId} AND sha256=${sha256}`);
  if(!linha) throw new Error("Rubrica histórica: vínculo de versão, cliente, clínica ou hash não confere");
  let png:Buffer;
  try { png=await new ObjectStorageService().readPrivateObject(linha.object_path); }
  catch { throw new Error("Rubrica histórica: imagem registrada indisponível"); }
  if(!png?.length||createHash("sha256").update(png).digest("hex")!==sha256) {
    throw new Error("Rubrica histórica: integridade da imagem não confere");
  }
  return png;
}
