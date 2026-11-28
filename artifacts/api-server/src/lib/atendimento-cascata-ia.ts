/**
 * Adaptadores das IAs da cascata (ISOLADOS: nenhum webhook os usa). Recebem o cliente do provedor por parâmetro,
 * devolvem sempre JSON validado e medem tokens. A IA só pode ESCOLHER/ADAPTAR dentro da base aprovada da clínica;
 * nunca opina clinicamente. Qualquer saída fora do formato vira erro (a cascata encaminha para humano).
 */
import type { BaseClinicaItem, ParecerIA, DepsCascata } from "./atendimento-cascata";

export interface ClienteMensagens {
  messages: { create: (args: any) => Promise<{ content: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }> };
}
export interface ModelosCascata { ia1: string; ia2: string; ia3: string }
export const MODELOS_PADRAO: ModelosCascata = { ia1: "claude-haiku-4-5", ia2: "claude-sonnet-4-6", ia3: "claude-sonnet-4-6" };

const REGRAS = `Você atende mensagens de clientes de uma clínica brasileira. REGRAS ABSOLUTAS:
- Nunca dê diagnóstico, dose, prescrição, troca ou suspensão de remédio, nem interprete exame ou sintoma. Nesses casos use "encaminhar".
- Nunca invente horário, preço, endereço ou política. Só use o que estiver na BASE APROVADA abaixo; se não estiver lá, use "encaminhar".
- Se houver dúvida, dois pedidos na mesma mensagem ou urgência, use "encaminhar" e confianca baixa.
- Resposta curta, educada, sem números de telefone, CPF ou e-mail.
- Responda SOMENTE com um objeto JSON, sem texto extra.`;

const baseTexto = (b: BaseClinicaItem[]) => b.length ? b.map((x, i) => `${i + 1}. ${x.tema}: ${x.resposta}`).join("\n") : "(vazia)";
const FORMATO = `{"acao":"responder"|"encaminhar","intencao":"texto curto","resposta":"texto ou null","confianca":0.0-1.0,"duvida":true|false,"composto":true|false,"motivo":"curto"`;

function extrairJson(t: string): Record<string, unknown> | null {
  const i = t.indexOf("{"), f = t.lastIndexOf("}");
  if (i < 0 || f < i) return null;
  try { const o = JSON.parse(t.slice(i, f + 1)); return o && typeof o === "object" ? o as Record<string, unknown> : null; } catch { return null; }
}
function paraParecer(o: Record<string, unknown>, uso: ParecerIA["uso"]): ParecerIA {
  const conf = Number(o.confianca);
  if (o.acao !== "responder" && o.acao !== "encaminhar") throw new Error("acao_invalida");
  if (!Number.isFinite(conf) || conf < 0 || conf > 1) throw new Error("confianca_invalida");
  return {
    acao: o.acao, intencao: typeof o.intencao === "string" ? o.intencao.slice(0, 60) : undefined,
    resposta: typeof o.resposta === "string" ? o.resposta : null, confianca: conf,
    duvida: o.duvida === true, composto: o.composto === true, concorda: typeof o.concorda === "boolean" ? o.concorda : undefined,
    riscos: Array.isArray(o.riscos) ? o.riscos.filter((x): x is string => typeof x === "string").slice(0, 5) : undefined,
    motivo: typeof o.motivo === "string" ? o.motivo.slice(0, 200) : undefined, uso,
  };
}

async function chamar(cli: ClienteMensagens, modelo: string, prompt: string, maxTokens: number): Promise<{ o: Record<string, unknown>; uso: ParecerIA["uso"] }> {
  const m = await cli.messages.create({ model: modelo, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] });
  const texto = m.content.find((c) => c.type === "text")?.text ?? "";
  const o = extrairJson(texto);
  if (!o) throw new Error("json_invalido");
  return { o, uso: { modelo, inputTokens: m.usage?.input_tokens ?? null, outputTokens: m.usage?.output_tokens ?? null } };
}

export function criarIAsCascata(cli: ClienteMensagens, modelos: ModelosCascata = MODELOS_PADRAO): Pick<DepsCascata, "ia1" | "ia2" | "ia3"> {
  return {
    ia1: async ({ texto, base }) => {
      const { o, uso } = await chamar(cli, modelos.ia1, `${REGRAS}\n\nBASE APROVADA:\n${baseTexto(base)}\n\nMensagem do cliente: """${texto}"""\nFormato: ${FORMATO}}`, 400);
      return paraParecer(o, uso);
    },
    ia2: async ({ texto, base, parecer1 }) => {
      const { o, uso } = await chamar(cli, modelos.ia2, `${REGRAS}\n\nVocê é a AUDITORA. Revise de forma independente a proposta da IA 1 e aponte riscos.\nBASE APROVADA:\n${baseTexto(base)}\n\nMensagem: """${texto}"""\nProposta da IA 1: ${JSON.stringify({ acao: parecer1.acao, resposta: parecer1.resposta, confianca: parecer1.confianca })}\nFormato: ${FORMATO},"concorda":true|false,"riscos":["..."]}`, 500);
      return paraParecer(o, uso);
    },
    ia3: async ({ texto, base, parecer1, parecer2 }) => {
      const { o, uso } = await chamar(cli, modelos.ia3, `${REGRAS}\n\nVocê é a JUÍZA. A IA 1 e a IA 2 divergiram ou tiveram dúvida. Decida o caminho mais seguro e resolutivo SEM sair da base aprovada.\nBASE APROVADA:\n${baseTexto(base)}\n\nMensagem: """${texto}"""\nParecer IA 1: ${JSON.stringify({ acao: parecer1.acao, resposta: parecer1.resposta, confianca: parecer1.confianca, motivo: parecer1.motivo })}\nParecer IA 2: ${JSON.stringify({ acao: parecer2.acao, concorda: parecer2.concorda, riscos: parecer2.riscos, motivo: parecer2.motivo })}\nFormato: ${FORMATO}}`, 600);
      return paraParecer(o, uso);
    },
  };
}
