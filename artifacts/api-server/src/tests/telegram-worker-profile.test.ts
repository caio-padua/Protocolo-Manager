import { beforeEach, describe, expect, it, vi } from "vitest";
const retomada=vi.hoisted(()=>vi.fn(async()=>({incertosNovos:0,examinados:0,aceitos:0,falhas:0})));
vi.mock("../lib/telegram-repasse-worker",()=>({processarRepassesPendentes:retomada}));

import {
  categorizarErroDeWorker,
  parseWorkerProfile,
  resumoErroSeguro,
  startWorkerJobs,
} from "../../../api-worker/src/worker";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as never;

describe("perfil restrito do api-worker", () => {
  const schedule = vi.fn();
  const scheduler = { schedule } as never;

  beforeEach(() => {
    schedule.mockReset();
    vi.clearAllMocks();
  });

  it("mantém o perfil completo como padrão legado e aceita o perfil restrito", () => {
    expect(parseWorkerProfile(undefined)).toBe("full");
    expect(parseWorkerProfile("full")).toBe("full");
    expect(parseWorkerProfile("telegram-relay-dev")).toBe("telegram-relay-dev");
  });

  it("falha fechado para um perfil desconhecido", () => {
    expect(() => parseWorkerProfile("telegram-and-everything")).toThrow(
      "Perfil de api-worker inválido"
    );
  });

  it("classifica falhas sem registrar mensagens que possam conter dados", () => {
    expect(categorizarErroDeWorker(new Error("DATABASE_URL must be set"))).toBe(
      "database_url_missing"
    );
    expect(
      categorizarErroDeWorker(new Error('Dynamic require of "events" is not supported'))
    ).toBe("esm_commonjs_dynamic_require");
    expect(categorizarErroDeWorker({ code: "42P01" })).toBe("42P01");
    expect(
      categorizarErroDeWorker(
        Object.assign(new Error("conexão falhou"), {
          cause: Object.assign(new Error("detalhe oculto"), { code: "ECONNREFUSED" }),
        })
      )
    ).toBe("ECONNREFUSED");
    expect(categorizarErroDeWorker(new Error("erro desconhecido com texto"))).toBe(
      "unclassified"
    );
  });

  it("remove conexão, token e identificadores do resumo seguro", () => {
    const summary = resumoErroSeguro(
      new Error("connect postgres://user:password@host/db token=secret-value chat 123456789")
    );
    expect(summary).not.toContain("password@host");
    expect(summary).not.toContain("secret-value");
    expect(summary).not.toContain("123456789");
    expect(summary).toContain("[database-url-redacted]");
    expect(summary).toContain("token=[redacted]");
  });

  it("registra somente um cron, não ativa atendimento e impede duplicação ou perfil misto", async () => {
    startWorkerJobs(logger, "telegram-relay-dev", scheduler);
    startWorkerJobs(logger, "telegram-relay-dev", scheduler);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(
      "* * * * *",
      expect.any(Function),
      { timezone: "America/Sao_Paulo" }
    );
    expect(() => startWorkerJobs(logger, "full")).toThrow(
      "não pode iniciar também full"
    );
    expect(schedule).toHaveBeenCalledTimes(1);
    await schedule.mock.calls[0][1]();
    expect(retomada).toHaveBeenCalledWith({atendimento:false});
  });
});
