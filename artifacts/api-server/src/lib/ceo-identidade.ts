import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export interface CeoIdentidade {
  fotoPath: string | null;
  medicoAtivo: boolean;
  medicoProfessionalId: number | null;
}

export async function lerCeoIdentidade(): Promise<CeoIdentidade> {
  const r = await db.execute(sql`SELECT foto_path, medico_ativo, medico_professional_id FROM ceo_identidade WHERE id = 1`);
  const row = r.rows[0] as { foto_path: string | null; medico_ativo: boolean; medico_professional_id: number | null } | undefined;
  if (!row) return { fotoPath: null, medicoAtivo: true, medicoProfessionalId: null };
  return { fotoPath: row.foto_path, medicoAtivo: row.medico_ativo, medicoProfessionalId: row.medico_professional_id };
}

/**
 * Trava de emissão: o cadastro médico do CEO só emite documento com o interruptor
 * "Profissional Médico" LIGADO. Outros médicos nunca passam por esta trava.
 * Falha de leitura do banco bloqueia somente o médico do CEO (fail-closed para ele).
 */
export async function medicoDoCeoPodeEmitir(professionalId: number): Promise<boolean> {
  const ceo = await lerCeoIdentidade();
  if (ceo.medicoProfessionalId !== professionalId) return true;
  return ceo.medicoAtivo;
}
