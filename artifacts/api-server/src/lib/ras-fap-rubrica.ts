/**
 * Formatos da rubrica no RAS FAP (K9). Funções puras, sem banco e sem PDF.
 *
 * Formatos decididos pelo CEO em 12/06/2026 (repositório IHE, seção 10 e 11 da proposta):
 *   - Cliente: "Sobrenome, I.N.I." = sobrenome + iniciais de TODOS os nomes antes dele
 *     (Caio Henrique Souza Padua -> Padua, C.H.S.). Sobrenome longo encurta SÓ o sobrenome.
 *   - Enfermeira: nome por extenso, cortado até caber.
 *   - Folga de 2 caracteres: quem chama decide o que "cabe" (a medida real da fonte na célula,
 *     já descontada a folga). Aqui só se corta até `cabe` devolver verdadeiro.
 *
 * Acentos são preservados (o RAS FAP do Manager imprime acentos; o IHE os removia por limitação do Apps Script).
 */

export type CabeNoEspaco = (texto: string) => boolean;

function partesDoNome(nome: string | null | undefined): string[] {
  return String(nome ?? "").trim().split(/\s+/).filter(Boolean);
}

/** "Caio Henrique Souza Padua" -> "C.H.S." (vazio se houver uma palavra só). */
export function iniciaisDoMeio(nome: string | null | undefined): string {
  const partes = partesDoNome(nome);
  if (partes.length <= 1) return "";
  return partes.slice(0, -1).map((p) => Array.from(p)[0]!.toLocaleUpperCase("pt-BR")).join(".") + ".";
}

/**
 * Rubrica do cliente. `sufixo` (ex.: " (cadastro)") fica sempre inteiro; só o sobrenome encurta.
 * Devolve "" se o nome estiver vazio.
 */
export function rubricaCliente(nome: string | null | undefined, cabe: CabeNoEspaco, sufixo = ""): string {
  const partes = partesDoNome(nome);
  if (partes.length === 0) return "";
  const sobrenome = Array.from(partes[partes.length - 1]!);
  const iniciais = iniciaisDoMeio(nome);
  const fixo = (iniciais ? `, ${iniciais}` : "") + sufixo;
  for (let n = sobrenome.length; n >= 1; n--) {
    const candidato = sobrenome.slice(0, n).join("") + fixo;
    if (cabe(candidato)) return candidato;
  }
  // Nem com 1 letra do sobrenome cabe: devolve o mínimo (o corte final é da célula, nunca some o nome).
  return sobrenome[0] + fixo;
}

/** Nome da enfermeira por extenso, cortado até caber (mínimo de 1 caractere). */
export function nomeEnfermeira(nome: string | null | undefined, cabe: CabeNoEspaco): string {
  const limpo = partesDoNome(nome).join(" ");
  if (!limpo) return "";
  const letras = Array.from(limpo);
  for (let n = letras.length; n >= 1; n--) {
    const candidato = letras.slice(0, n).join("").trimEnd();
    if (cabe(candidato)) return candidato;
  }
  return letras[0]!;
}

/** Como a confirmação do cliente aparece na coluna do cliente (estados em lib/visit-confirmation.ts). */
export type MarcaConfirmacaoCliente = "plena" | "cadastro" | "aguardando" | "nao_confirmada";

/**
 * O que o RAS FAP mostra de UMA visita (K9). A chave do mapa que carrega estes registros é o número da
 * visita na grade (o mesmo `numero` da linha); `aplicadas` segue a ordem das colunas de substâncias.
 */
export interface RegistroRasFap {
  /** "dd/mm/aaaa" no fuso de Brasília, da primeira aplicação registrada da visita. */
  dataEfetiva: string | null;
  /** "HH:MM" no fuso de Brasília. */
  hora: string | null;
  /** Nome por extenso de quem registrou a primeira aplicação. */
  enfermeira: string | null;
  clienteNome: string;
  confirmacaoCliente: MarcaConfirmacaoCliente | null;
  aplicadas: boolean[];
  /**
   * PNG da rubrica do cliente (só tinta, fundo transparente), quando o cadastro tem uma. É desenhado no lugar
   * das iniciais nas marcas "plena" e "cadastro"; sem imagem, a coluna mostra "Sobrenome, I.N.I." como sempre.
   */
  rubricaPng?: Buffer | null;
}

const MARCA_POR_ESTADO: Record<string, MarcaConfirmacaoCliente | undefined> = {
  rubrica_chave: "plena",
  confirmada_email: "plena",
  rubrica_desafio: "cadastro",
  pendente: "aguardando",
  nao_confirmada: "nao_confirmada",
};

/** sem_pedido, chave_enviada e estados desconhecidos deixam a coluna vazia. */
export function marcaDoEstado(estado: string | null | undefined): MarcaConfirmacaoCliente | null {
  return (estado ? MARCA_POR_ESTADO[estado] : undefined) ?? null;
}
