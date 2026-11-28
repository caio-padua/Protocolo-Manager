import {
  db,
  empresasTable,
  locationProfessionalsTable,
  locationsTable,
  professionalEmpresasTable,
  professionalsTable,
} from "@workspace/db";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

/**
 * Vínculo empresarial do profissional.
 *
 * Posição 1 = vínculo originário = professionals.empresa_id (fonte única).
 * Posições 2 a 5 = tabela professional_empresas.
 * Local sem empresa (legado) pertence ao Instituto Pádua.
 */
export const EMPRESA_PADRAO_ID = 5;
export const LIMITE_EMPRESAS_POR_PROFISSIONAL = 5;
export const LIMITE_EMPRESAS_ADICIONAIS = LIMITE_EMPRESAS_POR_PROFISSIONAL - 1;

// Aceita o banco ou uma transação (mesma superfície de consulta).
type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export type VinculoEmpresa = {
  ordem: number;
  papel: "originario" | "adicional";
  empresaId: number;
  nome: string;
  ativa: boolean;
};

export type AgendaLiberada = { locationId: number; nome: string };

export class VinculoEmpresaError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown> & { error: string },
  ) {
    super(body.error);
  }
}

export function empresaEfetivaDoLocal(empresaId: number | null | undefined): number {
  return empresaId ?? EMPRESA_PADRAO_ID;
}

export function condicaoLocalDaEmpresa(empresaId: number) {
  return empresaId === EMPRESA_PADRAO_ID
    ? or(eq(locationsTable.empresaId, empresaId), isNull(locationsTable.empresaId))
    : eq(locationsTable.empresaId, empresaId);
}

/** Lista as 5 posições (originária primeiro). Retorna null se o profissional não existe. */
export async function carregarVinculosEmpresa(
  professionalId: number,
  executor: Executor = db,
): Promise<VinculoEmpresa[] | null> {
  const [professional] = await executor
    .select({ id: professionalsTable.id, empresaId: professionalsTable.empresaId })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, professionalId))
    .limit(1);
  if (!professional) return null;

  const adicionais = await executor
    .select({ empresaId: professionalEmpresasTable.empresaId, ordem: professionalEmpresasTable.ordem })
    .from(professionalEmpresasTable)
    .where(eq(professionalEmpresasTable.professionalId, professionalId))
    .orderBy(asc(professionalEmpresasTable.ordem));

  const originariaId = professional.empresaId ?? EMPRESA_PADRAO_ID;
  const ids = [originariaId, ...adicionais.map((row) => row.empresaId)];
  const empresas = await executor
    .select({ id: empresasTable.id, nome: empresasTable.nome, ativa: empresasTable.ativa })
    .from(empresasTable)
    .where(inArray(empresasTable.id, ids));
  const porId = new Map(empresas.map((empresa) => [empresa.id, empresa]));
  const montar = (empresaId: number, ordem: number, papel: VinculoEmpresa["papel"]): VinculoEmpresa => ({
    ordem,
    papel,
    empresaId,
    nome: porId.get(empresaId)?.nome ?? `Empresa ${empresaId}`,
    ativa: porId.get(empresaId)?.ativa ?? false,
  });
  return [
    montar(originariaId, 1, "originario"),
    ...adicionais.map((row) => montar(row.empresaId, row.ordem, "adicional")),
  ];
}

/** Conjunto das empresas do profissional (originária + adicionais). */
export async function empresaIdsDoProfissional(
  professionalId: number,
  executor: Executor = db,
): Promise<Set<number>> {
  const vinculos = await carregarVinculosEmpresa(professionalId, executor);
  return new Set((vinculos ?? []).map((vinculo) => vinculo.empresaId));
}

/** Ids de profissionais cadastrados (originário ou adicional) na empresa. */
export async function profissionaisAdicionaisDaEmpresa(empresaId: number): Promise<number[]> {
  const rows = await db
    .select({ id: professionalEmpresasTable.professionalId })
    .from(professionalEmpresasTable)
    .where(eq(professionalEmpresasTable.empresaId, empresaId));
  return rows.map((row) => row.id);
}

/** Empresas que podem receber um NOVO vínculo (mesmo filtro da lista pública de empresas, só ativas). */
export async function empresasElegiveis(
  ids: number[],
  executor: Executor = db,
): Promise<Map<number, { id: number; nome: string }>> {
  if (!ids.length) return new Map();
  const rows = await executor
    .select({ id: empresasTable.id, nome: empresasTable.nome, tipo: empresasTable.tipo, status: empresasTable.status })
    .from(empresasTable)
    .where(and(
      inArray(empresasTable.id, ids),
      eq(empresasTable.ativa, true),
      eq(empresasTable.isPlatformOwner, false),
    ));
  return new Map(
    rows
      .filter((row) => (row.tipo === "clinic" || row.tipo === "genesis_seed") && row.status !== "ARQUIVADA")
      .map((row) => [row.id, { id: row.id, nome: row.nome }]),
  );
}

export async function agendasLiberadasNaEmpresa(
  professionalId: number,
  empresaId: number,
  executor: Executor = db,
): Promise<AgendaLiberada[]> {
  const rows = await executor
    .select({ locationId: locationsTable.id, nome: locationsTable.name })
    .from(locationProfessionalsTable)
    .innerJoin(locationsTable, eq(locationProfessionalsTable.locationId, locationsTable.id))
    .where(and(
      eq(locationProfessionalsTable.professionalId, professionalId),
      condicaoLocalDaEmpresa(empresaId),
    ));
  return rows;
}

export type PedidoVinculos = {
  /** Novo vínculo originário; ausente = mantém. */
  originariaId?: number;
  /** Lista ORDENADA das empresas adicionais (posições 2 a 5); ausente = mantém. */
  adicionaisIds?: number[];
};

export type ResultadoVinculos = {
  antes: VinculoEmpresa[];
  depois: VinculoEmpresa[];
  mudou: boolean;
};

function inteiroPositivo(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0;
}

/**
 * Valida e aplica o pedido DENTRO de uma transação (o chamador trava a linha do
 * profissional com FOR UPDATE antes). Lança VinculoEmpresaError sem ter gravado nada.
 */
export async function aplicarVinculosEmpresa(
  tx: Executor,
  professionalId: number,
  pedido: PedidoVinculos,
): Promise<ResultadoVinculos> {
  const antes = await carregarVinculosEmpresa(professionalId, tx);
  if (!antes) throw new VinculoEmpresaError(404, { error: "Profissional não encontrado" });

  const originariaAtual = antes[0].empresaId;
  const adicionaisAtuais = antes.slice(1).map((vinculo) => vinculo.empresaId);

  if (pedido.originariaId !== undefined && !inteiroPositivo(pedido.originariaId)) {
    throw new VinculoEmpresaError(400, { error: "Vínculo originário inválido" });
  }
  if (pedido.adicionaisIds !== undefined &&
      (!Array.isArray(pedido.adicionaisIds) || !pedido.adicionaisIds.every(inteiroPositivo))) {
    throw new VinculoEmpresaError(400, { error: "Lista de empresas inválida" });
  }

  const novaOriginaria = pedido.originariaId ?? originariaAtual;
  const novasAdicionais = pedido.adicionaisIds ??
    adicionaisAtuais.filter((empresaId) => empresaId !== novaOriginaria);

  if (new Set(novasAdicionais).size !== novasAdicionais.length) {
    throw new VinculoEmpresaError(400, { error: "A mesma empresa não pode aparecer duas vezes" });
  }
  if (novasAdicionais.includes(novaOriginaria)) {
    throw new VinculoEmpresaError(400, {
      error: "A empresa do vínculo originário já é a principal; escolha outra empresa para as demais posições",
    });
  }
  if (novasAdicionais.length > LIMITE_EMPRESAS_ADICIONAIS) {
    throw new VinculoEmpresaError(400, {
      error: `Cada profissional pode ter no máximo ${LIMITE_EMPRESAS_POR_PROFISSIONAL} empresas (1 originária e ${LIMITE_EMPRESAS_ADICIONAIS} adicionais)`,
    });
  }

  // Só empresas NOVAS precisam ser elegíveis; as já vinculadas permanecem mesmo se hoje inativas.
  const atuais = new Set([originariaAtual, ...adicionaisAtuais]);
  const novas = [novaOriginaria, ...novasAdicionais].filter((empresaId) => !atuais.has(empresaId));
  const elegiveis = await empresasElegiveis(novas, tx);
  const invalidas = novas.filter((empresaId) => !elegiveis.has(empresaId));
  if (invalidas.length) {
    throw new VinculoEmpresaError(400, {
      error: "Empresa inexistente, inativa ou não permitida para vínculo de profissional",
      empresaIds: invalidas,
    });
  }

  // Retirada com agenda ainda liberada: recusa, nunca desliga sozinho.
  const finais = new Set([novaOriginaria, ...novasAdicionais]);
  for (const vinculo of antes) {
    if (finais.has(vinculo.empresaId)) continue;
    const agendas = await agendasLiberadasNaEmpresa(professionalId, vinculo.empresaId, tx);
    if (agendas.length) {
      throw new VinculoEmpresaError(409, {
        error: `Não é possível retirar ${vinculo.nome}: ainda há agenda liberada nessa empresa. Desligue a agenda antes.`,
        code: "EMPRESA_COM_AGENDA_LIBERADA",
        empresaId: vinculo.empresaId,
        empresaNome: vinculo.nome,
        agendas,
      });
    }
  }

  const desejado = new Map(novasAdicionais.map((empresaId, indice) => [empresaId, indice + 2]));
  const existentes = await tx
    .select({
      id: professionalEmpresasTable.id,
      empresaId: professionalEmpresasTable.empresaId,
      ordem: professionalEmpresasTable.ordem,
    })
    .from(professionalEmpresasTable)
    .where(eq(professionalEmpresasTable.professionalId, professionalId));

  const remover = existentes.filter((row) => desejado.get(row.empresaId) !== row.ordem);
  if (remover.length) {
    await tx
      .delete(professionalEmpresasTable)
      .where(inArray(professionalEmpresasTable.id, remover.map((row) => row.id)));
  }
  const mantidas = new Set(
    existentes.filter((row) => desejado.get(row.empresaId) === row.ordem).map((row) => row.empresaId),
  );
  const inserir = [...desejado.entries()]
    .filter(([empresaId]) => !mantidas.has(empresaId))
    .map(([empresaId, ordem]) => ({ professionalId, empresaId, ordem }));
  if (inserir.length) await tx.insert(professionalEmpresasTable).values(inserir);

  if (novaOriginaria !== originariaAtual) {
    await tx
      .update(professionalsTable)
      .set({ empresaId: novaOriginaria })
      .where(eq(professionalsTable.id, professionalId));
  }

  const depois = (await carregarVinculosEmpresa(professionalId, tx))!;
  const assinatura = (lista: VinculoEmpresa[]) => lista.map((v) => `${v.ordem}:${v.empresaId}`).join("|");
  return { antes, depois, mudou: assinatura(antes) !== assinatura(depois) };
}

export type DecisaoLocal =
  | { permitido: true }
  | { permitido: false; status: 404 | 409; erro: string; code?: string };

/**
 * Regra 3.7: o local só pode ser ligado se a empresa dele estiver entre as
 * empresas do profissional.
 */
export async function validarLocalParaProfissional(
  professionalId: number,
  locationId: number,
  executor: Executor = db,
): Promise<DecisaoLocal> {
  const [local] = await executor
    .select({ id: locationsTable.id, empresaId: locationsTable.empresaId, nome: locationsTable.name })
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId))
    .limit(1);
  if (!local) return { permitido: false, status: 404, erro: "Clínica não encontrada" };
  const vinculos = await carregarVinculosEmpresa(professionalId, executor);
  if (!vinculos) return { permitido: false, status: 404, erro: "Profissional não encontrado" };
  const empresaDoLocal = empresaEfetivaDoLocal(local.empresaId);
  if (vinculos.some((vinculo) => vinculo.empresaId === empresaDoLocal)) return { permitido: true };
  return {
    permitido: false,
    status: 409,
    code: "EMPRESA_NAO_VINCULADA",
    erro: `O local "${local.nome}" pertence a uma empresa em que este profissional não está cadastrado. Cadastre a empresa em VÍNCULOS primeiro.`,
  };
}
