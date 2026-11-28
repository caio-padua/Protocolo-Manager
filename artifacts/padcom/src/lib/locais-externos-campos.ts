/**
 * Campos do cadastro de LOCAL EXTERNO: os mesmos da empresa (Dados, Fiscal e CNAE, Endereço, Documentos Fiscais),
 * porém INTERNOS: sem integração, token ou certificado. Espelho de chaves do servidor:
 * api-server/src/lib/locais-externos-campos.ts (mexeu num, mexa no outro).
 */
export type TipoCampo = "text" | "select" | "date" | "money" | "int" | "bool" | "textarea" | "cnpj" | "cpf" | "cep" | "uf" | "cnae" | "email";

export type Campo = {
  key: string; label: string; tipo: TipoCampo; placeholder?: string; dica?: string;
  colunas?: 1 | 2 | 4; mono?: boolean; opcoes?: readonly (readonly [string, string])[]; obrigatorio?: boolean;
};
export type Bloco = { titulo?: string; layout: "dois" | "quatro"; campos: readonly Campo[] };
export type Secao = { id: string; rotulo: string; blocos: readonly Bloco[] };

const TIPOS_UNIDADE = [["CLINICA", "Clínica"], ["LABORATORIO", "Laboratório"], ["OUTRO", "Outro"]] as const;
const NATUREZAS = [["Ltda", "Ltda"], ["SA", "S/A"], ["MEI", "MEI"], ["EIRELI", "EIRELI"], ["Associação", "Associação"], ["Fundação", "Fundação"], ["SLU", "SLU (Soc. Limitada Unipessoal)"]] as const;
const REGIMES = [["simples_nacional", "Simples Nacional"], ["lucro_presumido", "Lucro Presumido"], ["lucro_real", "Lucro Real"], ["mei", "MEI"]] as const;
const AMBIENTES = [["homologacao", "Homologação (teste)"], ["producao", "Produção (real)"]] as const;

export const SECOES: readonly Secao[] = [
  {
    id: "dados", rotulo: "Dados", blocos: [
      { layout: "dois", campos: [
        { key: "nome", label: "Nome no Sistema *", tipo: "text", colunas: 2, placeholder: "Ex: Consultório Jardins", obrigatorio: true },
        { key: "nomeFantasia", label: "Nome Fantasia", tipo: "text", colunas: 2, placeholder: "Nome de divulgação do local" },
        { key: "razaoSocial", label: "Razão Social", tipo: "text", colunas: 2, placeholder: "Nome jurídico completo" },
        { key: "nick", label: "Apelido Interno", tipo: "text", placeholder: "Como a equipe chama" },
        { key: "cnpj", label: "CNPJ", tipo: "cnpj", mono: true, placeholder: "00.000.000/0001-00", dica: "Cadastro interno: não é consultado em nenhum órgão." },
        { key: "tipoUnidade", label: "Categoria", tipo: "select", opcoes: TIPOS_UNIDADE },
        { key: "donoNome", label: "Responsável Principal", tipo: "text", placeholder: "Dr. Nome Completo" },
      ] },
      { titulo: "Contato", layout: "dois", campos: [
        { key: "telefone", label: "Telefone / WhatsApp", tipo: "text", placeholder: "(11) 90000-0000" },
        { key: "emailGeral", label: "E-mail Geral", tipo: "email", placeholder: "contato@exemplo.com.br" },
        { key: "emailAgenda", label: "E-mail Agenda", tipo: "email" },
        { key: "emailEnfermagem", label: "E-mail Enfermagem", tipo: "email" },
        { key: "emailFinanceiro", label: "E-mail Financeiro", tipo: "email" },
        { key: "observacao", label: "Observação", tipo: "textarea", colunas: 2, placeholder: "Anotação interna sobre este local" },
      ] },
    ],
  },
  {
    id: "fiscal", rotulo: "Fiscal e CNAE", blocos: [
      { titulo: "Enquadramento", layout: "dois", campos: [
        { key: "naturezaJuridica", label: "Natureza Jurídica", tipo: "select", opcoes: NATUREZAS },
        { key: "regimeTributario", label: "Regime Tributário", tipo: "select", opcoes: REGIMES },
        { key: "cnae", label: "CNAE Principal", tipo: "cnae", mono: true, placeholder: "86.30-5/01" },
        { key: "cnaeDescricao", label: "Descrição do CNAE", tipo: "text", placeholder: "Atividades de atenção ambulatorial..." },
        { key: "inscricaoEstadual", label: "Inscrição Estadual (IE)", tipo: "text", mono: true },
        { key: "inscricaoMunicipal", label: "Inscrição Municipal (IM / CCM)", tipo: "text", mono: true },
        { key: "dataAbertura", label: "Data de Abertura", tipo: "date" },
        { key: "capitalSocial", label: "Capital Social (R$)", tipo: "money", placeholder: "1.000,00" },
      ] },
      { titulo: "Responsável Legal", layout: "dois", campos: [
        { key: "responsavelLegalNome", label: "Nome do Sócio / Representante Legal", tipo: "text" },
        { key: "responsavelLegalCpf", label: "CPF do Responsável Legal", tipo: "cpf", mono: true, placeholder: "000.000.000-00" },
      ] },
      { titulo: "Contador", layout: "dois", campos: [
        { key: "contadorNome", label: "Nome do Contador", tipo: "text" },
        { key: "contadorCrc", label: "CRC do Contador", tipo: "text", mono: true },
        { key: "contadorEmail", label: "E-mail do Contador", tipo: "email" },
        { key: "contadorTelefone", label: "Telefone do Contador", tipo: "text" },
      ] },
    ],
  },
  {
    id: "end", rotulo: "Endereço", blocos: [
      { titulo: "Endereço Comercial", layout: "quatro", campos: [
        { key: "cep", label: "CEP *", tipo: "cep", placeholder: "00000-000", obrigatorio: true },
        { key: "logradouro", label: "Logradouro *", tipo: "text", colunas: 2, placeholder: "Rua, avenida, praça...", obrigatorio: true },
        { key: "numero", label: "Número *", tipo: "text", obrigatorio: true },
        { key: "complemento", label: "Complemento", tipo: "text", placeholder: "Sala, conjunto..." },
        { key: "bairro", label: "Bairro *", tipo: "text", obrigatorio: true },
        { key: "cidade", label: "Cidade *", tipo: "text", obrigatorio: true },
        { key: "uf", label: "UF *", tipo: "uf", obrigatorio: true },
        { key: "zona", label: "Zona / Área", tipo: "text", colunas: 2, placeholder: "Ex: Zona Leste" },
      ] },
      { titulo: "Endereço Fiscal (para NF-e — pode ser igual ao comercial)", layout: "quatro", campos: [
        { key: "cepFiscal", label: "CEP Fiscal", tipo: "cep", placeholder: "00000-000" },
        { key: "enderecoFiscal", label: "Logradouro Fiscal", tipo: "text", colunas: 2 },
        { key: "complementoFiscal", label: "Complemento Fiscal", tipo: "text" },
        { key: "bairroFiscal", label: "Bairro Fiscal", tipo: "text" },
        { key: "cidadeFiscal", label: "Cidade Fiscal", tipo: "text" },
        { key: "estadoFiscal", label: "UF Fiscal", tipo: "uf" },
        { key: "codigoIbge", label: "Código IBGE do Município", tipo: "text", mono: true, colunas: 2, placeholder: "3550308 (São Paulo)", dica: "7 dígitos — usado em NF-e" },
      ] },
    ],
  },
  {
    id: "nfe", rotulo: "Documentos Fiscais", blocos: [
      { titulo: "Nota Fiscal Eletrônica (NFS-e / NF-e)", layout: "dois", campos: [
        { key: "nfeAmbiente", label: "Ambiente NF-e", tipo: "select", opcoes: AMBIENTES },
        { key: "optanteSimples", label: "Optante pelo Simples Nacional", tipo: "bool" },
        { key: "nfeSerie", label: "Série NF", tipo: "text", mono: true, placeholder: "1" },
        { key: "nfeProximoNumero", label: "Próximo Número NF", tipo: "int", mono: true, placeholder: "1" },
        { key: "nfeCodigoServico", label: "Código do Serviço (LC 116/2003)", tipo: "text", mono: true, placeholder: "4.01" },
        { key: "nfeAliquotaIss", label: "Alíquota ISS (%)", tipo: "money", mono: true, placeholder: "2,00" },
        { key: "nfeCodigoIss", label: "Código ISS Municipal", tipo: "text", mono: true },
        { key: "nfeDiscriminacaoPadrao", label: "Discriminação Padrão da Nota", tipo: "textarea", colunas: 2, placeholder: "Prestação de serviços médicos..." },
      ] },
    ],
  },
] as const;

export type Valores = Record<string, string | boolean>;

/** Campos que moram em colunas próprias (endereço comercial, nome, observação); o resto vai em `dados`. */
export const CHAVES_NUCLEO = ["nome", "observacao", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf"] as const;

export const TODOS_CAMPOS: readonly Campo[] = SECOES.flatMap((s) => s.blocos.flatMap((b) => b.campos));

export function valoresVazios(): Valores {
  const v: Valores = {};
  for (const c of TODOS_CAMPOS) v[c.key] = c.tipo === "bool" ? true : "";
  v.nfeAmbiente = "homologacao"; v.nfeSerie = "1"; v.nfeProximoNumero = "1";
  return v;
}

const dinheiro = (txt: string) => {
  const n = Number(txt);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : txt;
};

export function mascarar(tipo: TipoCampo, bruto: string): string {
  const d = bruto.replace(/\D/g, "");
  switch (tipo) {
    case "cnpj": { const x = d.slice(0, 14); return x.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"); }
    case "cpf": { const x = d.slice(0, 11); return x.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2"); }
    case "cep": return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5, 8)}` : d;
    case "cnae": {
      const x = d.slice(0, 7);
      if (x.length <= 2) return x;
      if (x.length <= 4) return `${x.slice(0, 2)}.${x.slice(2)}`;
      if (x.length === 5) return `${x.slice(0, 2)}.${x.slice(2, 4)}-${x[4]}`;
      return `${x.slice(0, 2)}.${x.slice(2, 4)}-${x[4]}/${x.slice(5)}`;
    }
    case "uf": return bruto.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
    default: return bruto;
  }
}

type LocalApi = {
  nome: string; observacao: string | null;
  endereco: { cep: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string };
  dados: Record<string, string | boolean | null>;
};

export function valoresDoLocal(l: LocalApi): Valores {
  const v = valoresVazios();
  v.nome = l.nome; v.observacao = l.observacao ?? "";
  for (const [k, x] of Object.entries(l.endereco)) v[k] = x ?? "";
  for (const c of TODOS_CAMPOS) {
    if (!(c.key in l.dados)) continue;
    const x = l.dados[c.key];
    if (c.tipo === "bool") v[c.key] = x === true;
    else if (x === null || x === undefined) v[c.key] = c.key === "nfeAmbiente" ? "homologacao" : "";
    else v[c.key] = c.tipo === "money" ? dinheiro(String(x)) : String(x);
  }
  return v;
}

/** Separa o formulário no corpo da API: núcleo (colunas próprias) e `dados` (campos da empresa). */
export function corpoDoFormulario(v: Valores) {
  const t = (k: string) => String(v[k] ?? "").trim();
  const dados: Record<string, string | boolean> = {};
  for (const c of TODOS_CAMPOS) {
    if ((CHAVES_NUCLEO as readonly string[]).includes(c.key)) continue;
    dados[c.key] = c.tipo === "bool" ? v[c.key] === true : t(c.key);
  }
  return {
    nome: t("nome"), observacao: t("observacao") || null,
    endereco: { cep: t("cep"), logradouro: t("logradouro"), numero: t("numero"), complemento: t("complemento") || null, bairro: t("bairro"), cidade: t("cidade"), uf: t("uf") },
    dados,
  };
}

/** Texto de quem falta para salvar (campos marcados com *), ou null se está completo. */
export function faltaPreencher(v: Valores): string | null {
  const falta = TODOS_CAMPOS.filter((c) => c.obrigatorio && !String(v[c.key] ?? "").trim()).map((c) => c.label.replace(" *", ""));
  return falta.length ? `Preencha: ${falta.join(", ")}.` : null;
}
