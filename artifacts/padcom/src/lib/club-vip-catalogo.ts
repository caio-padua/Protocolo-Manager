// Club VIP (Área do Cliente): conteúdo configurável e tipado.
// Regra do Dr. Caio (14/11/2026): nenhum benefício concreto é afirmado até o administrador definir e aprovar.
// Enquanto `itens` estiver vazio, a área aparece como "Em configuração". Sem preço, desconto, prioridade,
// brinde, comparativo de upgrade ou promessa de serviço. Nomes e cores dos níveis vivem em nivel-cliente.ts.

export type BeneficioAprovado = { titulo: string; descricao: string };

export type AreaBeneficio = {
  chave: "conteudos" | "experiencias" | "relacionamento";
  titulo: string;
  descricao: string;
  /** Só entra aqui o que o administrador aprovou. Vazio = "Em configuração". */
  itens: readonly BeneficioAprovado[];
};

export const CLUB_VIP_TITULO = "CLUB VIP";
export const CLUB_VIP_SUBTITULO = "Um espaço de relacionamento, experiências e benefícios do Instituto Pádua";

export const AREAS_BENEFICIO: readonly AreaBeneficio[] = [
  {
    chave: "conteudos",
    titulo: "Conteúdos e orientações",
    descricao: "Materiais de apoio e orientações do Instituto para o seu dia a dia.",
    itens: [],
  },
  {
    chave: "experiencias",
    titulo: "Experiências e encontros",
    descricao: "Momentos de convivência e eventos organizados pelo Instituto.",
    itens: [],
  },
  {
    chave: "relacionamento",
    titulo: "Relacionamento e atendimento",
    descricao: "Formas de se comunicar e ser acompanhado pela equipe.",
    itens: [],
  },
];

export const BENEFICIOS_NOTA =
  "Os benefícios concretos de cada nível ainda estão em configuração e serão exibidos aqui somente depois de definidos e aprovados pelo Instituto.";

export const CONVITE_BOLOES = {
  titulo: "Confraternização entre amigos",
  narrativa:
    "Em algumas ocasiões, o Dr. Caio e pessoas próximas organizam participações voluntárias em bolões oficiais das Loterias CAIXA, como uma atividade recreativa entre adultos. Se tiver interesse, consulte as informações e regras da participação.",
  independencia:
    "A participação é facultativa e independe de consultas, tratamentos, protocolos, mensalidades, planos, descontos ou qualquer benefício clínico. Não participar não altera o seu atendimento nem o seu relacionamento com a clínica.",
  aviso:
    "A disponibilidade e as regras dependem da modalidade oficial e dos comprovantes emitidos pelos canais autorizados.",
  cta: "Conhecer os bolões",
} as const;
