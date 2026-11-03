import { describe, expect, it, vi } from "vitest";
import { postCollaboratorLogin } from "./login-request";

const loginBody = {
  identifier: "synthetic@example.invalid",
  password: "synthetic-password",
};

describe("postCollaboratorLogin", () => {
  it("espera a prontidão e envia as credenciais uma única vez", async () => {
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const wait = vi.fn(async (_milliseconds: number) => {});

    const response = await postCollaboratorLogin(loginBody, send, wait);

    expect(response.status).toBe(200);
    expect(send.mock.calls.map(([path]) => path)).toEqual([
      "/api/healthz",
      "/api/collaborator/login",
    ]);
    expect(wait).not.toHaveBeenCalled();
  });

  it("repete apenas a verificação de prontidão quando a API ainda não responde", async () => {
    const send = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("synthetic network failure"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const wait = vi.fn(async (_milliseconds: number) => {});

    const response = await postCollaboratorLogin(loginBody, send, wait);

    expect(response.status).toBe(200);
    expect(send.mock.calls.map(([path]) => path)).toEqual([
      "/api/healthz",
      "/api/healthz",
      "/api/collaborator/login",
    ]);
    expect(wait).toHaveBeenCalledWith(500);
  });

  it("mantém a recusa de credenciais e não repete o pedido de login", async () => {
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Credenciais inválidas" }), { status: 401 }),
      );
    const wait = vi.fn(async (_milliseconds: number) => {});

    const response = await postCollaboratorLogin(loginBody, send, wait);

    expect(response.status).toBe(401);
    expect(send).toHaveBeenCalledTimes(2);
    expect(wait).not.toHaveBeenCalled();
  });

  it("não envia credenciais se a API continuar indisponível", async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError("synthetic persistent network failure"),
    );
    const wait = vi.fn(async (_milliseconds: number) => {});

    await expect(postCollaboratorLogin(loginBody, send, wait)).rejects.toThrow(
      "O servidor ainda não está pronto.",
    );

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.every(([path]) => path === "/api/healthz")).toBe(true);
    expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([500, 1_000]);
  });
});
