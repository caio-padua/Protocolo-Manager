import { expect, test } from "@playwright/test";

test("formulário real seleciona homônimo exato e envia dose revisada ao serviço simulado", async ({ page }) => {
  const cliente = { id: 42, name: "Cliente Teste", cpf: "", status: "active" };
  const medico = { id: 3, name: "Médico Teste", crm: "123", professionalType: "medico", category: "Médico" };
  const agenda = { id: 10, name: "Agenda Teste", kind: "nursing", modality: "local", professionalId: null, locationId: 5, locationName: "Local Teste", locationType: "clinic", locationColor: "#999", locationAddress: null };
  let payload: any = null;
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "isolated-test-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 3, name: "Médico Teste", role: "medico" }));
  });
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/collaborator/me") return json({ professional: medico });
    if (path === "/api/clients") return json([cliente]);
    if (path === "/api/clients/42") return json(cliente);
    if (path === "/api/clinical-context/42") return json({ client: cliente, professional: medico, clinic: { id: 5, empresaId: 5, name: "Clínica Teste" }, canPrescribe: true, canRequestExams: true, issue: null });
    if (path === "/api/clients/42/protocol-agenda-options") return json({
      clientId: 42, clinic: { id: 5, name: "Clínica Teste" },
      nursingAgendaId: 10, medicalAgendaId: 11, nursingAgenda: agenda,
      medicalAgenda: { ...agenda, id: 11, professionalId: 3 },
      nursingAgendas: [agenda], medicalAgendas: [{ ...agenda, id: 11, professionalId: 3 }],
      nurses: [], doctors: [medico],
    });
    if (path === "/api/substances") return json([
      { id: 1, name: "Coenzima Q10", color: "#277", category: "teste", stockQuantity: 0, procedureType: "im", defaultDose: "100 MG / 2 ML", presentationQuantity: 1, presentationUnit: "ampola", ampouleVolumeMl: 2, intervalDays: 7 },
      { id: 2, name: "Coenzima Q10", color: "#277", category: "teste", stockQuantity: 0, procedureType: "im", defaultDose: "50 MG / 2 ML", presentationQuantity: 1, presentationUnit: "ampola", ampouleVolumeMl: 2, intervalDays: 15 },
    ]);
    if (path === "/api/protocols" && request.method() === "POST") { payload = request.postDataJSON(); return json({ id: 99 }, 201); }
    return json([]);
  });
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await form.getByRole("button", { name: "Escolher substância" }).click();
  await page.getByRole("button", { name: /Coenzima Q10 — 50 mg/ }).click();
  const dose = form.getByPlaceholder("Dose prescrita por aplicação");
  await expect(dose).toHaveValue("50 mg");
  await expect(form.getByText("Quinzenal (a cada 15 dias)")).toBeVisible();
  await dose.fill("40 mg");
  await form.getByRole("button", { name: "Ver Resumo" }).click();
  await form.getByRole("button", { name: /Confirmar e Lançar Protocolo/ }).click();
  await expect.poll(() => payload?.items?.[0]?.substanceId).toBe(2);
  expect(payload.items[0].dose).toBe("40 mg");
  expect(payload.items[0].intervalDays).toBe(15);
});
