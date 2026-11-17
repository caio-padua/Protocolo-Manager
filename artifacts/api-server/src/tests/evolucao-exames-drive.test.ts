/** DEEx na pasta EXAMES do paciente: nome padrão e regras de segurança. Drive e banco simulados; dados sintéticos. */
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockExecute = vi.fn();
vi.mock("@workspace/db", () => ({ db: { execute: (...a: unknown[]) => mockExecute(...a) } }));
vi.mock("drizzle-orm", () => ({ sql: (..._a: unknown[]) => ({}) }));
const mockEstrutura = vi.fn();
const mockNomeUnico = vi.fn();
const mockUpload = vi.fn();
vi.mock("../lib/google-drive", () => ({
  removeDiacritics: (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  ensureClientFolderStructure: (...a: unknown[]) => mockEstrutura(...a),
  getUniqueDriveFileName: (...a: unknown[]) => mockNomeUnico(...a),
  uploadFileToDrive: (...a: unknown[]) => mockUpload(...a),
}));

import { arquivarDeexNoDrive, nomeArquivoDeex } from "../lib/evolucao-exames-drive";

const PDF = new Uint8Array([37, 80, 68, 70]);
beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue({ rows: [{ drive_clientes_folder_id: "RAIZ-EMPRESA-5" }] });
  mockEstrutura.mockResolvedValue({ subfolders: { EXAMES: "PASTA-EXAMES" } });
  mockNomeUnico.mockImplementation(async (_f: string, n: string) => n);
  mockUpload.mockResolvedValue({ fileId: "f1", webViewLink: "" });
});

describe("nome do DEEx", () => {
  it("segue AA.MM.DD - DEEx - DESCRITIVO EVOLUCAO EXAMES - NOME, em maiúsculas e sem acento", () => {
    const nome = nomeArquivoDeex("Maria da Conceição", false, new Date("2026-11-17T15:00:00Z"));
    expect(nome).toBe("26.11.17 - DEEx - DESCRITIVO EVOLUCAO EXAMES - MARIA DA CONCEICAO.pdf");
  });
  it("usa a data de Brasília na virada do dia", () => {
    expect(nomeArquivoDeex("Ana", false, new Date("2026-11-18T01:30:00Z"))).toMatch(/^26\.11\.17 - /);
  });
  it("tira caracteres proibidos em nome de arquivo e marca a prévia", () => {
    const nome = nomeArquivoDeex('Ana/Maria: "X"', true, new Date("2026-11-17T15:00:00Z"));
    expect(nome).toBe("26.11.17 - DEEx - DESCRITIVO EVOLUCAO EXAMES - ANA MARIA X - PREVIA INTERNA.pdf");
  });
});

describe("cópia na pasta EXAMES", () => {
  const dados = { empresaId: 5, nomePaciente: "Paciente Sintético", cpf: "000.000.000-00", pdf: PDF };
  it("usa a raiz da empresa do paciente, grava na pasta EXAMES sem apagar homônimos", async () => {
    const r = await arquivarDeexNoDrive(dados);
    expect(r.estado).toBe("salvo");
    expect(mockEstrutura).toHaveBeenCalledWith("Paciente Sintético", "00000000000", "RAIZ-EMPRESA-5");
    const [pasta, nome, mime, , permitirDuplicados] = mockUpload.mock.calls[0]!;
    expect(pasta).toBe("PASTA-EXAMES");
    expect(String(nome)).toContain(" - DEEx - DESCRITIVO EVOLUCAO EXAMES - PACIENTE SINTETICO.pdf");
    expect(mime).toBe("application/pdf");
    expect(permitirDuplicados).toBe(true);
  });
  it("nome repetido recebe o número que o Drive escolheu", async () => {
    mockNomeUnico.mockImplementation(async (_f: string, n: string) => n.replace(".pdf", " 2.pdf"));
    const r = await arquivarDeexNoDrive(dados);
    expect(r.nome).toMatch(/ 2\.pdf$/);
  });
  it("empresa sem pasta de clientes: indisponível, nunca usa a pasta global", async () => {
    mockExecute.mockResolvedValue({ rows: [{ drive_clientes_folder_id: null }] });
    expect((await arquivarDeexNoDrive(dados)).estado).toBe("indisponivel");
    expect(mockEstrutura).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });
  it("paciente sem CPF: indisponível, sem tocar no Drive", async () => {
    expect((await arquivarDeexNoDrive({ ...dados, cpf: null })).estado).toBe("indisponivel");
    expect(mockEstrutura).not.toHaveBeenCalled();
  });
  it("erro do Drive vira 'falhou' e não estoura", async () => {
    mockUpload.mockRejectedValue(new Error("403"));
    expect((await arquivarDeexNoDrive(dados)).estado).toBe("falhou");
  });
});
