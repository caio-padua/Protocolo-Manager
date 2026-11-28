import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const PALAVRAS_MINUSCULAS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "a", "o", "as", "os", "com", "para", "por", "ao", "aos",
]);

function ehTermoTecnico(token: string): boolean {
  if (/\d/.test(token)) return true;
  if (/[+/]/.test(token)) return true;
  if (/^[A-Z]{2,4}$/.test(token)) return true;
  return false;
}

export function tituloProprio(
  texto: string | null | undefined,
  opcoes: { preservarTecnicos?: boolean } = {},
): string {
  if (!texto) return "";
  const tokens = texto.trim().split(/\s+/);
  return tokens
    .map((token, indice) => {
      if (opcoes.preservarTecnicos && ehTermoTecnico(token)) return token;
      const minusculo = token.toLocaleLowerCase("pt-BR");
      if (indice > 0 && PALAVRAS_MINUSCULAS.has(minusculo)) return minusculo;
      return minusculo.charAt(0).toLocaleUpperCase("pt-BR") + minusculo.slice(1);
    })
    .join(" ");
}
