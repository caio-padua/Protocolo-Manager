// Grupo VIP (Área do Cliente): conteúdo configurável e tipado.
// Regra do Dr. Caio (14/11/2026): o Grupo VIP é um programa POR CONVITE, de aceite voluntário, e NÃO tem relação
// com a categoria comercial (Prata, Ouro, Platinum, Diamond), que vive na aba MINHA CATEGORIA.
// Nenhum benefício concreto é afirmado até o administrador definir e aprovar: enquanto `itens` estiver vazio,
// a área aparece como "Em configuração". Sem preço, desconto, prioridade, brinde ou promessa de serviço.

export type BeneficioAprovado = { titulo: string; descricao: string };

export type AreaBeneficio = {
  chave: "conteudos" | "experiencias" | "relacionamento";
  titulo: string;
  descricao: string;
  /** Só entra aqui o que o administrador aprovou. Vazio = "Em configuração". */
  itens: readonly BeneficioAprovado[];
};

export const CLUB_VIP_TITULO = "GRUPO VIP";
export const CLUB_VIP_SUBTITULO = "Um programa por convite do Instituto Pádua";

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
  "Os benefícios do Grupo VIP ainda estão em configuração e serão exibidos aqui somente depois de definidos e aprovados pelo Instituto.";

export const CLUB_VIP_COMO_FUNCIONA = {
  titulo: "Como funciona",
  texto:
    "O Grupo VIP é um programa por convite. Você participa somente se for convidado e aceitar, por livre e espontânea vontade. Ele não depende da sua categoria nem de consultas, tratamentos, mensalidades ou descontos.",
} as const;

export const CONVITES_ESPECIAIS_TITULO = "CONVITES ESPECIAIS";
export const CONVITES_ESPECIAIS_DESCRICAO = "Convites opcionais feitos pelo Instituto. Você escolhe se quer conhecer.";

/** Experiência recreativa de bolões. Nome aprovado pelo Dr. Caio em 14/11/2026. */
export const CONEXAO_MILIONARIA = {
  titulo: "CONEXÃO MILIONÁRIA",
  chamada: "Confraternização entre amigos",
  narrativa:
    "Em algumas ocasiões, o Dr. Caio e pessoas próximas organizam participações voluntárias em bolões oficiais das Loterias CAIXA, como uma atividade recreativa entre adultos. Se tiver interesse, consulte as informações e regras da participação.",
  independencia:
    "Este convite é facultativo e está separado dos serviços médicos, da sua categoria, de tratamentos, mensalidades e descontos. Não participar não altera o seu atendimento nem o seu relacionamento com a clínica.",
  aviso:
    "Esta tela apenas leva à consulta das participações registradas pela clínica: não emite bilhete, não faz aposta e não cobra. A disponibilidade e as regras dependem da modalidade oficial e dos comprovantes emitidos pelos canais autorizados.",
  cta: "Consultar Meus Bolões",
} as const;
