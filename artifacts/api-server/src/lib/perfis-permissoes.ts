/**
 * Mapa dos seis perfis para a Cabine de Comando. Os TEXTOS são editoriais (responsabilidades,
 * exemplos, analogias); o que cada perfil pode fazer é CALCULADO pela regra real do servidor
 * (lib/papeis-acesso.ts), nunca digitado aqui. Assim o organograma não diverge do código.
 */
import { REGRAS, decidirAcesso, type PapeisClinica } from "./papeis-acesso.js";

const vazio: PapeisClinica = { admin: false, doctor: false, nurse: false, reception: false, finance: false };

export interface PerfilMapa {
  id: string;
  ordem: number;
  nome: string;
  quem: string;
  papeis: PapeisClinica;
  responsabilidades: string[];
  limites: string[];
  exemplo: string;
  analogia: string;
  /** Resultado REAL calculado pela regra do servidor, por domínio. */
  dominios: { dominio: string; ler: boolean; escrever: boolean }[];
}

const base: Omit<PerfilMapa, "dominios">[] = [
  {
    id: "admin-nao-medico", ordem: 1, nome: "Administrador não médico", quem: "Empresário / proprietário da clínica",
    papeis: { ...vazio, admin: true },
    responsabilidades: ["Financeiro, notas fiscais e valores da clínica", "Gestão de equipe e fornecedores", "Metas e contratos"],
    limites: ["Não emite nem assina prescrição", "Prontuário bloqueado por sigilo (decisão pendente do CEO)"],
    exemplo: "O dono da clínica confere o caixa do mês e cadastra uma nova recepcionista, mas não consegue abrir uma receita.",
    analogia: "Dono do prédio: tem a chave da administração, não a do consultório.",
  },
  {
    id: "medico-admin", ordem: 2, nome: "Médico + administrador", quem: "Ex.: Dr. Caio no Instituto Pádua, Dr. Kleber no Instituto Lemos",
    papeis: { ...vazio, admin: true, doctor: true },
    responsabilidades: ["Tudo do administrador na própria clínica", "Cockpit, prontuário e prescrição"],
    limites: ["Poder vale só na clínica em que tem os dois papéis", "Em outra clínica vale apenas o papel que tiver lá"],
    exemplo: "O Dr. Kleber prescreve e vê o financeiro no Instituto Lemos; no Instituto Pádua só atua como médico.",
    analogia: "Chave mestra de uma casa só: abre tudo ali, nada na casa do vizinho.",
  },
  {
    id: "medico-associado", ordem: 3, nome: "Médico associado", quem: "Contratado / supervisionado",
    papeis: { ...vazio, doctor: true },
    responsabilidades: ["Cockpit, prontuário, anamnese e exames", "Prescrição"],
    limites: ["Sem financeiro", "Sem custos de fornecedor", "Sem gestão de equipe"],
    exemplo: "Atende o cliente e prescreve; ao tentar abrir o caixa recebe recusa do servidor.",
    analogia: "Cirurgião convidado: usa a sala de cirurgia, não o escritório da diretoria.",
  },
  {
    id: "enfermagem", ordem: 4, nome: "Enfermagem", quem: "Equipe de aplicação",
    papeis: { ...vazio, nurse: true },
    responsabilidades: ["Agenda de aplicações", "Registro e validação de medicações", "Triagem e dúvidas de tratamento"],
    limites: ["Sem prescrição (nem leitura)", "Sem financeiro"],
    exemplo: "Registra a aplicação de um injetável; não consegue abrir a prescrição nem o caixa.",
    analogia: "Quem executa a receita na bancada: segue o que o médico decidiu, não reescreve.",
  },
  {
    id: "recepcao", ordem: 5, nome: "Recepção", quem: "Atendimento",
    papeis: { ...vazio, reception: true },
    responsabilidades: ["Agenda e cadastro básico", "Link de anamnese", "Resumos de protocolos e financeiro em leitura"],
    limites: ["Financeiro só leitura", "Sem prontuário, laudos ou exames"],
    exemplo: "Consulta se o cliente pagou, mas não altera o pagamento nem abre o prontuário.",
    analogia: "Balcão da portaria: vê o painel de avisos, não mexe nos arquivos trancados.",
  },
  {
    id: "financeiro", ordem: 6, nome: "Gerente financeiro", quem: "Financeiro / burocrático",
    papeis: { ...vazio, finance: true },
    responsabilidades: ["Valores pagos e contas", "Notas fiscais e repasses", "Custos de fornecedor"],
    limites: ["Sigilo médico absoluto: sem prontuário, evolução ou laudo", "Sem prescrição"],
    exemplo: "Emite a nota fiscal de um serviço; ao tentar abrir um laudo recebe recusa.",
    analogia: "Contador do hospital: vê o dinheiro, nunca o prontuário.",
  },
];

const AMOSTRA: Record<string, [string, string]> = {
  prescricao: ["/prescriptions", "/prescriptions"],
  prontuario: ["/prontuario/1", "/prontuario/1"],
  "custos-fornecedor": ["/fornecedores", "/fornecedores"],
  financeiro: ["/payments", "/payments"],
  equipe: ["/padteam/x", "/padteam/x"],
};

export const DOMINIOS_NOMES: Record<string, string> = {
  prescricao: "Prescrição e receituário",
  prontuario: "Prontuário, exames e laudos",
  "custos-fornecedor": "Custos de fornecedor",
  financeiro: "Financeiro e notas fiscais",
  equipe: "Gestão de equipe",
};

export function montarMapaPermissoes(): PerfilMapa[] {
  return base.map((p) => ({
    ...p,
    dominios: REGRAS.map((r) => {
      const [lerPath, escPath] = AMOSTRA[r.dominio] ?? ["/", "/"];
      const ler = decidirAcesso({ path: lerPath, metodo: "GET", autenticado: true, donoPlataforma: false, papeis: p.papeis }).ok;
      const escrever = decidirAcesso({ path: escPath, metodo: "POST", autenticado: true, donoPlataforma: false, papeis: p.papeis }).ok;
      return { dominio: r.dominio, ler, escrever };
    }),
  }));
}
