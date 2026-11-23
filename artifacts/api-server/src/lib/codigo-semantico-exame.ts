// Nomenclatura Universal PADCOM V4.0 (exames): XXXX XXXX XXXX XXXX NNNN
//   B1 = dominio fixo EXAM | B2 = area/bloco (4) | B3 = grade (4) | B4 = nick do nome (4) | SEQ = 4 digitos.
// Fonte da regra: planilha 01_regra_universal.csv do repositorio IHE (Dr. Manus, 11/04/2026).

export const GRADES_EXAME = [
  { codigo: "GBAS", rotulo: "Grade básica" },
  { codigo: "GINT", rotulo: "Grade intermediária" },
  { codigo: "GAMP", rotulo: "Grade ampliada" },
  { codigo: "GSOF", rotulo: "Grade sofisticada" },
  { codigo: "SGRD", rotulo: "Sem grade (imagem e procedimentos)" },
] as const;
const GRADES_VALIDAS: ReadonlySet<string> = new Set(GRADES_EXAME.map((g) => g.codigo));

const PALAVRAS_IGNORADAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "COM", "POR", "EM", "A", "O"]);

export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

/** Nick base de 4 caracteres: letras/numeros do nome real, sem acento, completado com X. */
export function nickBase(nome: string): string {
  const palavras = semAcento(nome)
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const uteis = palavras.filter((p) => !PALAVRAS_IGNORADAS.has(p));
  const fonte = (uteis.length > 0 ? uteis : palavras).join("");
  if (!fonte) throw new Error("Nome sem letras ou numeros para gerar o nick");
  return fonte.slice(0, 4).padEnd(4, "X");
}

/** Resolve colisao de nick (ja usado por OUTRO exame): troca o ultimo caractere por 1-9 e depois A-Z. */
export function nickUnico(nome: string, nicksUsados: ReadonlySet<string>): string {
  const base = nickBase(nome);
  if (!nicksUsados.has(base)) return base;
  const sufixos = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const s of sufixos) {
    const cand = base.slice(0, 3) + s;
    if (!nicksUsados.has(cand)) return cand;
  }
  throw new Error("Nao ha nick livre para este nome; informe um nick manualmente");
}

export interface CodigoExame {
  b1: "EXAM";
  b2: string;
  b3: string;
  b4: string;
  seq: string;
  semantico: string; // "EXAM TIRE GBAS TSHX 0001"
  compacto: string; // "EXAMTIREGBASTSHX0001" (valor de codigo_exame para exames novos)
}

export function montarCodigoExame(area: string, grade: string, nick: string, seq = 1): CodigoExame {
  const b2 = area.trim().toUpperCase();
  const b3 = grade.trim().toUpperCase();
  const b4 = nick.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(b2)) throw new Error("Area do codigo deve ter 4 letras ou numeros");
  if (!GRADES_VALIDAS.has(b3)) throw new Error("Grade invalida");
  if (!/^[A-Z0-9]{4}$/.test(b4)) throw new Error("Nick deve ter 4 letras ou numeros");
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) throw new Error("Sequencial fora de 1 a 9999");
  const s = String(seq).padStart(4, "0");
  return {
    b1: "EXAM",
    b2,
    b3,
    b4,
    seq: s,
    semantico: `EXAM ${b2} ${b3} ${b4} ${s}`,
    compacto: `EXAM${b2}${b3}${b4}${s}`,
  };
}
