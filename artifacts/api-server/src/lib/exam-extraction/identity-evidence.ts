/**
 * Evidências materiais do texto do laudo que contradizem a identidade (função pura).
 * Limite global: nenhuma regra de clínica desliga estes detectores.
 * Lacuna declarada: sexo, endereço e telefone ainda não são comparados.
 */
import { isValidCpf, normalizeCpf, parseBirthDate } from "./identity-check.js";

export interface EvidenceFinding {
  code: "dois_cpfs_no_texto" | "coleta_antes_do_nascimento";
  verdict: "revisao" | "contradicao";
  message: string;
}

export interface EvidenceResult {
  /** false = não havia texto para examinar (registrado na trilha, nunca tratado como "limpo"). */
  evaluated: boolean;
  findings: EvidenceFinding[];
}

/** Só CPF formatado (000.000.000-00) ou após o rótulo "CPF": número solto de 11 dígitos é protocolo, não CPF. */
export function findCpfsInText(text: string): string[] {
  const found = new Set<string>();
  const formatted = text.matchAll(/(?<!\d)(\d{3})\.(\d{3})\.(\d{3})-(\d{2})(?!\d)/g);
  for (const m of formatted) found.add(`${m[1]}${m[2]}${m[3]}${m[4]}`);
  const labeled = text.matchAll(/\bCPF\b\s*[:\-]?\s*(\d{11})(?!\d)/gi);
  for (const m of labeled) found.add(m[1]);
  return [...found].filter((c) => isValidCpf(c));
}

export function detectEvidenceConflicts(input: {
  text: string | null | undefined;
  collectionDate?: string | null;
  registeredBirthDate?: string | null;
}): EvidenceResult {
  const findings: EvidenceFinding[] = [];
  const text = input.text?.trim() ?? "";
  const evaluated = text.length > 0;
  if (evaluated) {
    const cpfs = [...new Set(findCpfsInText(text).map((c) => normalizeCpf(c)))].filter(Boolean);
    if (cpfs.length > 1) {
      findings.push({
        code: "dois_cpfs_no_texto",
        verdict: "revisao",
        message: `O texto do laudo traz ${cpfs.length} CPFs válidos distintos; pode haver mais de um paciente no mesmo arquivo.`,
      });
    }
  }
  const collected = parseBirthDate(input.collectionDate);
  const born = parseBirthDate(input.registeredBirthDate);
  if (collected && born && collected < born) {
    findings.push({
      code: "coleta_antes_do_nascimento",
      verdict: "contradicao",
      message: "A data de coleta do laudo é anterior ao nascimento cadastrado do cliente.",
    });
  }
  return { evaluated, findings };
}
