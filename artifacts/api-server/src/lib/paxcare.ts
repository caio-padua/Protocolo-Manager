/** Regras puras do PaxCare: categorias do cofre, compartilhamento e validacao de arquivo. */
export type TipoCofre = "historico" | "exame_externo" | "documento";
export const TIPOS_COFRE: readonly TipoCofre[] = ["historico", "exame_externo", "documento"];
export const isTipoCofre = (v: unknown): v is TipoCofre => typeof v === "string" && (TIPOS_COFRE as readonly string[]).includes(v);

export interface Compartilhamento { historico: boolean; exames: boolean; documentos: boolean }

/** Categoria de compartilhamento que governa cada tipo de item. */
export function categoriaDoTipo(t: TipoCofre): keyof Compartilhamento {
  return t === "historico" ? "historico" : t === "exame_externo" ? "exames" : "documentos";
}
/** Tipos que a clinica pode ver, dado o que o paciente compartilhou. Sem compartilhamento = lista vazia. */
export function tiposVisiveis(c: Compartilhamento): TipoCofre[] {
  return TIPOS_COFRE.filter((t) => c[categoriaDoTipo(t)]);
}

export const LIMITE_ARQUIVO_BYTES = 8 * 1024 * 1024;
/** Tipo do arquivo pelos primeiros bytes (nunca pelo nome ou pelo tipo declarado pelo navegador). */
export function tipoDoArquivo(b: Buffer): { mime: string; ext: string } | null {
  if (b.length > 4 && b.subarray(0, 4).toString("latin1") === "%PDF") return { mime: "application/pdf", ext: "pdf" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  return null;
}
/** Nome de arquivo seguro para exibicao (sem caminho, sem controle). */
export function nomeSeguro(n: string | undefined | null): string | null {
  const s = (n ?? "").replace(/[\\/\u0000-\u001f]/g, "").trim().slice(0, 120);
  return s || null;
}
