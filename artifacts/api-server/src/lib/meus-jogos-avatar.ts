import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface EstadoAvatarMedico {
  fotoNoCadastro: boolean;
  acessoAoArquivo: "nao_verificado";
  autorizacaoDeUso: "nao_cadastrada";
  fotoUtilizada: false;
  motivo: string;
}

/** Nunca devolve a URL privada da foto; sem autorização registrada, só informa o estado. */
export async function lerEstadoAvatarMedico(): Promise<EstadoAvatarMedico> {
  const r = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM professionals
       WHERE is_primary_doctor = TRUE AND active = TRUE
         AND photo_url IS NOT NULL AND btrim(photo_url) <> ''
    ) AS foto_no_cadastro`);
  const fotoNoCadastro = Boolean((r as { rows: Array<{ foto_no_cadastro: boolean }> }).rows[0]?.foto_no_cadastro);
  return {
    fotoNoCadastro,
    acessoAoArquivo: "nao_verificado",
    autorizacaoDeUso: "nao_cadastrada",
    fotoUtilizada: false,
    motivo: "O cadastro não contém autorização para usar a imagem do médico; o avatar exibido é ilustrativo e neutro.",
  };
}
