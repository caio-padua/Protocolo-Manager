import { describe, expect, it } from "vitest";
import { conferirCruzado, coerenciaContrato, extrairCnpjRfb, extrairContrato, mascararParaIA, reconhecerSlot } from "../pax-finance/documentos-calc";

const CT = `ATO CONSTITUTIVO DE SOCIEDADE
ANA TESTE, brasileira, casada, medica, nascida em 05/06/1980, portadora da Cédula de Identidade RG n° 11.222.333-4 SSP/SP, inscrita no CPF n° 529.982.247-25, residente e domiciliada na Rua X n° 1 - Ap 2, Bairro Y, Santos -SP, CEP 11000-000, por este instrumento resolve.
CLÁUSULA PRIMEIRA: irá girar sob a denominação de TESTE CLINICA LTDA, podendo abrir filiais
CLÁUSULA SEGUNDA: A sede é na Rua Z n° 5 - Sala 3, Centro, São Paulo - SP, CEP 01.000-000.
CLÁUSULA TERCEIRA: prazo indeterminado.
CLÁUSULA QUARTA: O objetivo da empresa é explorar as atividades de consultas.
CLÁUSULA QUINTA: O Capital Social é de R$ 100.000,00 (Cem Mil), dividido em 100.000 (Cem Mil) quotas, no valor nominal de R$ 1,00 (Hum Real) cada uma, totalmente integralizado e assim distribuído:
Sócia Quotas R$ %
Ana Teste 60.000 60.000,00 60,00%
Beto Teste 40.000 40.000,00 40,00%
TOTAL 100.000 100.000,00 100,00%
Fica eleito o foro de Santos para`;

describe("documentos-calc (determinístico, texto sintético)", () => {
  it("contrato: separa público de sensível e lê sede com cidade", () => {
    const r = extrairContrato(CT);
    expect(r.publicos.razaoSocial).toBe("TESTE CLINICA LTDA");
    expect(r.publicos).toMatchObject({ logradouro: "Rua Z", numero: "5", complemento: "Sala 3", bairro: "Centro", municipio: "São Paulo", uf: "SP", capitalSocialCents: 10000000, quotasTotal: 100000, valorQuotaCents: 100, foro: "Santos" });
    expect(r.sensiveis.socio1_cpf).toBe("52998224725");
    expect(JSON.stringify(r.publicos)).not.toMatch(/52998224725|11\.222\.333|05\/06\/1980|Rua X/);
    expect(r.avisos.some((a) => /Beto/.test(a))).toBe(true); // sócio sem qualificação é avisado, não inventado
  });
  it("coerência: 60% + 40% fecha; participação que não fecha é apontada", () => {
    expect(coerenciaContrato(extrairContrato(CT).publicos)).toEqual([]);
    const p = extrairContrato(CT).publicos as any; p.socios[1].bp = 3000;
    expect(coerenciaContrato(p).join(" ")).toMatch(/somam/);
  });
  it("comprovante: asteriscos viram ausência e CNAE repetido entre páginas é deduplicado", () => {
    const t = ["COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL", "TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)", "********", "CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL", "86.30-5-03 - Principal",
      "CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS", "72.10-0-00 - Pesquisa longa", "continuacao minuscula", "72.10-0-00 - Pesquisa longa", "continuacao minuscula", "85.99-6-99 - Outra"].join("\n");
    const r = extrairCnpjRfb(t);
    expect(r.publicos.nomeFantasia).toBeUndefined();
    expect(r.publicos.cnaesSecundarios).toEqual(["72.10-0-00 - Pesquisa longa continuacao minuscula", "85.99-6-99 - Outra"]);
  });
  it("conferência cruzada ignora acento e caixa, e acusa divergência real", () => {
    const ok = conferirCruzado({ cnpj_rfb: { razaoSocial: "CLÍNICA A LTDA" }, certidao_jucesp: { razaoSocial: "Clinica A Ltda" } });
    expect(ok[0].resultado).toBe("confere");
    const ruim = conferirCruzado({ cnpj_rfb: { cep: "01.000-000" }, contrato_social: { cep: "02000-000" } });
    expect(ruim[0].resultado).toBe("diverge");
  });
  it("máscara para IA remove CPF, RG, nascimento e endereço residencial", () => {
    const m = mascararParaIA(CT);
    expect(m).not.toMatch(/529\.982|11\.222\.333|05\/06\/1980|Rua X|Bairro Y/);
    expect(m).toMatch(/\[CPF\]/);
  });
  it("reconhece o tipo do documento", () => {
    expect(reconhecerSlot("COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL")).toBe("cnpj_rfb");
    expect(reconhecerSlot("CERTIDÃO DE INTEIRO TEOR")).toBe("certidao_jucesp");
    expect(reconhecerSlot("ATO CONSTITUTIVO DE SOCIEDADE")).toBe("contrato_social");
  });
});
