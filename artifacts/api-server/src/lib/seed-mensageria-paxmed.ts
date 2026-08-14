// SEED da MENSAGERIA PAXMED (Carta de Encantamento) — portado do IHE, NATIVO.
//
// Idempotente e NÃO-destrutivo: usa onConflictDoNothing em (categoria, chave), de
// modo que reexecutar no boot NÃO apaga as edições feitas pelo CEO na tela. É
// chamado no app.listen (como runSeedSiteContent). SEM process.exit e SEM guarda
// import.meta — este arquivo é importado pelo entry (esbuild empacota tudo).
import { db, mensagensCatalogoTable } from "@workspace/db";

type SeedLog = (msg: string) => void;
const noopLog: SeedLog = () => {};

interface BlocoSeed {
  categoria: string;
  chave: string;
  ordem: number;
  conteudo: Record<string, unknown>;
}

// ──────────────────────────── PERÍODOS (9) ────────────────────────────
const PERIODOS: BlocoSeed[] = [
  {
    categoria: "PERIODO",
    chave: "jejum",
    ordem: 1,
    conteudo: {
      label: "Jejum",
      emoji: "🌅",
      horario: "04h – 05h",
      saudacao: "Bom dia",
      abertura:
        "Neste jejum matinal, seu organismo está no momento de maior biodisponibilidade — é quando cada ativo é absorvido com eficiência máxima.",
      desejo:
        "Quero lembrá-lo das fórmulas em *jejum* — o primeiro passo de um dia de alta performance clínica:",
      pronome: "manhã",
      cor_primary: "#d4a574",
      cor_bg: "#1f1810",
      cor_accent: "#f0c794",
    },
  },
  {
    categoria: "PERIODO",
    chave: "inicioManha",
    ordem: 2,
    conteudo: {
      label: "Início da Manhã",
      emoji: "☀️",
      horario: "06h – 08h",
      saudacao: "Bom dia",
      abertura:
        "Neste despertar da manhã, seu café e as fórmulas certas vão em sintonia — o começo do dia define o ritmo dos próximos.",
      desejo:
        "Quero lembrá-lo das fórmulas do *início da manhã*, para que sua disposição e seu metabolismo comecem fortes:",
      pronome: "manhã",
      cor_primary: "#f5b947",
      cor_bg: "#1f1a0a",
      cor_accent: "#ffd179",
    },
  },
  {
    categoria: "PERIODO",
    chave: "meioManha",
    ordem: 3,
    conteudo: {
      label: "Meio da Manhã",
      emoji: "🌞",
      horario: "09h – 11h",
      saudacao: "Bom dia",
      abertura:
        "Neste meio de manhã, quando o metabolismo já está ativo e o organismo pede suporte, é hora de entregar ao corpo os nutrientes certos.",
      desejo:
        "Quero lembrá-lo das fórmulas do *meio da manhã*, para manter foco, energia e estabilidade até o almoço:",
      pronome: "manhã",
      cor_primary: "#f5d547",
      cor_bg: "#1f1d0a",
      cor_accent: "#ffe879",
    },
  },
  {
    categoria: "PERIODO",
    chave: "almoco",
    ordem: 4,
    conteudo: {
      label: "Almoço",
      emoji: "🍽️",
      horario: "12h – 13h",
      saudacao: "Boa tarde",
      abertura:
        "Neste momento do almoço, quando a refeição alimenta o corpo, as fórmulas somam — fecham a sinergia entre nutrição e protocolo.",
      desejo:
        "Quero lembrá-lo das fórmulas do *almoço*, para que absorção e digestão trabalhem juntas a seu favor:",
      pronome: "tarde",
      cor_primary: "#f57a47",
      cor_bg: "#1f1308",
      cor_accent: "#ff9a6b",
    },
  },
  {
    categoria: "PERIODO",
    chave: "inicioTarde",
    ordem: 5,
    conteudo: {
      label: "Início da Tarde",
      emoji: "🌤️",
      horario: "14h – 15h",
      saudacao: "Boa tarde",
      abertura:
        "Neste início de tarde, quando a digestão avança e a energia precisa se manter estável, as fórmulas deste horário são suporte essencial.",
      desejo:
        "Quero lembrá-lo das fórmulas do *início da tarde*, para sustentar seu rendimento no segundo turno do dia:",
      pronome: "tarde",
      cor_primary: "#e87a47",
      cor_bg: "#1e130a",
      cor_accent: "#ff9a68",
    },
  },
  {
    categoria: "PERIODO",
    chave: "meioTarde",
    ordem: 6,
    conteudo: {
      label: "Meio da Tarde",
      emoji: "⛅",
      horario: "15h – 16h",
      saudacao: "Boa tarde",
      abertura:
        "Neste meio de tarde, momento estratégico para manter clareza mental e estabilidade metabólica — o senhor sustenta o ritmo com as fórmulas certas.",
      desejo:
        "Quero lembrá-lo das fórmulas do *meio da tarde*, para que a energia vá firme até o final do expediente:",
      pronome: "tarde",
      cor_primary: "#d9663d",
      cor_bg: "#1d110a",
      cor_accent: "#f0855f",
    },
  },
  {
    categoria: "PERIODO",
    chave: "inicioNoite",
    ordem: 7,
    conteudo: {
      label: "Início da Noite",
      emoji: "🌆",
      horario: "18h – 19h",
      saudacao: "Boa noite",
      abertura:
        "Neste início de noite, quando o corpo desacelera e começa a preparar o descanso, as fórmulas deste horário auxiliam na transição metabólica.",
      desejo:
        "Quero lembrá-lo das fórmulas do *início da noite*, para uma transição suave e reparadora para o repouso:",
      pronome: "noite",
      cor_primary: "#7a6bd9",
      cor_bg: "#14121e",
      cor_accent: "#9d8ff0",
    },
  },
  {
    categoria: "PERIODO",
    chave: "finalNoite",
    ordem: 8,
    conteudo: {
      label: "Final da Noite",
      emoji: "🌙",
      horario: "21h – 22h",
      saudacao: "Boa noite",
      abertura:
        "Neste final de noite, momento precioso de preparação para o sono — quando o organismo entra em modo de reparação profunda.",
      desejo:
        "Quero lembrá-lo das fórmulas deste período, para uma noite de recuperação plena e sono restaurador:",
      pronome: "noite",
      cor_primary: "#6b5fb0",
      cor_bg: "#11101c",
      cor_accent: "#8d82d9",
    },
  },
  {
    categoria: "PERIODO",
    chave: "ceia",
    ordem: 9,
    conteudo: {
      label: "Ceia",
      emoji: "🌜",
      horario: "22h – 23h",
      saudacao: "Boa noite",
      abertura:
        "Nesta ceia do seu dia, última refeição antes do descanso reparador — o corpo se prepara para horas de regeneração silenciosa.",
      desejo:
        "Quero lembrá-lo das fórmulas da *ceia*, para que o sono seja aliado da sua recuperação:",
      pronome: "ceia",
      cor_primary: "#5b4e9b",
      cor_bg: "#0f0e1a",
      cor_accent: "#7d70bd",
    },
  },
];

// ──────────────────────────── DIAS DA SEMANA (7) ────────────────────────────
const DIAS_SEMANA: BlocoSeed[] = [
  {
    categoria: "DIA_SEMANA",
    chave: "segunda",
    ordem: 1,
    conteudo: {
      label: "Segunda-feira",
      tom: "Abertura de semana · motivacional",
      frase: "Comece a semana com o pé direito — e com as fórmulas no horário certo.",
    },
  },
  {
    categoria: "DIA_SEMANA",
    chave: "terca",
    ordem: 2,
    conteudo: {
      label: "Terça-feira",
      tom: "Foco & produtividade",
      frase:
        "Que sua terça-feira seja de alta performance — seu protocolo está desenhado para isso.",
    },
  },
  {
    categoria: "DIA_SEMANA",
    chave: "quarta",
    ordem: 3,
    conteudo: {
      label: "Quarta-feira",
      tom: "Metade da semana · consistência",
      frase: "No meio da semana, consistência é o que faz a diferença.",
    },
  },
  {
    categoria: "DIA_SEMANA",
    chave: "quinta",
    ordem: 4,
    conteudo: {
      label: "Quinta-feira",
      tom: "Performance & rotina",
      frase:
        "Quinta-feira é dia de manter firme — falta pouco para fechar mais uma semana de conquistas.",
    },
  },
  {
    categoria: "DIA_SEMANA",
    chave: "sexta",
    ordem: 5,
    conteudo: {
      label: "Sexta-feira",
      tom: "Desaceleração inteligente",
      frase: "Encerre a semana bem — desacelerar também faz parte do cuidado.",
    },
  },
  {
    categoria: "DIA_SEMANA",
    chave: "sabado",
    ordem: 6,
    conteudo: {
      label: "Sábado",
      tom: "🌿 Adventista · descanso sagrado",
      frase:
        "Que este sábado santo traga descanso verdadeiro — corpo, mente e espírito em paz.",
    },
  },
  {
    categoria: "DIA_SEMANA",
    chave: "domingo",
    ordem: 7,
    conteudo: {
      label: "Domingo",
      tom: "Preparação para a semana",
      frase: "Um domingo bem cuidado é meia semana ganha.",
    },
  },
];

// ──────────────────────────── SEMANA DO MÊS (4) ────────────────────────────
const SEMANAS_MES: BlocoSeed[] = [
  { categoria: "SEMANA_MES", chave: "1", ordem: 1, conteudo: { frase: "primeira semana do mês — o começo de um novo ciclo" } },
  { categoria: "SEMANA_MES", chave: "2", ordem: 2, conteudo: { frase: "segunda semana do mês — o ritmo já está construído" } },
  { categoria: "SEMANA_MES", chave: "3", ordem: 3, conteudo: { frase: "terceira semana — já na segunda metade do mês" } },
  { categoria: "SEMANA_MES", chave: "4", ordem: 4, conteudo: { frase: "última semana do mês — reta final de mais um ciclo bem conduzido" } },
];

// ──────────────────────────── ELOGIO POR SEMANA (4) ────────────────────────────
const ELOGIOS: BlocoSeed[] = [
  { categoria: "ELOGIO_SEMANA", chave: "1", ordem: 1, conteudo: { texto: "Começar a semana com disciplina é o que diferencia quem evolui de quem só sobrevive." } },
  { categoria: "ELOGIO_SEMANA", chave: "2", ordem: 2, conteudo: { texto: "Duas semanas de constância já mostram o caminho — o corpo sente, o espelho mostra." } },
  { categoria: "ELOGIO_SEMANA", chave: "3", ordem: 3, conteudo: { texto: "Passar da metade do mês com adesão assim é feito para poucos." } },
  { categoria: "ELOGIO_SEMANA", chave: "4", ordem: 4, conteudo: { texto: "Fechar o mês inteiro com disciplina é motivo de orgulho — e o Dr. Caio percebe." } },
];

// ──────────────────────────── VERSÍCULOS DE SÁBADO (4) ────────────────────────────
const VERSICULOS: BlocoSeed[] = [
  { categoria: "VERSICULO_SABADO", chave: "1", ordem: 1, conteudo: { texto: '_"O Senhor te abençoará e te guardará; o Senhor fará resplandecer o Seu rosto sobre ti e te concederá graça."_\n_(Números 6:24-25)_' } },
  { categoria: "VERSICULO_SABADO", chave: "2", ordem: 2, conteudo: { texto: '_"Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos aliviarei."_\n_(Mateus 11:28)_' } },
  { categoria: "VERSICULO_SABADO", chave: "3", ordem: 3, conteudo: { texto: '_"Porque sou eu que conheço os planos que tenho para vocês — planos de fazê-los prosperar, de dar esperança e um futuro."_\n_(Jeremias 29:11)_' } },
  { categoria: "VERSICULO_SABADO", chave: "4", ordem: 4, conteudo: { texto: '_"Deleita-te no Senhor, e Ele atenderá aos desejos do teu coração."_\n_(Salmos 37:4)_' } },
];

// ──────────────────────────── FALAS DR. CAIO (4) ────────────────────────────
const FALAS: BlocoSeed[] = [
  {
    categoria: "DR_CAIO_FALA",
    chave: "absorcao_idade",
    ordem: 1,
    conteudo: {
      label: "Absorção & Idade",
      texto:
        "💬 *O Dr. Caio sempre reforça:* a gente não é o que come — a gente é o que *absorve*.\n\nCom o passar dos anos, o intestino perde eficiência, o estômago reduz a acidez e a absorção de nutrientes cai drasticamente. É por isso que a suplementação personalizada, nas doses certas e nos horários certos, é o que separa quem envelhece doente de quem envelhece bem.\n\nNa medicina convencional, só se trata o sintoma. Na medicina integrativa, a gente cuida da raiz — e o senhor já entendeu isso. Continue firme.",
    },
  },
  {
    categoria: "DR_CAIO_FALA",
    chave: "equilibrio_cura",
    ordem: 2,
    conteudo: {
      label: "Equilíbrio & Cura",
      texto:
        "💬 *O Dr. Caio sempre diz:* o corpo não adoece porque quer — ele adoece quando falta equilíbrio. E cura quando o equilíbrio volta.\n\nA medicina convencional espera o sintoma aparecer para agir. A medicina integrativa age todo dia para o sintoma *não aparecer*. Essa é a diferença.\n\nOs suplementos do seu protocolo não são opção — são estrutura. Cada fórmula no horário certo é um tijolo na casa da sua saúde.",
    },
  },
  {
    categoria: "DR_CAIO_FALA",
    chave: "constancia_protocolo",
    ordem: 3,
    conteudo: {
      label: "Constância & Protocolo",
      texto:
        "💬 *O Dr. Caio costuma dizer:* o melhor remédio da medicina integrativa é *constância + equilíbrio nutricional*.\n\nEnquanto a medicina convencional trata doença, a gente cultiva saúde. E saúde não se compra numa consulta — se constrói todo dia, dose por dose, horário por horário.\n\nO senhor vem cumprindo isso com disciplina. E disciplina, no nosso protocolo, é terapêutica.",
    },
  },
  {
    categoria: "DR_CAIO_FALA",
    chave: "longevidade_prevencao",
    ordem: 4,
    conteudo: {
      label: "Longevidade & Prevenção",
      texto:
        "💬 *O Dr. Caio sempre reforça:* envelhecer bem não é sorte — é projeto.\n\nNa medicina convencional, o paciente espera a doença para ir ao médico. Na medicina integrativa, o paciente cuida do corpo para nunca precisar. O senhor faz parte do segundo grupo — e é por isso que sua evolução tem sido diferente.\n\nCada dose respeitada hoje é um ano a mais de qualidade lá na frente.",
    },
  },
];

// ──────────────────────────── STATUS DR. CAIO (5) ────────────────────────────
const STATUS: BlocoSeed[] = [
  { categoria: "DR_CAIO_STATUS", chave: "op1", ordem: 1, conteudo: { texto: "O Dr. Caio está contente com sua evolução e acompanha cada passo do seu progresso." } },
  { categoria: "DR_CAIO_STATUS", chave: "op2", ordem: 2, conteudo: { texto: "O Dr. Caio recebeu seus últimos relatórios com muita satisfação." } },
  { categoria: "DR_CAIO_STATUS", chave: "op3", ordem: 3, conteudo: { texto: "O Dr. Caio valoriza muito a sua constância e acompanha seus resultados de perto." } },
  { categoria: "DR_CAIO_STATUS", chave: "op4", ordem: 4, conteudo: { texto: "O Dr. Caio permanece muito satisfeito com a evolução do seu tratamento." } },
  { categoria: "DR_CAIO_STATUS", chave: "op5", ordem: 5, conteudo: { texto: "" } },
];

// ──────────────────────────── OBSERVAÇÃO DE DOSE (1) ────────────────────────────
const OBS_DOSE: BlocoSeed[] = [
  {
    categoria: "OBS_DOSE",
    chave: "padrao",
    ordem: 1,
    conteudo: {
      texto:
        "⚠️ *Importante:* *dose* não é sempre igual a *1 cápsula*. Algumas fórmulas têm 2, 3 ou mais cápsulas por dose.\n\n🔎 *Confira sempre o rótulo* antes de tomar — ali está a quantidade certa.",
    },
  },
];

// ──────────────────────────── ASSINATURA (1) — marca PAXTER ────────────────────────────
const ASSINATURA: BlocoSeed[] = [
  {
    categoria: "ASSINATURA",
    chave: "paxter",
    ordem: 1,
    conteudo: {
      saudacao_fechamento: "Com atenção clínica,",
      nome: "Equipe Padcon Conect",
      papel: "Assistência ao Protocolo",
      rodape_linha1: "PAXTER®",
      rodape_subtitulo1: "Motor Clínico · Protocolos Injetáveis",
      rodape_linha2: "Padcon Conect®",
      rodape_subtitulo2: "Cuidado que acompanha cada dose",
    },
  },
];

const TODOS: BlocoSeed[] = [
  ...PERIODOS,
  ...DIAS_SEMANA,
  ...SEMANAS_MES,
  ...ELOGIOS,
  ...VERSICULOS,
  ...FALAS,
  ...STATUS,
  ...OBS_DOSE,
  ...ASSINATURA,
];

// Semeia o catálogo sem apagar edições existentes. onConflictDoNothing na chave
// composta (categoria, chave): blocos novos entram; blocos já editados ficam
// intactos. Retorna quantos blocos foram efetivamente inseridos.
export async function runSeedMensageriaPaxmed(log: SeedLog = noopLog): Promise<number> {
  let inseridos = 0;
  for (const bloco of TODOS) {
    const linhas = await db
      .insert(mensagensCatalogoTable)
      .values({
        categoria: bloco.categoria,
        chave: bloco.chave,
        ordem: bloco.ordem,
        conteudo: bloco.conteudo,
      })
      .onConflictDoNothing({
        target: [mensagensCatalogoTable.categoria, mensagensCatalogoTable.chave],
      })
      .returning({ id: mensagensCatalogoTable.id });
    if (linhas.length > 0) inseridos += 1;
  }
  log(`Mensageria PAXMED: ${inseridos} bloco(s) semeado(s) (${TODOS.length} no catálogo).`);
  return inseridos;
}
