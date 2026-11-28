/**
 * Homologação operacional: envia UM e-mail clínico real.
 * Nunca habilitar na suíte comum nem usar repetição automática.
 * Destino e documento vêm exclusivamente do protocolo autorizado.
 */
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dosePrescritaParaDocumento } from "../artifacts/api-server/src/lib/protocol-dose-presentation";

const enabled = process.env.RAS_FAP_REAL_SEND === "1";
const protocolId = Number(process.env.RAS_FAP_PROTOCOL_ID);
const output = "generated-artifacts/ras-fap-real";

type EmailLog = { id: number; status: string; criadoEm: string };

test.use({
  timezoneId: "America/Sao_Paulo",
  trace: "off",
  video: "off",
  screenshot: "off",
});

test.describe("RAS FAP — histórico de um reenvio real autorizado", () => {
  test.skip(!enabled, "Envio real desativado; exige autorização explícita.");
  test.describe.configure({ retries: 0 });

  test("atualiza abaixo do botão e persiste após recarregar", async ({ page, request }) => {
    test.setTimeout(180_000);
    expect(Number.isSafeInteger(protocolId) && protocolId > 0).toBe(true);
    const identifier = process.env.PAXTER_OPERATOR_LOGIN_RETRY || process.env.PAXTER_OPERATOR_LOGIN;
    const password = process.env.PAXTER_OPERATOR_PASSWORD;
    if (!identifier || !password) throw new Error("Credenciais operacionais não configuradas.");

    const login = await request.post("/api/collaborator/login", {
      data: { identifier, password },
    });
    expect(login.status(), "Login normal deve autorizar a sessão.").toBe(200);
    const session = await login.json();
    expect(typeof session.token).toBe("string");
    const headers = { Authorization: `Bearer ${session.token}` };
    const path = `/api/ras/physical/${protocolId}/email-logs`;

    const gmail = await request.get("/api/email/status", { headers });
    expect(gmail.status()).toBe(200);
    expect((await gmail.json()).configured).toBe(true);
    const protocol = await request.get(`/api/protocols/${protocolId}`, { headers });
    expect(protocol.status()).toBe(200);
    const details = await protocol.json();
    expect(details.professionalId).toBe(session.professional.id);
    expect(details.items.length).toBeGreaterThan(0);
    expect(details.items.every((item: { dose: string }) =>
      Boolean(dosePrescritaParaDocumento(item.dose))),
    "Dose ambígua exige revisão clínica, nunca ajuste automático pelo teste.").toBe(true);
    const clientResponse = await request.get(`/api/clients/${details.clientId}`, { headers });
    expect(clientResponse.status()).toBe(200);
    const client = await clientResponse.json();
    expect(Boolean(client.email?.trim())).toBe(true);
    const locationsResponse = await request.get("/api/locations", { headers });
    const companiesResponse = await request.get("/api/empresas", { headers });
    expect(locationsResponse.status()).toBe(200);
    expect(companiesResponse.status()).toBe(200);
    const locations = await locationsResponse.json();
    const companies = await companiesResponse.json();
    const normalize = (value: string) =>
      value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const clinicNames = [
      ...locations.filter((l: { empresaId: number }) => l.empresaId === client.empresaId)
        .map((l: { name: string }) => l.name),
      ...companies.filter((c: { id: number }) => c.id === client.empresaId)
        .map((c: { nome: string }) => c.nome),
    ];
    expect(!details.unit || clinicNames.some(name =>
      name && normalize(name) === normalize(details.unit)),
    "Unidade divergente bloqueia o teste antes do envio.").toBe(true);
    const before = await request.get(path, { headers });
    expect(before.status()).toBe(200);
    const original: EmailLog[] = (await before.json()).items;
    expect(Array.isArray(original)).toBe(true);
    const ids = new Set(original.map(item => item.id));

    await page.addInitScript(({ token, professional }) => {
      localStorage.setItem("padcom_collab_token", token);
      localStorage.setItem("padcom_collab_prof", JSON.stringify(professional));
    }, session);
    const initialRead = page.waitForResponse(response => response.url().endsWith(path));
    await page.goto(`/protocols/${protocolId}`);
    expect((await initialRead).status()).toBe(200);
    const button = page.getByRole("button", { name: "Reenviar RASP FAP", exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const panel = button.locator("..");

    let sends = 0;
    let navigations = 0;
    const sendPath = `/api/ras/physical/${protocolId}/reenviar-email`;
    page.on("request", req => {
      if (new URL(req.url()).pathname === sendPath && req.method() === "POST") sends++;
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) navigations++;
    });
    const post = page.waitForResponse(response =>
      new URL(response.url()).pathname === sendPath && response.request().method() === "POST",
      { timeout: 120_000 },
    );
    const refreshed = page.waitForResponse(response =>
      response.url().endsWith(path) && response.request().method() === "GET",
      { timeout: 120_000 },
    ).catch(() => null);
    await button.click();
    const sent = await post;
    expect(sent.status(), "Não repetir o envio se a confirmação falhar.").toBe(200);
    expect((await sent.json()).success).toBe(true);
    const freshResponse = await refreshed;
    if (!freshResponse) throw new Error("Histórico não foi atualizado; conferir antes de reenviar.");
    expect(freshResponse.status()).toBe(200);
    const fresh: EmailLog[] = (await freshResponse.json()).items;
    const created = fresh.filter(item => !ids.has(item.id));
    expect(created).toHaveLength(1);
    const last = created[0];
    expect(last.status).toBe("enviado");
    expect(fresh[0].id).toBe(last.id);
    const date = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
    }).format(new Date(last.criadoEm));
    await expect(panel).toContainText(`Último reenvio: ${date}`);
    expect(sends).toBe(1);
    expect(navigations).toBe(0);
    await mkdir(output, { recursive: true });
    await panel.screenshot({ path: `${output}/apos-reenvio.png` });

    const reread = page.waitForResponse(response => response.url().endsWith(path));
    await page.reload();
    const persistedResponse = await reread;
    expect(persistedResponse.status()).toBe(200);
    const persisted: EmailLog[] = (await persistedResponse.json()).items;
    expect(persisted[0].id).toBe(last.id);
    expect(persisted[0].criadoEm).toBe(last.criadoEm);
    await expect(panel).toContainText(`Último reenvio: ${date}`);
    expect(sends).toBe(1);
    await panel.screenshot({ path: `${output}/apos-recarregar.png` });
    await writeFile(`${output}/resultado.json`, JSON.stringify({
      protocolId, logId: last.id, status: last.status, criadoEm: last.criadoEm,
      previousCount: original.length, persistedCount: persisted.length,
      sends, visibleWithoutReload: true, persistedAfterReload: true,
      recipientDelivery: "Não confirmada por este teste; depende da caixa do destinatário.",
    }, null, 2));
  });
});
