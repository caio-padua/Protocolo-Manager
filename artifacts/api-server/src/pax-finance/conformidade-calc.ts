import { z } from "zod";
import { cnpjValido } from "./entidades";

/**
 * CONFORMIDADE SOCIETARIA (puro, sem banco): beneficiario final, controle efetivo e partes relacionadas.
 * Serve para TRANSPARENCIA e para bloquear o Roteador quando ha pendencia. Nunca sugere dividir receita,
 * emitir nota por outra empresa, colocar terceiro como titular nem multiplicar emprestimos.
 */
export const TIPOS_PARTE = ["beneficiario_final", "controle_efetivo", "parte_relacionada"] as const;
export const VIAS = ["direta", "indireta", "contrato", "procuracao", "familiar", "mesmo_grupo", "administrador_de_fato"] as const;
export type TipoParte = (typeof TIPOS_PARTE)[number];
export const ROTULO_TIPO: Record<TipoParte, string> = { beneficiario_final: "Beneficiário final", controle_efetivo: "Controle efetivo", parte_relacionada: "Parte relacionada" };
export const ROTULO_VIA: Record<(typeof VIAS)[number], string> = {
  direta: "Participação direta", indireta: "Participação indireta (por outra empresa)", contrato: "Controle por contrato ou acordo", procuracao: "Procuração com poderes amplos",
  familiar: "Parentesco com sócio ou administrador", mesmo_grupo: "Mesmo grupo econômico", administrador_de_fato: "Administra de fato, sem constar no contrato",
};

/** Nome nunca recebe CPF nem RG: esses dados pessoais não são guardados neste domínio. */
const semDocumentoPessoal = (s: string) => !/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(s) && !/\d{8,}/.test(s.replace(/\D/g, "")) ;
export const ParteInput = z.object({
  tipo: z.enum(TIPOS_PARTE),
  nome: z.string().trim().min(2).max(200).refine(semDocumentoPessoal, "Não digite CPF, RG ou outro número de documento no nome."),
  tipoPessoa: z.enum(["fisica", "juridica"]),
  cnpj: z.string().trim().refine(cnpjValido, "CNPJ inválido (dígitos verificadores)").nullable().optional(),
  participacaoBp: z.number().int().min(0).max(10000).nullable().optional(),
  via: z.enum(VIAS),
  fonteDocumento: z.string().trim().max(300).nullable().optional(),
  observacao: z.string().trim().max(500).nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.tipoPessoa === "fisica" && v.cnpj) ctx.addIssue({ code: "custom", path: ["cnpj"], message: "Pessoa física não tem CNPJ." });
  if (v.tipoPessoa === "juridica" && !v.cnpj) ctx.addIssue({ code: "custom", path: ["cnpj"], message: "Informe o CNPJ da empresa envolvida." });
  if (v.tipo === "beneficiario_final" && v.tipoPessoa !== "fisica") ctx.addIssue({ code: "custom", path: ["tipoPessoa"], message: "Beneficiário final é sempre uma pessoa física." });
});
export type ParteIn = z.infer<typeof ParteInput>;

export interface ParteReg extends Omit<ParteIn, "cnpj" | "participacaoBp" | "fonteDocumento" | "observacao"> {
  id: number; cnpj: string | null; participacaoBp: number | null; fonteDocumento: string | null; observacao: string | null; statusValidacao: "rascunho" | "validado"; encerradaEm: string | null;
}
export interface PessoaSocietaria { nome: string; papel: string; participacaoBp: number | null }

export interface Achado { codigo: string; gravidade: "pendencia" | "alerta" | "info"; titulo: string; detalhe: string }
/** Limite usual para presumir beneficiario final por participacao. A norma exata deve ser conferida e fixada como regra versionada. */
export const LIMITE_BF_BP = 2500;

export function avaliarConformidade(pessoas: PessoaSocietaria[], partes: ParteReg[]) {
  const ativas = partes.filter((p) => !p.encerradaEm);
  const achados: Achado[] = [];
  const bfs = ativas.filter((p) => p.tipo === "beneficiario_final");
  const socios = pessoas.filter((p) => p.participacaoBp !== null);

  if (bfs.length === 0) achados.push({ codigo: "bf_ausente", gravidade: "pendencia", titulo: "Nenhum beneficiário final cadastrado", detalhe: "Cadastre a pessoa física que, direta ou indiretamente, é dona ou controla a empresa. Sem isso o Roteador de Serviços fica bloqueado." });
  for (const b of bfs) if (b.statusValidacao !== "validado") achados.push({ codigo: `bf_nao_validado_${b.id}`, gravidade: "pendencia", titulo: `${b.nome}: beneficiário final ainda em rascunho`, detalhe: "Falta conferência humana contra documento (contrato social, alteração ou declaração)." });

  if (socios.length > 0) {
    const soma = socios.reduce((a, s) => a + (s.participacaoBp ?? 0), 0);
    if (soma !== 10000) achados.push({ codigo: "soma_participacao", gravidade: "pendencia", titulo: `Participações somam ${(soma / 100).toLocaleString("pt-BR")}%`, detalhe: "As participações dos sócios cadastrados devem somar 100%. Confira o contrato social." });
    for (const s of socios) {
      if ((s.participacaoBp ?? 0) > LIMITE_BF_BP && !bfs.some((b) => b.nome.trim().toLowerCase() === s.nome.trim().toLowerCase()))
        achados.push({ codigo: `socio_sem_bf_${s.nome}`, gravidade: "alerta", titulo: `${s.nome} tem mais de 25% e não consta como beneficiário final`, detalhe: "Indicativo: critério usual de participação. Confirme o limite na norma da Receita antes de decidir; se for pessoa jurídica, identifique a pessoa física por trás." });
    }
  } else achados.push({ codigo: "sem_socios", gravidade: "pendencia", titulo: "Sócios sem participação informada", detalhe: "Cadastre os sócios e as participações na aba Sócios e responsáveis." });

  for (const p of ativas.filter((x) => x.tipo === "controle_efetivo"))
    if (!pessoas.some((s) => s.nome.trim().toLowerCase() === p.nome.trim().toLowerCase()))
      achados.push({ codigo: `controle_fora_contrato_${p.id}`, gravidade: "alerta", titulo: `${p.nome} exerce controle sem constar como sócio ou administrador`, detalhe: "Controle sem registro societário precisa de documento e de análise do contador antes de qualquer operação." });

  for (const p of ativas.filter((x) => x.tipo === "parte_relacionada" && x.tipoPessoa === "juridica"))
    achados.push({ codigo: `relacionada_${p.id}`, gravidade: "alerta", titulo: `Empresa relacionada: ${p.nome}`, detalhe: "Empresas ligadas por sócios ou controle podem somar limites e alterar o enquadramento (Simples, crédito, hospitalar). Peça análise ao contador. Esta tela não indica divisão de receita." });

  const pendencias = achados.filter((a) => a.gravidade === "pendencia");
  return {
    achados, pendencias: pendencias.length, alertas: achados.filter((a) => a.gravidade === "alerta").length,
    bloqueiaRoteador: pendencias.length > 0,
    motivoBloqueio: pendencias.length > 0 ? `Cadastro societário com ${pendencias.length} pendência(s): ${pendencias.map((p) => p.titulo).join("; ")}.` : null,
    totais: { beneficiariosFinais: bfs.length, controleEfetivo: ativas.filter((p) => p.tipo === "controle_efetivo").length, partesRelacionadas: ativas.filter((p) => p.tipo === "parte_relacionada").length },
  };
}
