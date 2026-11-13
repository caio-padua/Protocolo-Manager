import { describe, it, expect, vi } from "vitest";
import { repassarMensagemAoCeo, escaparHtmlTelegram, formatarCpfDisplay, type RepasseCeoDeps } from "../lib/telegram-relay-ceo";

const base = { chatIdCeo: "1000", chatIdRemetente: "2000", clienteId: 7, nome: "Fulano de Tal", cpfDisplay: "000.000.000-00", texto: "ola" };
function deps(enviar: RepasseCeoDeps["enviar"]) {
  const log = { info: vi.fn(), warn: vi.fn() };
  return { d: { enviar, log } as RepasseCeoDeps, log };
}

describe("repassarMensagemAoCeo", () => {
  it("entregue: registra info e devolve entregue", async () => {
    const enviar = vi.fn().mockResolvedValue({ sent: true, mock: false });
    const { d, log } = deps(enviar);
    expect(await repassarMensagemAoCeo(base, d)).toEqual({ kind: "entregue" });
    expect(enviar).toHaveBeenCalledWith("1000", expect.stringContaining("Mensagem via Telegram"));
    expect(enviar.mock.calls[0][1]).not.toContain("Fulano de Tal");
    expect(log.info).toHaveBeenCalledOnce();
    expect(log.warn).not.toHaveBeenCalled();
  });
  it("remetente igual ao chat do CEO: NAO envia (sem eco)", async () => {
    const enviar = vi.fn();
    const { d, log } = deps(enviar);
    expect(await repassarMensagemAoCeo({ ...base, chatIdRemetente: "1000" }, d)).toEqual({ kind: "omitido_remetente_e_ceo" });
    expect(enviar).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledOnce();
  });
  it("recusado pelo Telegram: falhou + aviso com motivo", async () => {
    const { d, log } = deps(vi.fn().mockResolvedValue({ sent: false, mock: false, error: "telegram_http_400" }));
    expect(await repassarMensagemAoCeo(base, d)).toEqual({ kind: "falhou", erro: "telegram_http_400" });
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ erro: "telegram_http_400" }), expect.any(String));
  });
  it("simulado (sem token) nunca conta como entregue", async () => {
    const { d, log } = deps(vi.fn().mockResolvedValue({ sent: true, mock: true }));
    expect(await repassarMensagemAoCeo(base, d)).toEqual({ kind: "simulado" });
    expect(log.warn).toHaveBeenCalledOnce();
  });
  it("excecao no envio: falhou, nao propaga", async () => {
    const { d } = deps(vi.fn().mockRejectedValue(new Error("rede caiu")));
    expect(await repassarMensagemAoCeo(base, d)).toEqual({ kind: "falhou", erro: "rede caiu" });
  });
  it("envio sem resultado (undefined) e falha, nao sucesso", async () => {
    const { d } = deps(vi.fn().mockResolvedValue(undefined));
    expect(await repassarMensagemAoCeo(base, d)).toEqual({ kind: "falhou", erro: "sem_resultado" });
  });
  it("texto com < & > e escapado (senao o Telegram recusa em HTML)", async () => {
    const enviar = vi.fn().mockResolvedValue({ sent: true, mock: false });
    const { d } = deps(enviar);
    await repassarMensagemAoCeo({ ...base, texto: "a<b & c>d" }, d);
    expect(enviar.mock.calls[0][1]).toContain("a&lt;b &amp; c&gt;d");
    expect(escaparHtmlTelegram("<x>")).toBe("&lt;x&gt;");
  });
  it("log nunca contem o texto da mensagem", async () => {
    const { d, log } = deps(vi.fn().mockResolvedValue({ sent: true, mock: false }));
    await repassarMensagemAoCeo({ ...base, texto: "segredo-clinico-123" }, d);
    expect(JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls])).not.toContain("segredo-clinico-123");
  });
  it.each(["12345678900", "123.456.789-00", "123 456 789 00", null, "", "valor-invalido-12345678900"])(
    "o antigo formatador realmente oculta e nunca ecoa o CPF (%s)", cpf => {
      const r = formatarCpfDisplay(cpf);
      expect(r).toBe("***.***.***-**");
      expect(r).not.toMatch(/\d/);
    },
  );
  it("alerta inteiro não contém CPF, nome completo, telefone ou e-mail sintéticos", async () => {
    const enviar = vi.fn().mockResolvedValue({ sent: true, mock: false });
    const { d, log } = deps(enviar);
    const texto = "Teste não clínico: 12345678900 / 123.456.789-00 / (11) 99999-8888 / exemplo@teste.invalid";
    await repassarMensagemAoCeo({ ...base, cpfDisplay: "123.456.789-00", texto }, d);
    const alerta = enviar.mock.calls[0][1] as string;
    for (const segredo of ["12345678900", "123.456.789-00", "99999-8888", "exemplo@teste.invalid", base.nome, base.chatIdRemetente]) {
      expect(alerta).not.toContain(segredo);
      expect(JSON.stringify([log.info.mock.calls, log.warn.mock.calls])).not.toContain(segredo);
    }
    expect(alerta).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    expect(alerta).not.toContain("<b>CPF:</b>");
    expect(alerta).toContain("Teste não clínico");
    expect(texto).toContain("12345678900"); // original preservado
  });
});
