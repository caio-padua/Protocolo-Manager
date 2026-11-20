/**
 * Interpretação de linguagem natural no atendimento do Telegram.
 * A pessoa escreve do jeito dela; a IA só CLASSIFICA/EXTRAI (não escreve a resposta: quem fala são as frases
 * cadastradas). Nunca recebe CPF nem data de nascimento (a conferência de identidade é feita sem IA).
 * Falha da IA devolve null e o chamador usa o leitor de regras; nada é inventado.
 */
import { z } from "zod";
import { requireAiTenant, logAiUsage } from "./ai-central";
import { logger } from "./logger";

const MODELO = "claude-haiku-5-5";
const PRAZO_MS = 9000;

export type TarefaInterpretacao =
  | { tipo: "vinculo"; texto: string }
  | { tipo: "escolha"; texto: string; opcoes: string[] }
  | { tipo: "preferencias"; texto: string; hojeISO: string };

export interface ResultadoInterpretacao {
  situacao?: "cliente" | "nova" | null;
  escolha?: number | null;
  recusou?: boolean;
  modalidade?: "online" | "presencial" | null;
  periodo?: "manha" | "tarde" | "noite" | "qualquer" | null;
  /** 0=domingo..6=sábado; "qualquer" = sem preferência de dia. */
  dias?: number[] | "qualquer" | null;
}

export type Interpretar = (t: TarefaInterpretacao) => Promise<ResultadoInterpretacao | null>;

const Esquema = z.object({
  situacao: z.enum(["cliente", "nova", "incerto"]).nullish(),
  escolha: z.number().int().nullish(),
  recusou: z.boolean().nullish(),
  modalidade: z.enum(["online", "presencial"]).nullish(),
  periodo: z.enum(["manha", "tarde", "noite", "qualquer"]).nullish(),
  dias: z.union([z.array(z.number().int().min(0).max(6)), z.literal("qualquer")]).nullish(),
});

function instrucao(t: TarefaInterpretacao): string {
  const base = "Você interpreta mensagens de WhatsApp/Telegram de uma clínica brasileira. Responda SOMENTE com um objeto JSON, sem texto extra. Se a mensagem não permitir concluir, use null (ou \"incerto\"). Nunca invente.";
  if (t.tipo === "vinculo") return `${base}\nPergunta feita: a pessoa já é cliente (já se consultou/tem cadastro) ou será a primeira consulta?\nJSON: {"situacao":"cliente"|"nova"|"incerto"}`;
  if (t.tipo === "escolha") return `${base}\nA pessoa recebeu estas opções de horário:\n${t.opcoes.map((o, i) => `${i + 1}) ${o}`).join("\n")}\nDescubra qual opção ela escolheu (número a partir de 1) ou se recusou todas / pediu outros horários.\nJSON: {"escolha":número|null,"recusou":true|false}`;
  return `${base}\nHoje é ${t.hojeISO}. Extraia as preferências de agendamento.\nJSON: {"modalidade":"online"|"presencial"|null,"periodo":"manha"|"tarde"|"noite"|"qualquer"|null,"dias":[0-6 (0=domingo)]|"qualquer"|null}`;
}

let cliente: import("@anthropic-ai/sdk").default | null | undefined;
async function obterCliente() {
  if (cliente !== undefined) return cliente;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey || !baseURL) { cliente = null; return cliente; }
  const sdk = await import("@anthropic-ai/sdk");
  cliente = new sdk.default({ apiKey, baseURL });
  return cliente;
}

export function criarInterpretador(empresaId: number): Interpretar {
  return async (t) => {
    try {
      const c = await obterCliente();
      if (!c) return null;
      const { headers } = requireAiTenant(empresaId, "agent");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PRAZO_MS);
      try {
        const msg = await c.messages.create(
          { model: MODELO, max_tokens: 200, system: instrucao(t), messages: [{ role: "user", content: t.texto.slice(0, 600) }] },
          { headers, signal: ctrl.signal },
        );
        void logAiUsage({ empresaId, provider: "anthropic", tipo: "agent", inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens });
        const bruto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        const json = /\{[\s\S]*\}/.exec(bruto)?.[0];
        if (!json) return null;
        const r = Esquema.parse(JSON.parse(json));
        return { ...r, situacao: r.situacao === "incerto" ? null : r.situacao } as ResultadoInterpretacao;
      } finally { clearTimeout(timer); }
    } catch (err) {
      logger.warn({ errorType: err instanceof Error ? err.constructor.name : typeof err }, "[telegram-interprete] IA indisponível; usando leitura por regras");
      return null;
    }
  };
}
