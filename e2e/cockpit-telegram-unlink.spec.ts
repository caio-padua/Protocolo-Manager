import { test, expect } from "@playwright/test";

const patient = {
  id: 42, name: "Paciente de Teste", cpf: "", phone: "", email: "paciente@example.test",
  photoUrl: null, birthDate: null, address: null, notes: null,
  status: "active", telegramChatId: "123456789", telegramLinked: true,
};

for (const scenario of ["sucesso", "cancelar", "404", "500", "rede", "nao-vinculado"] as const) {
  test(`Telegram no cockpit: ${scenario}`, async ({ page }, testInfo) => {
    let linked = scenario !== "nao-vinculado";
    let deletes = 0;
    await page.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "e2e-fake-token");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Colaborador Teste", role: "medico" }));
    });
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      const json = (body: unknown, status = 200) => route.fulfill({
        status, contentType: "application/json", body: JSON.stringify(body),
      });
      if (url.pathname === "/api/collaborator/me") {
        return json({ professional: { id: 1, name: "Colaborador Teste", role: "medico" } });
      }
      if (url.pathname === "/api/clients/42/telegram" && route.request().method() === "DELETE") {
        deletes++;
        expect(route.request().headers().authorization).toBe("Bearer e2e-fake-token");
        if (scenario === "rede") return route.abort();
        if (scenario === "404" || scenario === "500") return json({ error: "Erro de teste" }, Number(scenario));
        linked = false;
        return json({ ok: true });
      }
      const client = { ...patient, telegramLinked: linked, telegramChatId: linked ? patient.telegramChatId : null };
      // Keep the detail refetch pending: badge must disappear from the cache update alone.
      if (url.pathname === "/api/clients/42") {
        if (!linked && deletes) await new Promise(resolve => setTimeout(resolve, 1500));
        return json(client);
      }
      if (url.pathname === "/api/clients") return json([client]);
      return json([]);
    });
    await page.goto("/cockpit/42/cadastro");
    const unlink = page.getByRole("button", { name: "Desvincular Telegram", exact: true });
    if (scenario === "nao-vinculado") {
      await expect(page.getByText("Não vinculado", { exact: true })).toBeVisible();
      await expect(unlink).toHaveCount(0);
      expect(deletes).toBe(0);
      return;
    }
    await expect(unlink).toBeVisible();
    await expect(page.getByText("ATIVO", { exact: true })).toBeVisible();
    if (scenario === "sucesso") {
      await page.screenshot({ path: testInfo.outputPath("telegram-vinculado.png"), fullPage: true });
    }
    page.once("dialog", async dialog => {
      expect(dialog.message()).toContain(patient.name);
      expect(dialog.message()).toContain("interrompidos");
      if (scenario === "cancelar") await dialog.dismiss();
      else await dialog.accept();
    });
    await unlink.click();
    if (scenario === "sucesso") {
      await expect(unlink).toHaveCount(0, { timeout: 1000 });
      await expect(page.getByText("ATIVO", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Não vinculado", { exact: true })).toBeVisible();
      await expect(page.getByText("Telegram desvinculado", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText("Não vinculado", { exact: true })).toBeVisible();
    } else {
      if (scenario !== "cancelar") {
        await expect(page.getByText("Erro ao desvincular Telegram", { exact: true })).toBeVisible();
        if (scenario === "404") await expect(page.getByText("Paciente não encontrado ou sem permissão para desvincular.", { exact: true })).toBeVisible();
        if (scenario === "500") await expect(page.getByText("Não foi possível desvincular o Telegram (erro 500). Tente novamente.", { exact: true })).toBeVisible();
      }
      await expect(unlink).toBeEnabled();
      await expect(page.getByText("ATIVO", { exact: true })).toBeVisible();
    }
    expect(deletes).toBe(scenario === "cancelar" ? 0 : 1);
  });
}
