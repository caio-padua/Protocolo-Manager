/**
 * royalty.ts — Cálculo de royalty com trava anti-pirâmide.
 *
 * REGRA DE NEGÓCIO (30/07/2026):
 *   Royalty é pago SOMENTE ao pai imediato na hierarquia de licenciamento,
 *   e SOMENTE quando esse pai é filho direto do Platform Owner (PAXTER).
 *   Profundidade máxima permitida = 1 nível abaixo do Platform Owner.
 *
 * PROTEÇÃO ANTI-PIRÂMIDE:
 *   Se a empresa estiver a mais de 1 nível de distância do Platform Owner,
 *   calcularRoyalty() lança RoyaltyCadeiaProibidaError — nunca falha
 *   silenciosamente. Isso impede o esquema:
 *     A (royalty → PAXTER) ← B (royalty → A) ← C (royalty → B)
 *   onde um único pagamento de C dispara comissões em cascata.
 */

// ── Tipos de entrada ─────────────────────────────────────────────────────────

export interface EmpresaRoyaltyInfo {
  id: number;
  nome: string;
  empresaMaeId: number | null;   // FK para o pai na hierarquia (NULL = raiz)
  royaltyPercent: string | null; // % que esta empresa repassa ao PAXTER (padrão "30.00")
  isPlatformOwner: boolean;      // TRUE somente para a HQ PAXTER (Dr. Caio)
}

export interface CalcularRoyaltyParams {
  /** ID da empresa pagadora do royalty (quem gerou a receita). */
  empresaId: number;
  /** Valor base em centavos sobre o qual o percentual será aplicado. */
  valorBaseCentavos: number;
  /** Lista completa de empresas para percorrer a hierarquia. */
  empresas: EmpresaRoyaltyInfo[];
}

export interface RoyaltyResult {
  /** ID da empresa que recebe o royalty (pai imediato). */
  beneficiarioId: number;
  /** Nome da empresa beneficiária (para log/auditoria). */
  beneficiarioNome: string;
  /** Percentual aplicado (ex.: 30 para 30%). */
  percentual: number;
  /** Valor calculado em centavos (arredondado para baixo). */
  valorCentavos: number;
}

// ── Erro dedicado ─────────────────────────────────────────────────────────────

/**
 * Lançado quando calcularRoyalty() detecta uma cadeia de royalties com
 * profundidade > 1, o que configuraria um esquema de pirâmide acidental.
 */
export class RoyaltyCadeiaProibidaError extends Error {
  readonly empresaId: number;
  readonly profundidade: number;
  readonly cadeia: number[];

  constructor(empresaId: number, profundidade: number, cadeia: number[]) {
    const cadeiaStr = cadeia.join(" → ");
    super(
      `ROYALTY BLOQUEADO — cadeia de pirâmide detectada. ` +
      `Empresa ID ${empresaId} está a ${profundidade} nível(eis) de distância do Platform Owner ` +
      `(profundidade máxima permitida = 1). ` +
      `Cadeia encontrada: [${cadeiaStr}]. ` +
      `Royalty só pode ser calculado para empresas diretamente licenciadas pelo PAXTER. ` +
      `Corrija o cadastro de empresaMaeId antes de emitir cobranças.`
    );
    this.name = "RoyaltyCadeiaProibidaError";
    this.empresaId = empresaId;
    this.profundidade = profundidade;
    this.cadeia = cadeia;
  }
}

// ── Função principal ──────────────────────────────────────────────────────────

/**
 * Calcula o royalty devido por uma empresa ao seu pai imediato.
 *
 * @returns RoyaltyResult com o beneficiário e o valor em centavos,
 *          ou null se a empresa não tiver pai ou se o percentual for zero.
 *
 * @throws RoyaltyCadeiaProibidaError se a empresa estiver a mais de 1 nível
 *         de distância do Platform Owner (trava anti-pirâmide).
 * @throws Error se empresaId não for encontrado na lista fornecida.
 *
 * @example
 *   // Empresa A (filha direta do PAXTER) → OK
 *   calcularRoyalty({ empresaId: 2, valorBaseCentavos: 100_00, empresas });
 *
 *   // Empresa B (filha de A que é filha do PAXTER) → THROW
 *   calcularRoyalty({ empresaId: 3, valorBaseCentavos: 100_00, empresas });
 *   // ↑ RoyaltyCadeiaProibidaError: profundidade 2, cadeia [3 → 2 → 1(PO)]
 */
export function calcularRoyalty(
  params: CalcularRoyaltyParams
): RoyaltyResult | null {
  const { empresaId, valorBaseCentavos, empresas } = params;

  // ── 1. Montar índice por ID ──────────────────────────────────────────────
  const byId = new Map<number, EmpresaRoyaltyInfo>(
    empresas.map((e) => [e.id, e])
  );

  const empresa = byId.get(empresaId);
  if (!empresa) {
    throw new Error(
      `calcularRoyalty: empresa ID ${empresaId} não encontrada na lista de empresas fornecida.`
    );
  }

  // Platform Owner não paga royalty a ninguém (ele É o topo).
  if (empresa.isPlatformOwner) {
    return null;
  }

  // ── 2. Percorrer a cadeia e medir a profundidade ─────────────────────────
  //
  // Contamos quantos saltos são necessários para chegar ao Platform Owner,
  // partindo da empresa pagadora.
  //
  //   Exemplo PERMITIDO   (profundidade = 1):
  //     PAXTER(PO) ← A  →  calcularRoyalty(A): 1 salto até PO — OK
  //
  //   Exemplo BLOQUEADO   (profundidade = 2):
  //     PAXTER(PO) ← A ← B  →  calcularRoyalty(B): 2 saltos — LANÇA ERRO
  //
  const cadeia: number[] = [empresaId];
  const visitados = new Set<number>([empresaId]); // protege contra ciclo acidental
  let profundidade = 0;
  let cursor: EmpresaRoyaltyInfo = empresa;

  while (cursor.empresaMaeId !== null && cursor.empresaMaeId !== undefined) {
    const pai = byId.get(cursor.empresaMaeId);

    // Pai não encontrado na lista: interrompemos (não podemos medir a cadeia completa).
    if (!pai) {
      break;
    }

    cadeia.push(pai.id);
    profundidade += 1;

    // Chegamos ao topo da hierarquia — saímos do loop.
    if (pai.isPlatformOwner) {
      break;
    }

    // Guarda contra ciclo circular (erro de cadastro).
    if (visitados.has(pai.id)) {
      throw new Error(
        `calcularRoyalty: ciclo detectado na hierarquia de empresas. ` +
        `Empresa ID ${pai.id} aparece mais de uma vez na cadeia: [${cadeia.join(" → ")}].`
      );
    }

    visitados.add(pai.id);
    cursor = pai;
  }

  // ── 3. ASSERT ANTI-PIRÂMIDE ──────────────────────────────────────────────
  //
  // Profundidade máxima permitida = 1.
  // Se profundidade > 1, a empresa está pelo menos 2 níveis abaixo do
  // Platform Owner, o que criaria uma cadeia de royalties em cascata.
  //
  if (profundidade > 1) {
    throw new RoyaltyCadeiaProibidaError(empresaId, profundidade, cadeia);
  }

  // ── 4. Calcular royalty para o pai imediato ──────────────────────────────
  if (!empresa.empresaMaeId) {
    // Empresa sem pai — nenhum royalty a pagar.
    return null;
  }

  const pai = byId.get(empresa.empresaMaeId);
  if (!pai) {
    // Pai referenciado mas ausente na lista — não calculamos.
    return null;
  }

  const percentual = parseFloat(pai.royaltyPercent ?? "0");
  if (!isFinite(percentual) || percentual <= 0) {
    // Percentual zero ou inválido — nenhum royalty.
    return null;
  }

  // Arredondamento para baixo (floor) para não cobrar centavo a mais do que o contrato.
  const valorCentavos = Math.floor((valorBaseCentavos * percentual) / 100);

  return {
    beneficiarioId: pai.id,
    beneficiarioNome: pai.nome,
    percentual,
    valorCentavos,
  };
}
