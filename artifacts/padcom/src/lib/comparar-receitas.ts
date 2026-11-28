/**
 * Comparação de receitas lado a lado.
 * Cada fórmula é identificada pelo NOME; dentro dela, cada ativo é identificado pelo nome do ativo.
 * Mostra o que mudou (dose, ativo que entrou ou saiu, posologia) e o que só existe em algumas receitas.
 */
export type FormulaDaReceita = { name: string; ativos: string | null; posologia: string | null };
export type ReceitaParaComparar = { id: number; rotulo: string; formulas: FormulaDaReceita[] };

export type Ativo = { nome: string; dose: string | null };

export type StatusAtivo = "igual" | "dose_diferente" | "ausente_em_algumas";
export type LinhaAtivo = {
  nome: string;
  /** Uma posição por receita comparada: texto da dose, "" se o ativo não tem dose, undefined se o ativo não existe ali. */
  doses: Array<string | undefined>;
  status: StatusAtivo;
};

export type StatusFormula = "igual" | "alterada" | "so_em_algumas";
export type LinhaFormula = {
  nome: string;
  presente: boolean[];
  status: StatusFormula;
  ativos: LinhaAtivo[];
  posologias: Array<string | null>;
  posologiaDiferente: boolean;
};

export type ResultadoComparacao = {
  formulas: LinhaFormula[];
  resumo: { iguais: number; alteradas: number; soEmAlgumas: number };
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const chaveTexto = (t: string) => semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();

const UNIDADES = "mg|mcg|µg|ug|g|ui|iu|ml|%|fcc|fip|du|hut|ufc|bilh(?:ões|oes)?|gotas?";
const RE_DOSE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES})(?![\\p{L}])`, "iu");

/** "200mg" e "200 MG" são a mesma dose. */
export function normalizarDose(numero: string, unidade: string): string {
  return `${numero.replace(".", ",")} ${unidade.toLowerCase()}`;
}

/** Lê um ativo por linha: "Ácido alfa lipoico 200 mg - função" → { nome, dose }. */
export function lerAtivos(texto: string | null | undefined): Ativo[] {
  if (!texto) return [];
  const saida: Ativo[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const m = RE_DOSE.exec(linha);
    let nome: string;
    let dose: string | null = null;
    if (m && m.index > 0) {
      nome = linha.slice(0, m.index);
      dose = normalizarDose(m[1], m[2]);
    } else {
      nome = linha.split(/\s[-–—]\s/)[0];
    }
    nome = nome.replace(/[\s\-–—:,;]+$/g, "").trim();
    if (nome) saida.push({ nome, dose });
  }
  return saida;
}

function indexarAtivos(texto: string | null): Map<string, Ativo> {
  const mapa = new Map<string, Ativo>();
  for (const a of lerAtivos(texto)) if (!mapa.has(chaveTexto(a.nome))) mapa.set(chaveTexto(a.nome), a);
  return mapa;
}

export function compararReceitas(receitas: ReceitaParaComparar[]): ResultadoComparacao {
  const ordem: string[] = [];
  const nomes = new Map<string, string>();
  const porReceita = receitas.map((r) => {
    const m = new Map<string, FormulaDaReceita>();
    for (const f of r.formulas) {
      const k = chaveTexto(f.name);
      if (!k) continue;
      if (!m.has(k)) m.set(k, f);
      if (!nomes.has(k)) { nomes.set(k, f.name.trim()); ordem.push(k); }
    }
    return m;
  });

  const formulas: LinhaFormula[] = ordem.map((k) => {
    const presentes = porReceita.map((m) => m.get(k));
    const presente = presentes.map((f) => Boolean(f));
    const ativosPorReceita = presentes.map((f) => (f ? indexarAtivos(f.ativos) : null));

    const chavesAtivos: string[] = [];
    const nomesAtivos = new Map<string, string>();
    for (const idx of ativosPorReceita) {
      if (!idx) continue;
      for (const [ka, a] of idx) if (!nomesAtivos.has(ka)) { nomesAtivos.set(ka, a.nome); chavesAtivos.push(ka); }
    }
    const ativos: LinhaAtivo[] = chavesAtivos.map((ka) => {
      const doses = ativosPorReceita.map((idx) => {
        const a = idx?.get(ka);
        return a ? (a.dose ?? "") : undefined;
      });
      const existentes = doses.filter((d) => d !== undefined);
      const status: StatusAtivo = existentes.length < presente.filter(Boolean).length
        ? "ausente_em_algumas"
        : new Set(existentes).size > 1 ? "dose_diferente" : "igual";
      return { nome: nomesAtivos.get(ka)!, doses, status };
    });

    const posologias = presentes.map((f) => (f ? (f.posologia ?? "").trim() || null : null));
    const posUsadas = posologias.filter((_, i) => presente[i]).map((p) => (p ? chaveTexto(p) : ""));
    const posologiaDiferente = new Set(posUsadas).size > 1;

    const todas = presente.every(Boolean);
    const status: StatusFormula = !todas
      ? "so_em_algumas"
      : posologiaDiferente || ativos.some((a) => a.status !== "igual") ? "alterada" : "igual";
    return { nome: nomes.get(k)!, presente, status, ativos, posologias, posologiaDiferente };
  });

  return {
    formulas,
    resumo: {
      iguais: formulas.filter((f) => f.status === "igual").length,
      alteradas: formulas.filter((f) => f.status === "alterada").length,
      soEmAlgumas: formulas.filter((f) => f.status === "so_em_algumas").length,
    },
  };
}

/** Uma linha de texto por ativo, na mesma ordem de lerAtivos, para reaproveitar o texto original ao levar o ativo para edição. */
export function lerLinhasAtivos(texto: string | null | undefined): Array<{ nome: string; linha: string }> {
  if (!texto) return [];
  const saida: Array<{ nome: string; linha: string }> = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const a = lerAtivos(linha)[0];
    if (a) saida.push({ nome: a.nome, linha });
  }
  return saida;
}
