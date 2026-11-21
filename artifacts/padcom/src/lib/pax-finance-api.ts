import { collabAuthHeaders } from "@/lib/collab-auth";

const apiBase = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`;

const COMPANY_KEY = "paxfin_company";
export const getFinCompany = (): number | null => { try { const n = Number(localStorage.getItem(COMPANY_KEY)); return Number.isSafeInteger(n) && n > 0 ? n : null; } catch { return null; } };
export const setFinCompany = (id: number) => { try { localStorage.setItem(COMPANY_KEY, String(id)); } catch { /* sem armazenamento: vale so nesta aba */ } };

export async function finApi<T>(path: string, init?: { method?: string; body?: unknown; semEmpresa?: boolean }): Promise<T> {
  const emp = init?.semEmpresa ? null : getFinCompany();
  const r = await fetch(`${apiBase}/pax-finance${path}`, {
    method: init?.method ?? "GET",
    headers: collabAuthHeaders({ ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(emp ? { "x-fin-company": String(emp) } : {}) }),
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  return j as T;
}

export const brlDeCentavos = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const centavosDeTexto = (t: string): number | null => {
  const s = t.replace(/[^\d,]/g, "").replace(",", ".");
  if (!s) return null;
  return Math.round(Number(s) * 100);
};

export type FinEmpresa = { empresa: { id: number; nome: string; razaoSocial: string | null; cnpj: string | null; cnae: string | null; regimeCadastro: string | null; cidade: string | null; estado: string | null }; perfil: FinPerfil | null };
export type FinPerfil = { regimeDeclarado: string | null; opcaoSimples: "nao_verificada" | "confirmada" | "nao_optante"; fatorRAplicavel: boolean | null; municipioIss: string | null; uf: string | null; capitalSocialCents: number | null; capitalSocialOrigem: string | null; statusValidacao: "rascunho" | "validado"; observacoes: string | null };
export type FinSocio = { id: number; nome: string; papel: string; participacaoBp: number | null; vigenciaInicio: string | null; vigenciaFim: string | null; origem: string; statusValidacao: string };
export type FinRegra = { id: number; ruleKey: string; version: number; tributo: string; esfera: string; municipio: string | null; regime: string | null; anexo: string | null; base: string | null; aliquotaPct: number | null; parcelaDeduzirCents: number | null; limiteMinCents: number | null; limiteMaxCents: number | null; fonteOficial: string | null; fonteUrl: string | null; fonteConsultadaEm: string | null; vigenciaInicio: string; vigenciaFim: string | null; status: string };

export type PeriodoTipo = "month" | "quarter" | "semester" | "year" | "rolling12";
export type FinResumoGoals = {
  periodType: PeriodoTipo; periodKey: string; janela: { meses: string[]; decorridos: number; total: number };
  resumo: { metaCents: number | null; recebidoCents: number; faltaCents: number | null; pctAtingido: number | null; mediaMensalCents: number | null; projecaoFechamentoCents: number | null; diferencaProjecaoCents: number | null };
  conceitos: { recebidoCents: number; abertoCents: number; vencidoCents: number; emitidoCents: number | null; emitidoNota: string; reconhecidoCents: number | null; pagamentosComLinkDeNota: number };
  serie: { mes: string; recebidoCents: number; abertoCents: number; vencidoCents: number; futuro: boolean }[];
  origem: string; legadoNaoAtribuido: number;
};
export type FinMarco = { ordem: number; nome: string; valorMensalCents: number; note: string | null };
export type FinMeta = { id: number; tipo: string; periodType: PeriodoTipo; periodKey: string; targetCents: number; titulo: string | null; note: string | null };
export type FinCredito = { lineKey: string; version: number; nome: string; etapa: string; status: "aguardando_verificacao" | "verificada"; conditions: Record<string, string | number | null>; fonteOficial: string | null; fonteUrl: string | null; verificadaEm: string | null };
export type FinPessoa = { id: number; nome: string; papel: string; participacaoBp: number | null; registroProfissional: string | null; origemDoc: { documentos?: string[] }; statusValidacao: string };
export type FinEntidade = {
  id: number; cnpj: string; cnpjValido: boolean; razaoSocial: string; dataConstituicao: string | null; naturezaJuridica: string | null; porte: string | null;
  capitalSocialCents: number | null; capitalIntegralizado: boolean | null; sede: Record<string, string>; cnaePrincipal: string | null; cnaePrincipalDescricao: string | null; cnaesSecundarios: string[];
  regimeEfetivo: string | null; opcaoSimples: string; inscricaoMunicipal: string | null; inscricaoEstadual: string | null; origemCampos: Record<string, string[]>;
  statusValidacao: "rascunho" | "validado"; pessoas: FinPessoa[];
};
export type FinCenario = { nome: string; status: "calculado" | "pendente"; impostoMensalCents: number | null; aliquotaEfetivaPct: number | null; memoria: string[]; pendencias: string[]; regrasUsadas: { ruleKey: string; version: number; fonteUrl: string | null }[] };
export type FinSimulacao = {
  aviso: string; fatorR: { razaoPct: number | null; limitePct: number | null; anexo: string | null; pendencias: string[]; aviso: string };
  cenarios: FinCenario[]; comparacao: { menorCenario: string; economiaEstimadaMensalCents: number | null } | null;
  sensibilidade: { variacaoPct: number; rbt12Cents: number; simples: { anexo: string; aliquotaEfetivaPct: number | null }[] }[]; premissas: string[];
};
export type FinLedger = {
  lancamentos: { id: number; tipo: string; descricao: string; valorCents: number; competencia: string; dataCaixa: string | null; status: string }[];
  pagamentos: { referencia: string; origem: string; valorCents: number; estado: string; data: string | null }[];
  totais: { recebidoPagamentosCents: number; receitasManuaisCents: number; aReceberCents: number; despesasPagasCents: number; guiasPagasCents: number; aPagarCents: number; caixaLiquidoCents: number };
  modo: string;
};

export type FinEmpresaSeletor = { id: number; nomeFantasia: string; razaoSocial: string | null; cnpj: string | null; aliases: string[]; entidadeId: number | null; statusCadastro: string | null };
export type FinCenarioMes = { mes: number; realComprovadoCents: number | null; realRotulo: string; simulacaoCents: number | null; projecaoCents: number | null };
export type FinCenarioDemo = { ano: number; rotulo: string; aviso: string; meses: FinCenarioMes[]; totais: { simulacaoCents: number | null; projecaoCents: number | null; projecaoAnualIlustrativaCents: number | null; realComprovadoCents: number | null }; temDemo: boolean; temReal: boolean };
export type FinAgente = { id: string; nome: string; estado: string; motivo: string; ligado: boolean; pendencias: string[] };
export type FinCreditoRes = {
  lineKey: string; nome: string; perfil: string; operadora: string; aderenteAFinalidade: boolean; modo: string; avisoRegra: string | null; statusFonte: string;
  fonte: { oficial: string | null; url: string | null; verificadaEm: string | null; versao: number | null }; percentualUsado: number; percentualOrigem: string;
  receitaAnualNecessariaCents: number; metaMensalCents: number; comprovadoUltimos12mCents: number | null; comprovadoRotulo: string; faltaCents: number; cenarioMensalCents: number; mesesParaMeta: number | null;
  plano: { mes: string; metaMesCents: number; acumuladoCents: number; faltaCents: number }[]; marcos: { percentual: number; acumuladoCents: number; mes: string | null }[];
  requisitos: { nome: string; exigido: string; situacao: string; detalhe: string }[]; memoria: string[];
};
export type FinComparacao = { aviso: string; recomendacaoFirme: boolean; justificativa: string; ordemSugerida: string[]; linhas: FinCreditoRes[] };

/** Envio de arquivo (multipart). Nao define Content-Type: o navegador monta o limite do formulario. */
export async function finUpload<T>(path: string, campo: string, arquivo: File): Promise<T> {
  const emp = getFinCompany();
  const fd = new FormData(); fd.append(campo, arquivo);
  const r = await fetch(`${apiBase}/pax-finance${path}`, { method: "POST", headers: collabAuthHeaders(emp ? { "x-fin-company": String(emp) } : {}), body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  return j as T;
}
