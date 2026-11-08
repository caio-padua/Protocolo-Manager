import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { ObjectStorageService } from "../objectStorage";
import { aplicarOuroAoSimbolo } from "./paxmed-ouro";
import { recortarSimbolo } from "./paxmed-recortar-simbolo";
import { validarTextosEmpresa2b, type TextosEmpresa2b } from "./paxmed-2b-limites";

/** Uma identidade já conferida e pertencente à empresa do contexto clínico. */
export type IdentidadeClinica2b = {
  empresaId: number;
  textos: TextosEmpresa2b;
  simboloDourado: Uint8Array;
};

type Registro = {
  empresa_id: number;
  nome_cabecalho: string;
  rodape_linha1: string;
  rodape_linha2: string;
  rodape_linha3: string;
  simbolo_path: string;
  simbolo_exemplo: boolean;
  dados_exemplo: boolean;
};

type Dependencias = {
  carregarRegistro: (empresaId: number) => Promise<Registro | undefined>;
  carregarSimbolo: (id: string) => Promise<Uint8Array>;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const limiteBytes = 2 * 1024 * 1024;

export class IdentidadeEmpresa2bError extends Error {
  constructor(public status: 422 | 503, message: string) { super(message); }
}

const dependenciasReais: Dependencias = {
  async carregarRegistro(empresaId) {
    const result = await db.execute(sql`
      SELECT empresa_id, nome_cabecalho, rodape_linha1, rodape_linha2,
             rodape_linha3, simbolo_path, simbolo_exemplo, dados_exemplo
      FROM paxmed_2b_empresa_identidade WHERE empresa_id = ${empresaId}
    `);
    return result.rows[0] as Registro | undefined;
  },
  async carregarSimbolo(id) {
    const file = await new ObjectStorageService().getObjectEntityFile(`/objects/paxmed-marcas-finais/${id}`);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > limiteBytes) {
      throw new Error("O símbolo da empresa está vazio ou excede o limite permitido.");
    }
    const [bytes] = await file.download();
    if (bytes.length !== size) throw new Error("O símbolo da empresa está incompleto.");
    return bytes;
  },
};

/**
 * O identificador deve vir da identidade clínica autorizada pelo servidor,
 * nunca de parâmetro recebido diretamente do navegador.
 */
export async function carregarIdentidadeClinica2b(
  empresaId: number,
  dependencias: Dependencias = dependenciasReais,
): Promise<IdentidadeClinica2b> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) throw new IdentidadeEmpresa2bError(422, "Empresa clínica inválida.");
  let row: Registro | undefined;
  try { row = await dependencias.carregarRegistro(empresaId); }
  catch { throw new IdentidadeEmpresa2bError(503, "Não foi possível consultar a identidade empresarial."); }
  if (!row || Number(row.empresa_id) !== empresaId) throw new IdentidadeEmpresa2bError(422, "Identidade de documentos não configurada para esta empresa.");
  if (row.simbolo_exemplo !== false || row.dados_exemplo !== false) {
    throw new IdentidadeEmpresa2bError(422, "A identidade desta empresa contém dados ou símbolo de demonstração.");
  }
  if (typeof row.simbolo_path !== "string" || !uuid.test(row.simbolo_path)) {
    throw new IdentidadeEmpresa2bError(422, "A identidade da empresa não possui símbolo válido.");
  }
  const textos: TextosEmpresa2b = {
    nomeCabecalho: row.nome_cabecalho,
    rodapeLinha1: row.rodape_linha1,
    rodapeLinha2: row.rodape_linha2,
    rodapeLinha3: row.rodape_linha3,
  };
  try { await validarTextosEmpresa2b(textos); }
  catch (error) { throw new IdentidadeEmpresa2bError(422, error instanceof Error ? error.message : "Textos da identidade inválidos."); }
  let original: Uint8Array;
  try { original = await dependencias.carregarSimbolo(row.simbolo_path); }
  catch { throw new IdentidadeEmpresa2bError(503, "Não foi possível carregar o símbolo da empresa."); }
  if (!original.length || original.length > limiteBytes) throw new IdentidadeEmpresa2bError(422, "O símbolo da empresa está vazio ou excede o limite permitido.");
  let simboloDourado: Uint8Array;
  try { simboloDourado = recortarSimbolo(aplicarOuroAoSimbolo(original)); }
  catch (error) { throw new IdentidadeEmpresa2bError(422, error instanceof Error ? error.message : "Símbolo inválido."); }
  return { empresaId, textos, simboloDourado };
}
