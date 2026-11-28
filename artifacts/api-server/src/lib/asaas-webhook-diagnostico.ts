import { asaasListWebhooks } from "./asaas.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Eventos que a rota local /api/asaas/webhook de fato trata; os demais respondem 200 sem efeito.
export const EVENTOS_TRATADOS = [
  "PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED",
];

/** Diagnostico SOMENTE LEITURA do webhook de producao: nunca cria, edita nem reativa nada. */
export async function diagnosticarWebhookAsaas() {
  const hooks = await asaasListWebhooks();
  const lista = hooks.map((h: any) => {
    let host = "(url invalida)";
    let path = "";
    try { const u = new URL(String(h.url)); host = u.host; path = u.pathname; } catch { /* mantem */ }
    const eventos: string[] = Array.isArray(h.events) ? h.events : [];
    return {
      id: h.id, nome: h.name, host, path, habilitado: h.enabled === true, interrompido: h.interrupted === true,
      temAuthToken: Boolean(h.authToken), sendType: h.sendType ?? null, totalEventos: eventos.length,
      tratadosPelaRota: eventos.filter((e) => EVENTOS_TRATADOS.includes(e)),
      ignoradosPelaRota: eventos.filter((e) => !EVENTOS_TRATADOS.includes(e)).length,
    };
  });
  const base = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ?? null;
  const [loc]: any[] = (await db.execute(sql`SELECT
      (SELECT COUNT(*)::int FROM payments WHERE asaas_charge_id IS NOT NULL) AS pagamentos_com_cobranca,
      (SELECT COUNT(*)::int FROM scheduling_requests WHERE asaas_charge_id IS NOT NULL) AS agendamentos_com_cobranca,
      (SELECT COUNT(*)::int FROM asaas_cobrancas_teste WHERE asaas_charge_id IS NOT NULL) AS testes_com_cobranca`)).rows;
  return {
    webhooks: lista,
    rotaLocal: "/api/asaas/webhook",
    dominioDestesAmbiente: base,
    destinoApontaParaEsteAmbiente: lista.map((l) => ({ id: l.id, igual: base !== null && l.host === base })),
    contagemLocal: loc,
    planoReplaySeguro: [
      "Nao ha historico de eventos consultavel por API: replay por reenvio do Asaas so existe no painel dele.",
      "Reconciliar por LEITURA (GET da cobranca) em vez de reenviar eventos: botao Sincronizar do laboratorio e conciliacao.",
      "A rota e idempotente por cobranca (marcar pago repetido nao duplica); evento desconhecido responde 200 sem efeito.",
      "Antes de religar: apontar para o dominio PUBLICADO (hoje indisponivel), definir authToken no cofre e na conta, testar com UMA cobranca de teste.",
    ],
  };
}
