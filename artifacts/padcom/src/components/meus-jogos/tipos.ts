// Tipos e utilitarios de Meus Jogos (portal do cliente). Preco e regra vem SEMPRE do catalogo do servidor.
export type Modalidade = "megasena" | "lotofacil" | "quina" | "lotomania";

export type MotivoIndisponivel = "execucao_indisponivel" | "regras_desatualizadas" | "concurso_desconhecido" | "fechamento_nao_informado" | "fora_do_prazo";
export type Disponibilidade = {
  modalidade: Modalidade; aberto: boolean; motivo: MotivoIndisponivel | null; mensagem: string | null;
  concurso: { numero: number; data: string } | null;
  prazos: { fechamentoOficialEm: string; limiteInternoEm: string } | null;
  fonte: { desatualizado: boolean; motivo: string | null; verificadoEm: string };
};
export type ModalidadeCatalogo = {
  chave: Modalidade; nome: string; dezenaMin: number; dezenaMax: number; dezenasMin: number; dezenasMax: number;
  precos: { quantidade: number; precoCentavos: number }[]; sorteios: string; fonteUrl: string; disponibilidade: Disponibilidade;
};
export type Catalogo = {
  membro: boolean; execucao: { disponivel: boolean; motivo: string };
  tetoPedidoCentavos: number; margemMinutos: number; metaMinutos: number; modalidades: ModalidadeCatalogo[];
};

export type PassoLinha = { chave: string; rotulo: string; estado: "feito" | "atual" | "pendente" | "falhou" | "em_conferencia" };
export type PedidoVisto = {
  id: number; modalidade: Modalidade; nome: string; concurso: number; dataSorteio: string; totalCentavos: number;
  status: string; rotulo: string; jogos: { ordem: number; dezenas: number[]; precoCentavos: number }[]; linhaDoTempo: PassoLinha[];
  prazos: { fechamentoOficialEm: string; limiteInternoEm: string; metaEfetivacaoEm: string | null };
  pagoEm: string | null; criadoEm: string; invoiceUrl: string | null;
  comprovante: { id: number; mime: string; bytes: number; codigo: string; criadoEm: string } | null;
  falha: { texto: string } | null; atrasadoNaMeta: boolean; podePagar: boolean; podeCancelar: boolean;
};
export type Favorito = { id: number; modalidade: Modalidade; dezenas: number[]; apelido: string | null; criadoEm: string };
export type ResultadosModalidade = {
  modalidade: Modalidade; nome: string; estado: "ok" | "desatualizado" | "indisponivel";
  atualizadoEm: string | null; ultimaTentativaEm: string | null; erro: string | null; fonte: string;
  itens: { concurso: number; data: string; dezenas: number[] }[];
};

export const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dz = (n: number) => String(n).padStart(2, "0");
export const brData = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
export const brDataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Escolha aleatoria sem vies (amostragem por rejeicao sobre bytes criptograficos). Sem Math.random. */
export function sortearDezenas(min: number, max: number, quantidade: number): number[] {
  const universo = max - min + 1;
  const escolhidas = new Set<number>();
  const limite = Math.floor(256 / universo) * universo; // universo <= 100: rejeita bytes que causariam vies
  const buf = new Uint8Array(64);
  while (escolhidas.size < quantidade) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= limite) continue;
      escolhidas.add(min + (b % universo));
      if (escolhidas.size === quantidade) break;
    }
  }
  return [...escolhidas].sort((a, b) => a - b);
}

export function novaChave(): string {
  const u = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, "0")).join("");
  return `mj-${u.replace(/-/g, "")}`.slice(0, 64);
}
