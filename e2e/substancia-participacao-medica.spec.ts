import { test, expect } from "@playwright/test";

test("participação médica exige escolha explícita e é persistida", async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "synthetic-ui-only-not-a-valid-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 91001, name: "Profissional sintético", role: "medico" }));
  });
  const substance: any = {
    id: 90001, name: "Substância sintética", category: "Teste", color: "#16284a",
    procedureType: "im", durationMinutes: 2.5, doctorParticipation: null, stockQuantity: 0,
    pricePerUnit: 0, starRating: 1, components: [], isBlend: false,
  };
  let payload: any = null;
  await context.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/substances" && request.method() === "GET")
      return route.fulfill({ status: 200, json: [substance] });
    if (path === "/api/substances/90001" && request.method() === "PUT") {
      payload = request.postDataJSON();
      Object.assign(substance, payload);
      return route.fulfill({ status: 200, json: substance });
    }
    if (path === "/api/substances/90001/components" && request.method() === "PUT")
      return route.fulfill({ status: 200, json: [] });
    return route.fulfill({ status: 200, json: [] });
  });
  await page.goto("/substances");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByText(/Ainda não definido/)).toBeVisible();
  await expect(page.getByText(/ainda não reserva horários/)).toBeVisible();
  await page.getByRole("button", { name: "Sim, participa" }).click();
  await expect(page.getByRole("button", { name: "Sim, participa" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect.poll(() => payload).not.toBeNull();
  expect(payload.doctorParticipation).toBe(true);
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sim, participa" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Não participa" }).click();
  await expect(page.getByRole("button", { name: "Não participa" })).toHaveAttribute("aria-pressed", "true");
});

test("falha na composição não é apresentada como falha do cadastro já salvo", async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "synthetic-ui-only-not-a-valid-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 91001, name: "Profissional sintético", role: "medico" }));
  });
  const substance: any = {
    id: 90001, name: "Substância sintética", category: "Teste", color: "#16284a",
    procedureType: "im", durationMinutes: 2.5, doctorParticipation: null, stockQuantity: 0,
    pricePerUnit: 0, starRating: 1, components: [], isBlend: false,
  };
  await context.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/substances" && request.method() === "GET")
      return route.fulfill({ status: 200, json: [substance] });
    if (path === "/api/substances/90001" && request.method() === "PUT") {
      Object.assign(substance, request.postDataJSON());
      return route.fulfill({ status: 200, json: substance });
    }
    if (path === "/api/substances/90001/components" && request.method() === "PUT")
      return route.fulfill({ status: 503, json: { error: "Falha sintética" } });
    return route.fulfill({ status: 200, json: [] });
  });
  await page.goto("/substances");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("button", { name: "Sim, participa" }).click();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Os dados da substância foram salvos, mas a composição não foi confirmada");
  await expect(page.getByRole("button", { name: "Sim, participa" })).toHaveAttribute("aria-pressed", "true");
});
