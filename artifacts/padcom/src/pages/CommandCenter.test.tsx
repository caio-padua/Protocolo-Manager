import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { loadOnboardingStats, PainelOnboarding } from "./CommandCenter";

const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: () => [state.values.shift(), vi.fn()],
}));

const paciente = {
  client_id: 123,
  nome: "Cliente Sintético com Nome Completo Extenso",
  ultimo_acesso: "2026-11-24 02:30:00+00",
};
const stats = { ok: true, total: 3, pacientesUnicos: 1, pacientes: [paciente], porDevice: [], porSecao: [] };
const render = (data = stats, loading = false, error: string | null = null) => {
  state.values = [data, loading, error];
  return renderToStaticMarkup(<PainelOnboarding />);
};

beforeEach(() => { state.values = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("consulta autenticada do Onboarding", () => {
  it("envia a sessão do colaborador fora da empresa padrão e consome sua lista", async () => {
    const storage = new Map([["padcom_collab_token", "synthetic-company-42-session"]]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null });
    const company42Stats = { ...stats, pacientes: [{ ...paciente, client_id: 42, nome: "Cliente da clínica 42" }] };
    const fetchMock = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const token = new Headers(options?.headers).get("Authorization");
      return token === "Bearer synthetic-company-42-session"
        ? new Response(JSON.stringify(company42Stats), { status: 200 })
        : new Response("Não autenticado", { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const data = await loadOnboardingStats();
    expect(data.pacientes).toEqual(company42Stats.pacientes);
    expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/stats", {
      cache: "no-store", headers: { Authorization: "Bearer synthetic-company-42-session" },
    });
    expect(render(data)).toContain("Cliente da clínica 42");

    // Cada atualização deve ler a sessão atual, sem capturar token antigo.
    storage.set("padcom_collab_token", "synthetic-expired-session");
    await expect(loadOnboardingStats()).rejects.toThrow();
    expect(render(data, false, "Erro de conexão.")).not.toContain("Cliente da clínica 42");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/onboarding/stats", {
      cache: "no-store", headers: { Authorization: "Bearer synthetic-expired-session" },
    });
  });

  it("não aceita como dados uma sessão ausente ou uma resposta de erro", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const fetchMock = vi.fn().mockResolvedValue(new Response("Não autenticado", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadOnboardingStats()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/stats", { cache: "no-store", headers: {} });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 200 }));
    await expect(loadOnboardingStats()).rejects.toThrow();
  });
});

describe("pacientes no painel de Onboarding", () => {
  it("mostra nome completo e último acesso em Brasília, inclusive na virada UTC", () => {
    const html = render();
    expect(html).toContain(paciente.nome);
    expect(html).toContain("23/11/2026, 23:30");
    expect(html).toContain('dateTime="2026-11-24T02:30:00.000Z"');
    expect(html).toContain("Último acesso · Brasília");
    expect(html).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
  });
  it("explica quando há acessos sem paciente identificado", () => {
    const html = render({ ...stats, pacientesUnicos: 0, pacientes: [] });
    expect(html).toContain("Nenhum paciente identificado nos acessos dos últimos 30 dias.");
  });
  it("não apresenta nomes antigos durante erro ou carregamento", () => {
    expect(render(stats, false, "Erro de conexão.")).not.toContain(paciente.nome);
    expect(render(stats, true)).not.toContain(paciente.nome);
  });
  it("diferencia ausência de acessos de ausência de identificação", () => {
    expect(render({ ...stats, total: 0, pacientesUnicos: 0, pacientes: [] }))
      .toContain("Nenhum acesso ao Guia Digital registrado ainda.");
  });
});
