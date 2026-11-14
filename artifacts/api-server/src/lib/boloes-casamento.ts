import { z } from "zod/v4";

/**
 * Conferencia e casamento DETERMINISTICOS de recibos de bolao.
 * A IA so le o arquivo; quem decide se um recibo combina com uma participacao e este codigo.
 * Regra de ouro: na duvida, fila de revisao humana. Nunca escolher entre duas candidatas.
 */

const texto = z.string().trim().max(200).nullish().transform((v) => (v && v.length > 0 ? v : null));
const numero = z.number().finite().nullish().transform((v) => v ?? null);

export const ReciboLidoSchema = z.object({
  /** Dica visual (NAO e prova de autenticidade): o documento se apresenta como recibo de loteria da CAIXA. */
  pareceReciboCaixa: z.boolean().catch(false),
  concurso: texto,
  dataSorteio: texto,
  codigoRecibo: texto,
  cotas: z.number().int().min(1).max(100000).nullish().transform((v) => v ?? null),
  valor: numero,
  nomeImpresso: texto,
  emissor: texto,
  confianca: z.number().min(0).max(1).catch(0),
});
export type ReciboLido = z.infer<typeof ReciboLidoSchema>;

export type MotivoCodigo =
  | "leitura_falhou"
  | "nao_parece_recibo_caixa"
  | "dados_insuficientes"
  | "sem_candidata"
  | "varias_candidatas"
  | "codigo_repetido"
  | "confianca_baixa"
  | "revogado";

export const MOTIVO_TEXTO: Record<MotivoCodigo, string> = {
  leitura_falhou: "A leitura automática falhou. Confira o arquivo manualmente.",
  nao_parece_recibo_caixa: "O arquivo não se apresenta como recibo da CAIXA.",
  dados_insuficientes: "Não foi possível ler o concurso ou a data do sorteio.",
  sem_candidata: "Nenhuma participação aberta combina com este recibo.",
  varias_candidatas: "Mais de uma participação combina com este recibo. Escolha a correta.",
  codigo_repetido: "Já existe outro recibo com o mesmo código.",
  confianca_baixa: "A leitura teve baixa confiança.",
  revogado: "O comprovante anterior foi revogado e o arquivo voltou para a fila.",
};

export interface Candidato {
  participacaoId: number;
  clienteNome: string;
  cotas: number;
  concurso: string | null;
  dataSorteio: string | null; // AAAA-MM-DD
  campanhaNome: string;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function normalizarConcurso(s: string | null): string | null {
  if (!s) return null;
  const digitos = s.replace(/\D/g, "");
  if (digitos) return digitos.replace(/^0+(?=\d)/, "");
  const alnum = semAcento(s).replace(/[^a-z0-9]/g, "");
  return alnum || null;
}

export function normalizarData(s: string | null): string | null {
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s.trim());
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

const LIGACOES = new Set(["de", "da", "do", "dos", "das", "e"]);
const tokens = (s: string) => semAcento(s).split(/[^a-z]+/).filter((t) => t.length >= 2 && !LIGACOES.has(t));

/** Todos os nomes lidos precisam existir no nome do cliente (ou o contrario). Nome ausente nao exclui. */
export function nomeCompativel(impresso: string | null, cliente: string): boolean {
  if (!impresso) return true;
  const a = tokens(impresso);
  const b = tokens(cliente);
  if (a.length === 0 || b.length === 0) return false;
  const [menor, maior] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  return menor.every((t) => maior.has(t));
}

export interface ResultadoCasamento {
  candidatas: number[];
  sugerida: number | null;
  motivos: MotivoCodigo[];
}

export function casarRecibo(lido: ReciboLido, candidatos: Candidato[]): ResultadoCasamento {
  const motivos: MotivoCodigo[] = [];
  const concurso = normalizarConcurso(lido.concurso);
  const data = normalizarData(lido.dataSorteio);
  if (!concurso && !data) {
    return { candidatas: [], sugerida: null, motivos: ["dados_insuficientes"] };
  }
  const candidatas = candidatos.filter((c) => {
    if (concurso) {
      // Campanha sem concurso cadastrado nao pode ser confirmada por concurso: fica de fora.
      if (normalizarConcurso(c.concurso) !== concurso) return false;
    }
    if (data && c.dataSorteio && normalizarData(c.dataSorteio) !== data) return false;
    if (data && !concurso && !c.dataSorteio) return false;
    if (lido.cotas !== null && lido.cotas !== c.cotas) return false;
    if (!nomeCompativel(lido.nomeImpresso, c.clienteNome)) return false;
    return true;
  }).map((c) => c.participacaoId);
  if (candidatas.length === 1) return { candidatas, sugerida: candidatas[0], motivos };
  motivos.push(candidatas.length === 0 ? "sem_candidata" : "varias_candidatas");
  return { candidatas, sugerida: null, motivos };
}

export const CONFIANCA_MINIMA_AUTO = 0.9;

/** Todas as condicoes juntas; qualquer falha devolve o motivo e o recibo vai para revisao humana. */
export function podeAprovarAutomaticamente(
  lido: ReciboLido,
  casamento: ResultadoCasamento,
  codigoRepetido: boolean,
): { ok: boolean; motivos: MotivoCodigo[] } {
  const motivos: MotivoCodigo[] = [];
  if (!lido.pareceReciboCaixa) motivos.push("nao_parece_recibo_caixa");
  if (lido.confianca < CONFIANCA_MINIMA_AUTO) motivos.push("confianca_baixa");
  if (!lido.concurso || !lido.dataSorteio || !lido.codigoRecibo) motivos.push("dados_insuficientes");
  if (casamento.sugerida === null) motivos.push(...casamento.motivos);
  if (codigoRepetido) motivos.push("codigo_repetido");
  const unicos = [...new Set(motivos)];
  return { ok: unicos.length === 0, motivos: unicos };
}
