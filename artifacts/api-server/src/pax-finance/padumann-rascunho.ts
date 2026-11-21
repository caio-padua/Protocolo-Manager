/**
 * Rascunho documental da PADUMANN (documentos enviados pelo CEO em 21/11/2026).
 * Tudo entra como RASCUNHO: so vale apos conferencia humana campo a campo.
 * NAO entram: CPF, RG, endereco residencial, regime efetivo, opcao pelo Simples,
 * inscricoes, aliquota de ISS, folha, faturamento, debitos, notas, conta Asaas, beneficios de credito.
 */
const CONTRATO = "Contrato social assinado (paginas 1 a 3)";
const JUCESP = "Certidao de inteiro teor JUCESP (paginas 1 a 5)";
const CNPJ_DOC = "Comprovante de CNPJ emitido em 30/09/2026 (paginas 1 e 2)";
export const PAGINA_A_CONFERIR = "pagina exata a conferir pelo revisor";

export const CNAES_SECUNDARIOS = [
  "72.10-0-00", "85.99-6-99", "86.30-5-01", "86.30-5-02", "86.30-5-04", "86.30-5-99", "86.40-2-02", "86.40-2-07", "86.40-2-08", "86.40-2-09",
  "86.40-2-99", "86.50-0-01", "86.50-0-02", "86.50-0-03", "86.50-0-04", "86.50-0-05", "86.50-0-06", "86.50-0-07", "86.60-7-00", "86.90-9-01",
  "86.90-9-03", "86.90-9-04", "87.11-5-03", "87.12-3-00", "87.20-4-01", "87.20-4-99", "88.00-6-00",
] as const;

export const PADUMANN = {
  cnpj: "69.410.873/0001-79",
  razaoSocial: "PADUMANN CLÍNICA MÉDICA LTDA",
  dataConstituicao: "2026-08-13",
  naturezaJuridica: "Sociedade empresária limitada unipessoal",
  porte: "Empresa de Pequeno Porte (EPP)",
  capitalSocialCents: 50_000_000,
  capitalIntegralizado: true,
  sede: { logradouro: "Rua Guaxupé", numero: "327", complemento: "Sala 02", bairro: "Vila Formosa", municipio: "São Paulo", uf: "SP", cep: "03416-050" },
  cnaePrincipal: "86.30-5-03",
  cnaePrincipalDescricao: "Atividade médica ambulatorial restrita a consultas",
  origemCampos: {
    razaoSocial: [CNPJ_DOC, CONTRATO, JUCESP], cnpj: [CNPJ_DOC], dataConstituicao: [CONTRATO, JUCESP, CNPJ_DOC],
    naturezaJuridica: [CONTRATO, JUCESP, CNPJ_DOC], porte: [CNPJ_DOC], capitalSocial: [CONTRATO, JUCESP],
    capitalIntegralizado: [CONTRATO], sede: [CNPJ_DOC, CONTRATO, JUCESP], cnaePrincipal: [CNPJ_DOC, CONTRATO],
    cnaesSecundarios: [CNPJ_DOC], observacao: [PAGINA_A_CONFERIR],
  } as Record<string, string[]>,
  pessoas: [
    { nome: "Dayana Ludman Alves Caldas da Silva", papel: "socio_administrador" as const, participacaoBp: 10000, registro: null as string | null, origem: [CONTRATO, JUCESP] },
    { nome: "Caio Henrique Fernandes Pádua", papel: "responsavel_tecnico" as const, participacaoBp: null as number | null, registro: "CRM/SP 125475/SP", origem: [CONTRATO] },
  ],
};
