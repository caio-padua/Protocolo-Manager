import { db, clientsTable } from "@workspace/db";

// ============================================================================
// Casamento pasta-do-Drive <-> cliente do banco (spec + revisao CEO 10/07/2026).
// As pastas do Drive tem SO o nome (sem CPF). Regra do CEO: casar por NOME e, em
// caso de HOMONIMO, tratar como a MESMA pessoa por padrao. So sao pessoas
// diferentes se os CPFs forem diferentes; havendo CPF do laudo, roteia para o
// candidato certo. Sem CPF de desempate -> mesma pessoa, escolhe o 1o e segue,
// SEM validar com o CEO (ele afirma nao ter homonimos).
// ============================================================================

/** minusculo, sem acento, sem pontuacao, espacos colapsados. */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** So digitos do CPF. */
export function onlyDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/**
 * Tenta ler um CPF do nome da pasta do Drive. As pastas criadas pelo sistema
 * vem como "NOME CPF: xxx.xxx.xxx-xx"; ao migrar homonimos com CPFs diferentes,
 * esse CPF do proprio nome ja roteia para o cadastro certo, de graca (sem IA).
 */
export function parseCpfFromFolder(folderName: string): string | null {
  const digits = (folderName.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/) ?? [])[0];
  const only = onlyDigits(digits);
  return only.length === 11 ? only : null;
}

/**
 * Remove do nome da pasta o rotulo "CPF" e o proprio numero, deixando SO o nome
 * para casar com clients.name. Sem isso, pastas "NOME CPF: xxx..." nunca casariam
 * por nome (o CPF entraria no texto normalizado) e o desempate nem seria alcancado.
 */
export function stripCpfFromFolder(folderName: string): string {
  return folderName
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, " ")
    .replace(/\bcpf\b\s*:?/gi, " ");
}

export interface ClientLite {
  id: number;
  name: string;
  cpf: string | null;
  birthDate: string | null;
  status: string;
}

let cache: ClientLite[] | null = null;

/** Carrega (e memoriza) todos os clientes uma vez por run. */
export async function loadClients(force = false): Promise<ClientLite[]> {
  if (cache && !force) return cache;
  const rows = await db.select().from(clientsTable);
  cache = rows.map((r) => ({
    id: r.id,
    name: r.name,
    cpf: r.cpf,
    birthDate: r.birthDate,
    status: r.status,
  }));
  return cache;
}

export function clearClientCache(): void {
  cache = null;
}

/** Todos os clientes cujo nome normalizado bate exatamente com o da pasta.
 *  O CPF eventual no nome da pasta e removido antes de comparar (so o nome casa). */
export function findByName(clients: ClientLite[], folderName: string): ClientLite[] {
  const key = normalizeName(stripCpfFromFolder(folderName));
  if (!key) return [];
  return clients.filter((c) => normalizeName(c.name) === key);
}

export type MatchOutcome =
  | { kind: "matched"; client: ClientLite; how: "nome-unico" | "cpf" | "homonimo-unido"; candidates?: ClientLite[] }
  | { kind: "none" };

/**
 * Resolve o cliente de uma pasta. `cpf` (quando vier do conteudo do laudo)
 * serve para rotear entre homonimos com CPFs diferentes. Nunca retorna
 * "ambiguo": homonimo sem desempate = mesma pessoa (1o candidato).
 */
export function resolveClient(
  clients: ClientLite[],
  folderName: string,
  hint?: { cpf?: string | null },
): MatchOutcome {
  const candidates = findByName(clients, folderName);
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) return { kind: "matched", client: candidates[0], how: "nome-unico" };

  // Homonimo: so e outra pessoa se o CPF for diferente. Com CPF do laudo,
  // roteia para o candidato de mesmo CPF.
  const cpfHint = onlyDigits(hint?.cpf);
  if (cpfHint.length === 11) {
    const byCpf = candidates.find((c) => onlyDigits(c.cpf) === cpfHint);
    if (byCpf) return { kind: "matched", client: byCpf, how: "cpf", candidates };
  }
  // Sem desempate -> mesma pessoa: escolhe o 1o cadastro e segue.
  return { kind: "matched", client: candidates[0], how: "homonimo-unido", candidates };
}
