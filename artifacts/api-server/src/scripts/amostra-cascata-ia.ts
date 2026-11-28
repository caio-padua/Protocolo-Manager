/** Amostra ISOLADA com perguntas sintéticas e IA real (sem banco, sem envio). Mede chamadas e tokens. */
import Anthropic from "@anthropic-ai/sdk";
import { executarCascata } from "../lib/atendimento-cascata";
import { criarIAsCascata } from "../lib/atendimento-cascata-ia";
const cli = new Anthropic({ apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
const ias = criarIAsCascata(cli as any);
const base = [{ tema: "Horário de atendimento", resposta: "Atendemos de segunda a sexta, das 8h às 18h." }, { tema: "Endereço", resposta: "Rua Exemplo, 100, Centro." }, { tema: "Estacionamento", resposta: "Há convênio com o estacionamento ao lado." }];
const perguntas = ["Vocês abrem aos sábados?", "Onde fica a clínica e tem estacionamento?", "Tem como pagar em 10 vezes o tratamento completo?", "Qual o telefone do doutor?", "Preciso remarcar e saber o endereço", "Posso tomar a injeção com remédio de pressão?", "Estou com dor no peito"];
let tIn = 0, tOut = 0, chamadas = 0;
for (const texto of perguntas) {
  const r = await executarCascata({ empresaId: 5, clienteId: 1, clinicaConfirmada: true, canal: "whatsapp", texto }, {
    controle: async () => "automatico", buscarSinapse: async () => null, baseClinica: async () => base, sanitizar: (t) => t, ...ias });
  for (const x of [r.parecer1, r.parecer2, r.parecer3]) if (x?.uso) { tIn += x.uso.inputTokens ?? 0; tOut += x.uso.outputTokens ?? 0; chamadas++; }
  console.log(`| ${texto} | ${r.acao} | ${r.estagio} | IA:${r.chamadasIA} | ${r.motivo} | ${(r.resposta ?? "").slice(0, 70)} |`);
}
console.log(`TOTAL chamadas=${chamadas} tokens_entrada=${tIn} tokens_saida=${tOut}`);
