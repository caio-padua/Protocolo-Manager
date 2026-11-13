/**
 * Simulação mínima das consultas do outbox do repasse (telegram_repasse_ceo) para testes de ROTA
 * com banco simulado. O comportamento SQL real está em telegram-repasse-banco-descartavel.test.ts.
 */
export const linhaOutboxFake: Record<string, unknown> = {
  inbox_message_id: 50, chat_id_destino: "CEO_OUTRO_CHAT", tentativas: 1,
  texto: "mensagem de teste", chat_id_remetente: "999888777", cliente_id: 42, nome: "Ana Lima", cpf: "12345678900",
};

/** reivindica=false emula repasse já aceito/fechado (a tentativa não reivindica nada). */
export const configOutboxFake: { reivindica: boolean; falhaRegistro: (Error & { code?: string }) | null } = { reivindica: true, falhaRegistro: null };

export function respostaOutboxFake(q: unknown): { rows: unknown[] } | null {
  const strings = (q as { strings?: readonly string[] } | null)?.strings;
  if (!strings) return null;
  const t = strings.join("?");
  if (!t.includes("telegram_repasse_ceo")) return null;
  if (t.includes("INSERT INTO telegram_repasse_ceo")) {
    if (configOutboxFake.falhaRegistro) throw configOutboxFake.falhaRegistro;
    return { rows: [{ id: 9 }] };
  }
  if (t.includes("SET estado = 'enviando'")) return { rows: configOutboxFake.reivindica ? [{ tentativas: 1 }] : [] };
  if (t.includes("FROM telegram_repasse_ceo r")) return { rows: [{ id: 9, ...linhaOutboxFake }] };
  return { rows: [] };
}
