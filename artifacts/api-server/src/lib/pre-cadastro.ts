// Pré-cadastro obrigatório da área do cliente (/area).
// Exigido só para quem foi convidado (clients.pre_cadastro_exigido = true).
// A lista de campos obrigatórios vive aqui, num lugar só.
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export const CAMPOS_PRE_CADASTRO = [
  { chave: "birthDate", rotulo: "Data de nascimento" },
  { chave: "phone", rotulo: "Telefone com DDD" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "sexoBiologico", rotulo: "Sexo biológico" },
  { chave: "address", rotulo: "Endereço completo" },
] as const;
export type ChavePreCadastro = (typeof CAMPOS_PRE_CADASTRO)[number]["chave"];

export const SEXOS_VALIDOS = ["F", "M"] as const;

export interface EstadoPreCadastro {
  exigido: boolean;
  completo: boolean;
  pendentes: ChavePreCadastro[];
  valores: Record<ChavePreCadastro, string>;
}

function vazio(v: unknown): boolean {
  return typeof v !== "string" || v.trim() === "";
}

export function pendentesDe(v: Record<ChavePreCadastro, string | null | undefined>): ChavePreCadastro[] {
  const out: ChavePreCadastro[] = [];
  for (const c of CAMPOS_PRE_CADASTRO) {
    const val = v[c.chave];
    if (vazio(val)) { out.push(c.chave); continue; }
    if (c.chave === "phone" && String(val).replace(/\D/g, "").length < 10) out.push(c.chave);
    else if (c.chave === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim())) out.push(c.chave);
    else if (c.chave === "sexoBiologico" && !(SEXOS_VALIDOS as readonly string[]).includes(String(val).trim().toUpperCase())) out.push(c.chave);
    else if (c.chave === "birthDate" && String(val).replace(/\D/g, "").length !== 8) out.push(c.chave);
  }
  return out;
}

export async function lerEstadoPreCadastro(clientId: number): Promise<EstadoPreCadastro | null> {
  const r = await db.execute(sql`
    SELECT pre_cadastro_exigido AS exigido, pre_cadastro_completo_em AS completo_em,
           birth_date, phone, email, sexo_biologico, address
      FROM clients WHERE id = ${clientId} AND deleted_at IS NULL`);
  const row = (r.rows as Record<string, unknown>[])[0];
  if (!row) return null;
  const valores = {
    birthDate: String(row.birth_date ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    sexoBiologico: String(row.sexo_biologico ?? ""),
    address: String(row.address ?? ""),
  } as Record<ChavePreCadastro, string>;
  const pendentes = pendentesDe(valores);
  const exigido = row.exigido === true;
  return { exigido, completo: !exigido || (row.completo_em != null && pendentes.length === 0), pendentes, valores };
}
