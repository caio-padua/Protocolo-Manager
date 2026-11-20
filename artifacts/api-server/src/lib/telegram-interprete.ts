/**
 * Interpretação de linguagem natural no atendimento do Telegram.
 * A pessoa escreve do jeito dela; a IA só CLASSIFICA/EXTRAI (não escreve a resposta: quem fala são as frases
 * cadastradas). Nunca recebe CPF nem data de nascimento (a conferência de identidade é feita sem IA).
 * Falha da IA devolve null e o chamador usa o leitor de regras; nada é inventado.
 */
import { z } from "zod";
import { requireAiTenant } from "./ai-central";
import { logger } from "./logger";
import { registrarCustoProvedor } from "./mensageria-credito";
import { randomUUID } from "node:crypto";

const MODELO = "claude-haiku-5-5";
const MODELO_CONFERENTE = "claude-sonnet-5-5";
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
  confianca?: "alta" | "media" | "baixa";
}

export type Interpretar = (t: TarefaInterpretacao) => Promise<ResultadoInterpretacao | null>;
export type ConferirEscolha = (p: { texto: string; opcoes: string[]; escolha: number }) => Promise<boolean>;
export type ConferirLeitura = (p: { texto: string; proposta: string; opcoes: string[] }) => Promise<boolean>;
export type UsoIA = (etapa: "interprete" | "conferente") => void;

const Esquema = z.object({
  situacao: z.enum(["cliente", "nova", "incerto"]).nullish(),
  escolha: z.number().int().nullish(),
  recusou: z.boolean().nullish(),
  modalidade: z.enum(["online", "presencial"]).nullish(),
  periodo: z.enum(["manha", "tarde", "noite", "qualquer"]).nullish(),
  dias: z.union([z.array(z.number().int().min(0).max(6)), z.literal("qualquer")]).nullish(),
  confianca: z.enum(["alta", "media", "baixa"]).nullish(),
});
const EsquemaConferencia = z.object({ confirma: z.boolean() });

const DADO_PESSOAL = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/,
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
  /\b(?:19|20)\d{2}\b/,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
  /\b(cpf|nascimento|ano de nascimento|data de nascimento)\b/i,
];

/** Se a mensagem tiver identificador ou data numérica, nenhuma parte dela vai para o provedor. */
export function textoSeguroParaInterpretar(texto: string): string | null {
  const limitado = texto.trim().slice(0, 600);
  if (!limitado || DADO_PESSOAL.some((pattern) => pattern.test(limitado))) return null;
  const semNome = limitado
    .replace(/\b(?:meu nome (?:é|e)|me chamo|aqui (?:é|e))\s+[\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,4}/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return semNome || null;
}

function instrucao(t: TarefaInterpretacao, textoSeguro: string): string {
  const base = "Você interpreta mensagens de WhatsApp/Telegram de uma clínica brasileira. Responda SOMENTE com um objeto JSON, sem texto extra. Se a mensagem não permitir concluir, use null (ou \"incerto\"). Nunca invente.";
  const confidence = ` Inclua "confianca":"alta"|"media"|"baixa".`;
  if (t.tipo === "vinculo") return `${base}\nPergunta feita: a pessoa já é cliente (já se consultou/tem cadastro) ou será a primeira consulta?\nMensagem: """${textoSeguro}"""\nJSON: {"situacao":"cliente"|"nova"|"incerto","confianca":"alta"|"media"|"baixa"}`;
  if (t.tipo === "escolha") return `${base}\nA pessoa recebeu estas opções de horário:\n${t.opcoes.map((o, i) => `${i + 1}) ${o}`).join("\n")}\nDescubra qual opção ela escolheu (número a partir de 1) ou se recusou todas / pediu outros horários.\nMensagem: """${textoSeguro}"""\nJSON: {"escolha":número|null,"recusou":true|false,"confianca":"alta"|"media"|"baixa"}`;
  return `${base}${confidence}\nHoje é ${t.hojeISO}. Extraia as preferências de agendamento.\nMensagem: """${textoSeguro}"""\nJSON: {"modalidade":"online"|"presencial"|null,"periodo":"manha"|"tarde"|"noite"|"qualquer"|null,"dias":[0-6 (0=domingo)]|"qualquer"|null,"confianca":"alta"|"media"|"baixa"}`;
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

export function criarInterpretador(empresaId: number, inboxMessageId?: number, onUso?: UsoIA): Interpretar {
  let chamadas = 0;
  return async (t) => {
    const textoSeguro = textoSeguroParaInterpretar(t.texto);
    if (!textoSeguro) return null;
    let etapaIniciada = false;
    let chaveCusto = "";
    try {
      const c = await obterCliente();
      if (!c) return null;
      const { headers } = requireAiTenant(empresaId, "agent");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PRAZO_MS);
      try {
        chamadas += 1;
        etapaIniciada = true;
        chaveCusto = inboxMessageId ? `telegram:${inboxMessageId}:interprete:${t.tipo}:${chamadas}` : `telegram:interprete:${randomUUID()}`;
        onUso?.("interprete");
        const msg = await c.messages.create(
          { model: MODELO, max_tokens: 180, system: instrucao(t, textoSeguro), messages: [{ role: "user", content: "Classifique somente a mensagem e devolva o JSON solicitado." }] },
          { headers, signal: ctrl.signal },
        );
        await registrarCustoProvedor({
          empresaId,
          chave: chaveCusto,
          etapa: "telegram_interprete",
          provedor: "anthropic",
          modelo: MODELO,
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
        });
        const bruto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        const json = /\{[\s\S]*\}/.exec(bruto)?.[0];
        if (!json) return null;
        const r = Esquema.parse(JSON.parse(json));
        return { ...r, situacao: r.situacao === "incerto" ? null : r.situacao } as ResultadoInterpretacao;
      } finally { clearTimeout(timer); }
    } catch (err) {
      if (etapaIniciada) await registrarCustoProvedor({
        empresaId, chave: chaveCusto, etapa: "telegram_interprete", provedor: "anthropic", modelo: MODELO,
      });
      logger.warn({ errorType: err instanceof Error ? err.constructor.name : typeof err }, "[telegram-interprete] IA indisponível; usando leitura por regras");
      return null;
    }
  };
}

export function criarConferente(empresaId: number, inboxMessageId?: number, onUso?: UsoIA): ConferirEscolha {
  const conferir = criarConferenteLeitura(empresaId, inboxMessageId, onUso);
  return (p) => conferir({
    texto: p.texto,
    opcoes: p.opcoes,
    proposta: `A pessoa escolheu a opção ${p.escolha}.`,
  });
}

export function criarConferenteLeitura(empresaId: number, inboxMessageId?: number, onUso?: UsoIA): ConferirLeitura {
  let chamadas = 0;
  return async (p) => {
    const textoSeguro = textoSeguroParaInterpretar(p.texto);
    if (!textoSeguro || !p.proposta || p.proposta.length > 300 || p.opcoes.length > 8) return false;
    let etapaIniciada = false;
    let chaveCusto = "";
    try {
      const c = await obterCliente();
      if (!c) return false;
      const { headers } = requireAiTenant(empresaId, "agent");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PRAZO_MS);
      try {
        chamadas += 1;
        etapaIniciada = true;
        chaveCusto = inboxMessageId ? `telegram:${inboxMessageId}:conferente:${chamadas}` : `telegram:conferente:${randomUUID()}`;
        onUso?.("conferente");
        const msg = await c.messages.create(
          {
            model: MODELO_CONFERENTE,
            max_tokens: 80,
            system: `Você confere, sem reinterpretar dados pessoais, se a leitura proposta corresponde à mensagem da pessoa. Responda somente JSON {"confirma":true} ou {"confirma":false}. Se houver dúvida, recusa, ambiguidade ou divergência, use false. Opções disponíveis: ${p.opcoes.map((opcao, i) => `${i + 1}) ${opcao}`).join("\n")}. Leitura proposta: ${p.proposta}.`,
            messages: [{ role: "user", content: `Mensagem sem dados pessoais: """${textoSeguro}"""` }],
          },
          { headers, signal: ctrl.signal },
        );
        await registrarCustoProvedor({
          empresaId,
          chave: chaveCusto,
          etapa: "telegram_conferente",
          provedor: "anthropic",
          modelo: MODELO_CONFERENTE,
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
        });
        const raw = msg.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
        const json = /\{[\s\S]*\}/.exec(raw)?.[0];
        return json ? EsquemaConferencia.parse(JSON.parse(json)).confirma : false;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (etapaIniciada) await registrarCustoProvedor({
        empresaId, chave: chaveCusto, etapa: "telegram_conferente", provedor: "anthropic", modelo: MODELO_CONFERENTE,
      });
      logger.warn({ errorType: err instanceof Error ? err.constructor.name : typeof err }, "[telegram-conferente] falha; ação bloqueada");
      return false;
    }
  };
}
