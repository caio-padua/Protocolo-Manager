/**
 * Apelido de exibição da agenda: o que aparece embaixo do título da profissão no botão da agenda.
 * O nome completo da agenda não muda (é a referência do Google); o apelido é um campo do cadastro,
 * então cada clínica escolhe o seu. Este arquivo só SUGERE um apelido a partir do nome, para o cadastro
 * já vir preenchido: tira a palavra "AGENDA" e a profissão que já está no título superior.
 */
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const PROFISSOES = new Set([
  "medico", "medica", "medicos", "medicina", "enfermagem", "enfermeira", "enfermeiro",
  "biomedico", "biomedica", "biomedicina", "nutricao", "nutricionista", "psicologia", "psicologo", "psicologa",
]);

/** "AGENDA MEDICO - CAIO PADUA - HOME CARE" vira "CAIO PADUA - HOME CARE". Se não sobrar nada, devolve o nome inteiro. */
export function sugerirApelido(nome: string): string {
  const partes = nome.trim().split(/\s+-\s+/);
  const primeira = semAcento(partes[0]).replace(/^agenda\s+/, "");
  if (partes.length >= 2 && (PROFISSOES.has(primeira) || primeira === "agenda")) {
    const resto = partes.slice(1).join(" - ").trim();
    if (resto) return resto;
  }
  const semPalavraAgenda = nome.trim().replace(/^agenda\s+/i, "").trim();
  return semPalavraAgenda || nome.trim();
}

/** Texto do botão: o apelido do cadastro; sem apelido, a sugestão feita a partir do nome. */
export function apelidoDaAgenda(nome: string, apelido?: string | null): string {
  return apelido?.trim() || sugerirApelido(nome);
}
