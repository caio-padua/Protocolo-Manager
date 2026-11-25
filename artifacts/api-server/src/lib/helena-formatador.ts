/**
 * Formatador visual da Helena: última etapa antes de QUALQUER mensagem ao paciente (WhatsApp e Telegram).
 * Regras aprovadas pelo Dr. Caio:
 *  - blocos de no máximo 3 linhas, separados por uma linha em branco;
 *  - sequências viram lista, um item por linha, com marcador (•);
 *  - toda mensagem termina com a assinatura da Helena (frase "assinatura" do banco).
 * É idempotente: formatar duas vezes dá o mesmo resultado. Não altera o sentido, só a forma.
 */
export const MARCA_ASSINATURA = "Encontro-me à sua inteira disposição";
export const MAX_LINHAS_BLOCO = 3;
const LIMITE_CARACTERES_LINHA = 90;

const ehItem = (l: string) => /^\s*[•—-]\s+/.test(l);

/** Quebra um parágrafo corrido em frases agrupadas em blocos de até 2 frases / 3 linhas visuais. */
function dividirParagrafo(p: string): string[] {
  const linhas = p.split("\n").map((l) => l.trim()).filter(Boolean);
  const visuaisDe = (ls: string[]) => ls.reduce((s, f) => s + Math.max(1, Math.ceil(f.length / LIMITE_CARACTERES_LINHA)), 0);
  // Já cabe em até 3 linhas: não mexe.
  if (linhas.length <= MAX_LINHAS_BLOCO && visuaisDe(linhas) <= MAX_LINHAS_BLOCO) return [linhas.join("\n")];
  const blocos: string[] = [];
  for (const linha of linhas.length ? [linhas.join("\n")] : []) {
    const frases = linha.split(/(?<!\b(?:Dr|Dra|Sr|Sra|Prof|Profa|nº)\.)(?<=[.!?:])\s+(?=\S)/).flatMap((f) => f.split("\n"));
    let atual: string[] = [];
    const visuais = (arr: string[]) => arr.reduce((s, f) => s + Math.max(1, Math.ceil(f.length / LIMITE_CARACTERES_LINHA)), 0);
    for (const f of frases) {
      if (atual.length && visuais([...atual, f]) > MAX_LINHAS_BLOCO) { blocos.push(atual.join(" ")); atual = []; }
      atual.push(f);
    }
    if (atual.length) blocos.push(atual.join(" "));
  }
  return blocos;
}

export function formatarCorpoHelena(texto: string): string {
  // Marcadores colados no meio da linha ("...trajetória:• A • B") viram itens em linhas próprias.
  const base = texto.replace(/\r/g, "").replace(/([^\n\s])\s*•\s*/g, "$1\n• ").replace(/\n{3,}/g, "\n\n").trim();
  const saida: string[] = [];
  for (const par of base.split(/\n\s*\n/)) {
    const linhas = par.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) continue;
    // Separa o texto que antecede a lista dos itens, preservando a lista unida.
    let corrido: string[] = []; let itens: string[] = [];
    const descarregarCorrido = () => { if (corrido.length) saida.push(...dividirParagrafo(corrido.join("\n"))); corrido = []; };
    const descarregarItens = () => { if (itens.length) saida.push(itens.join("\n")); itens = []; };
    for (const l of linhas) {
      if (ehItem(l)) { descarregarCorrido(); itens.push(l.replace(/^[-]\s+/, "• ")); }
      else { descarregarItens(); corrido.push(l); }
    }
    descarregarCorrido(); descarregarItens();
  }
  return saida.join("\n\n");
}

/** Texto final ao paciente: corpo formatado + assinatura da Helena (sem duplicar). */
export function formatarSaidaHelena(texto: string, assinatura: string): string {
  const t = (texto ?? "").trim();
  if (!t) return t;
  const ass = assinatura.trim();
  const primeira = ass.split("\n")[0];
  const pos = primeira ? t.indexOf(primeira) : -1;
  const corpo = formatarCorpoHelena(pos >= 0 ? t.slice(0, pos) : t);
  return corpo ? `${corpo}\n\n${ass}` : ass;
}

/** Assinatura vigente (tabela de frases). Erro de leitura derruba o envio: nunca sai mensagem sem assinatura. */
export async function formatarSaidaHelenaDoBanco(texto: string): Promise<string> {
  const { carregarFrases } = await import("./telegram-frases");
  const F = await carregarFrases();
  return formatarSaidaHelena(texto, F("assinatura", { clinica: "" }));
}
