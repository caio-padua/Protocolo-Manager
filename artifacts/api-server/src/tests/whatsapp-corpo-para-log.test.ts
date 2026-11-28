import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock("@workspace/db", () => ({
  whatsappMensagensLogTable: { id: "id" },
  clientsTable: {},
  db: {
    insert: () => ({
      values: (v: any) => {
        captured.rows.push(v);
        return { returning: async () => [{ id: captured.rows.length }] };
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock("../lib/secure-settings", () => ({
  getSecret: async (key: string) => ({
    "twilio.accountSid": "ACteste", "twilio.authToken": "token-de-teste", "twilio.whatsappFrom": "+14155238886",
  } as Record<string, string>)[key] ?? null,
}));
vi.mock("../lib/telegram", () => ({ sendTelegram: vi.fn(async () => ({ sent: true, mock: true })) }));

import { sendWhatsapp } from "../lib/whatsapp";

afterEach(() => { captured.rows.length = 0; vi.unstubAllGlobals(); });

describe("WhatsApp: corpo mascarado no log (K8, chave nunca em texto puro no banco)", () => {
  const stubTwilio = () => {
    const fetchMock = vi.fn(async (_url: string, init?: any) => ({
      ok: true, status: 200,
      json: async () => ({ sid: "SMteste", status: "queued", body: init?.body }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("com corpoParaLog: o Twilio recebe a mensagem inteira, o log guarda só o texto mascarado", async () => {
    const fetchMock = stubTwilio();
    const result = await sendWhatsapp("+5511999990001", "Sua chave é 482913.", {
      contexto: "chave_visita", mirrorTelegram: false, corpoParaLog: "[chave omitida do log]",
    });
    expect(result.sent).toBe(true);
    const sentBody = String((fetchMock.mock.calls[0] as any[])[1].body);
    expect(decodeURIComponent(sentBody.replace(/\+/g, " "))).toContain("482913");
    expect(captured.rows.length).toBeGreaterThan(0);
    expect(captured.rows.every((r) => r.corpo === "[chave omitida do log]")).toBe(true);
    expect(JSON.stringify(captured.rows)).not.toContain("482913");
  }, 20_000);

  it("sem corpoParaLog: comportamento anterior preservado (log guarda o corpo real)", async () => {
    stubTwilio();
    await sendWhatsapp("+5511999990001", "Mensagem comum de lembrete", { contexto: "manual", mirrorTelegram: false });
    expect(captured.rows[0].corpo).toBe("Mensagem comum de lembrete");
  }, 20_000);
});
