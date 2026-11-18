import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { decidirInstalacao } from "./pwa-plataforma";

const base = { installed: false, canInstall: false, isIOS: false, isAndroid: false };

describe("decidirInstalacao", () => {
  it("ja instalado vence tudo", () => expect(decidirInstalacao({ ...base, installed: true, canInstall: true }).tipo).toBe("instalado"));
  it("Android/Chrome com evento real oferece prompt", () => expect(decidirInstalacao({ ...base, isAndroid: true, canInstall: true }).tipo).toBe("prompt"));
  it("iOS-like nunca recebe botao de instalar", () => expect(decidirInstalacao({ ...base, isIOS: true }).tipo).toBe("ios"));
  it("Android sem evento recebe instrucao manual, sem botao", () => expect(decidirInstalacao({ ...base, isAndroid: true }).tipo).toBe("android-manual"));
  it("computador sem evento recebe alternativa, sem botao", () => expect(decidirInstalacao(base).tipo).toBe("desktop"));
});

describe("manifest e service worker", () => {
  const raiz = new URL("../../public/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", raiz), "utf8"));
  const sw = readFileSync(new URL("sw.js", raiz), "utf8");
  it("manifest instalavel com icones 192, 512 e maskable", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/area");
    const tam = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(tam).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  });
  it("manifest nao carrega nome de clinica nem dado pessoal", () => {
    expect(JSON.stringify(manifest)).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}|@|cliente\//i);
  });
  it("service worker so intercepta GET, mesma origem e nunca /api (sem PII em cache)", () => {
    expect(sw).toMatch(/req\.method !== "GET"\) return/);
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return/);
    expect(sw).toMatch(/pathname\.includes\("\/api\/"\)\) return/);
    expect(sw).not.toMatch(/Authorization|localStorage|token/i);
  });
});
