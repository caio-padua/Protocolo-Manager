/**
 * Campos do cadastro de LOCAL EXTERNO: os mesmos da empresa (dados, fiscal e CNAE, endereço fiscal,
 * documentos fiscais), mas INTERNOS: nenhuma chave liga a outra tabela e não há token nem certificado.
 * O endereço comercial vive nas colunas próprias (cep, logradouro...) por causa da agenda EXTERNA.
 * Espelho de rótulos/ordem no navegador: padcom/src/lib/locais-externos-campos.ts (mexeu num, mexa no outro).
 */
export type TipoCampo = "text" | "email" | "cnpj" | "cpf" | "cep" | "uf" | "date" | "money" | "int" | "bool" | "enum";
export type CampoLocal = { key: string; col: string; tipo: TipoCampo; max?: number; valores?: readonly string[] };

export const CAMPOS_LOCAL: readonly CampoLocal[] = [
  { key: "nomeFantasia", col: "nome_fantasia", tipo: "text", max: 160 },
  { key: "razaoSocial", col: "razao_social", tipo: "text", max: 200 },
  { key: "nick", col: "nick", tipo: "text", max: 80 },
  { key: "cnpj", col: "cnpj", tipo: "cnpj" },
  { key: "tipoUnidade", col: "tipo_unidade", tipo: "enum", valores: ["CLINICA", "LABORATORIO", "OUTRO"] },
  { key: "donoNome", col: "dono_nome", tipo: "text", max: 160 },
  { key: "telefone", col: "telefone", tipo: "text", max: 30 },
  { key: "emailGeral", col: "email_geral", tipo: "email" },
  { key: "emailAgenda", col: "email_agenda", tipo: "email" },
  { key: "emailEnfermagem", col: "email_enfermagem", tipo: "email" },
  { key: "emailFinanceiro", col: "email_financeiro", tipo: "email" },
  { key: "naturezaJuridica", col: "natureza_juridica", tipo: "enum", valores: ["Ltda", "SA", "MEI", "EIRELI", "Associação", "Fundação", "SLU"] },
  { key: "regimeTributario", col: "regime_tributario", tipo: "enum", valores: ["simples_nacional", "lucro_presumido", "lucro_real", "mei"] },
  { key: "cnae", col: "cnae", tipo: "text", max: 10 },
  { key: "cnaeDescricao", col: "cnae_descricao", tipo: "text", max: 200 },
  { key: "inscricaoEstadual", col: "inscricao_estadual", tipo: "text", max: 30 },
  { key: "inscricaoMunicipal", col: "inscricao_municipal", tipo: "text", max: 30 },
  { key: "dataAbertura", col: "data_abertura", tipo: "date" },
  { key: "capitalSocial", col: "capital_social", tipo: "money" },
  { key: "responsavelLegalNome", col: "responsavel_legal_nome", tipo: "text", max: 160 },
  { key: "responsavelLegalCpf", col: "responsavel_legal_cpf", tipo: "cpf" },
  { key: "contadorNome", col: "contador_nome", tipo: "text", max: 160 },
  { key: "contadorCrc", col: "contador_crc", tipo: "text", max: 30 },
  { key: "contadorEmail", col: "contador_email", tipo: "email" },
  { key: "contadorTelefone", col: "contador_telefone", tipo: "text", max: 30 },
  { key: "zona", col: "zona", tipo: "text", max: 80 },
  { key: "cepFiscal", col: "cep_fiscal", tipo: "cep" },
  { key: "enderecoFiscal", col: "endereco_fiscal", tipo: "text", max: 200 },
  { key: "complementoFiscal", col: "complemento_fiscal", tipo: "text", max: 120 },
  { key: "bairroFiscal", col: "bairro_fiscal", tipo: "text", max: 120 },
  { key: "cidadeFiscal", col: "cidade_fiscal", tipo: "text", max: 120 },
  { key: "estadoFiscal", col: "estado_fiscal", tipo: "uf" },
  { key: "codigoIbge", col: "codigo_ibge", tipo: "text", max: 7 },
  { key: "nfeAmbiente", col: "nfe_ambiente", tipo: "enum", valores: ["homologacao", "producao"] },
  { key: "optanteSimples", col: "optante_simples", tipo: "bool" },
  { key: "nfeSerie", col: "nfe_serie", tipo: "text", max: 10 },
  { key: "nfeProximoNumero", col: "nfe_proximo_numero", tipo: "int" },
  { key: "nfeCodigoServico", col: "nfe_codigo_servico", tipo: "text", max: 20 },
  { key: "nfeAliquotaIss", col: "nfe_aliquota_iss", tipo: "money" },
  { key: "nfeCodigoIss", col: "nfe_codigo_iss", tipo: "text", max: 30 },
  { key: "nfeDiscriminacaoPadrao", col: "nfe_discriminacao_padrao", tipo: "text", max: 600 },
];

const digitos = (v: string) => v.replace(/\D/g, "");

export function cnpjValido(v: string): boolean {
  const d = digitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0, peso = base.length - 7;
    for (const c of base) { soma += Number(c) * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
}

export function cpfValido(v: string): boolean {
  const d = digitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

const mascaraCnpj = (d: string) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
const mascaraCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;

export type ValorCampo = string | number | boolean | null;

/** Valida e normaliza UM campo. Vazio vira null. Erro claro e em português. */
export function normalizarCampo(c: CampoLocal, bruto: unknown): { ok: true; valor: ValorCampo } | { ok: false; error: string } {
  if (bruto === undefined || bruto === null || (typeof bruto === "string" && bruto.trim() === "")) return { ok: true, valor: null };
  if (c.tipo === "bool") {
    return typeof bruto === "boolean" ? { ok: true, valor: bruto } : { ok: false, error: `Valor inválido em ${c.key}.` };
  }
  if (c.tipo === "int") {
    const n = typeof bruto === "number" ? bruto : Number(String(bruto).trim());
    return Number.isInteger(n) && n >= 0 && n < 1e9 ? { ok: true, valor: n } : { ok: false, error: "Próximo número da nota deve ser um inteiro." };
  }
  if (c.tipo === "money") {
    const texto = String(bruto).trim();
    // "1.000,50" e "10.000" são formato brasileiro; "2.00" e "10000.5" vêm do banco, com ponto decimal.
    const brasileiro = texto.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(texto);
    const n = typeof bruto === "number" ? bruto : Number(brasileiro ? texto.replace(/\./g, "").replace(",", ".") : texto);
    return Number.isFinite(n) && n >= 0 && n < 1e12 ? { ok: true, valor: n } : { ok: false, error: `Valor numérico inválido (${c.key}).` };
  }
  if (typeof bruto !== "string") return { ok: false, error: `Valor inválido em ${c.key}.` };
  const t = bruto.trim();
  switch (c.tipo) {
    case "cnpj": {
      if (!cnpjValido(t)) return { ok: false, error: "CNPJ inválido (confira os 14 números e os dígitos finais)." };
      return { ok: true, valor: mascaraCnpj(digitos(t)) };
    }
    case "cpf": {
      if (!cpfValido(t)) return { ok: false, error: "CPF do responsável legal inválido." };
      return { ok: true, valor: mascaraCpf(digitos(t)) };
    }
    case "cep": {
      const d = digitos(t);
      if (d.length !== 8) return { ok: false, error: "CEP fiscal deve ter 8 números." };
      return { ok: true, valor: `${d.slice(0, 5)}-${d.slice(5)}` };
    }
    case "uf":
      return /^[A-Za-z]{2}$/.test(t) ? { ok: true, valor: t.toUpperCase() } : { ok: false, error: "UF fiscal deve ter 2 letras." };
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && t.length <= 160 ? { ok: true, valor: t.toLowerCase() } : { ok: false, error: `E-mail inválido: ${t.slice(0, 60)}` };
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? { ok: true, valor: t } : { ok: false, error: "Data de abertura inválida." };
    case "enum":
      return c.valores!.includes(t) ? { ok: true, valor: t } : { ok: false, error: `Opção inválida em ${c.key}.` };
    default:
      return t.length <= (c.max ?? 200) ? { ok: true, valor: t } : { ok: false, error: `Texto longo demais em ${c.key} (máximo ${c.max ?? 200}).` };
  }
}

export function normalizarDados(dados: unknown): { ok: true; valores: Record<string, ValorCampo> } | { ok: false; error: string } {
  const origem = (dados && typeof dados === "object" ? dados : {}) as Record<string, unknown>;
  const valores: Record<string, ValorCampo> = {};
  for (const c of CAMPOS_LOCAL) {
    if (!(c.key in origem)) continue;
    const r = normalizarCampo(c, origem[c.key]);
    if (!r.ok) return r;
    valores[c.col] = r.valor;
  }
  return { ok: true, valores };
}

/** Linha do banco -> objeto `dados` (tudo texto/booleano, vazio = null). */
export function dadosDaLinha(linha: Record<string, unknown>): Record<string, string | boolean | null> {
  const out: Record<string, string | boolean | null> = {};
  for (const c of CAMPOS_LOCAL) {
    const v = linha[c.col];
    if (v === null || v === undefined) { out[c.key] = null; continue; }
    if (c.tipo === "bool") out[c.key] = v === true;
    else if (c.tipo === "date") out[c.key] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    else out[c.key] = String(v);
  }
  return out;
}
