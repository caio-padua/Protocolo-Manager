/**
 * Vitrine pública PAXMED + perímetro da API, em ambiente ISOLADO e sintético.
 *
 * Monta o desenho de produção em memória: a build estática do padcom (dist/public, com reescrita /* -> index.html)
 * e o app COMPLETO do api-server (Basic Auth LIGADO, tenantContext, rotas) sobre PostgreSQL descartável, atrás de um
 * único endereço. O navegador (Chromium) enxerga paxmed.com.br apenas por mapeamento local de nomes: nada sai para a
 * internet, nenhum DNS ou segredo é tocado, nenhuma mensagem é enviada, nenhum dado real é usado.
 *
 * Prova: (1) a raiz de paxmed.com.br abre a vitrine, não o dashboard; (2) todos os recursos próprios carregam;
 * (3) nenhuma resposta traz desafio Basic Auth (WWW-Authenticate) nem 401 durante a abertura e o clique em Médico/Clínica;
 * (4) o clique leva a /login; (5) rotas protegidas continuam recusando requisição sem credencial.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { subirServidorCompleto } from "./helpers/servidor-completo";

vi.mock("../lib/sheets-dicionario", () => ({ sincronizarDicionarioSheets: vi.fn(async () => ({})) }));
vi.mock("../lib/seed-avatares", () => ({ runSeedAvatares: vi.fn(async () => ({})) }));

const RAIZ = resolve(import.meta.dirname, "../../../..");
const DIST = join(RAIZ, "artifacts/padcom/dist/public");
const CHROMIUM = process.env.CHROMIUM_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".pdf": "application/pdf",
};

let s: Awaited<ReturnType<typeof subirServidorCompleto>>;
let publico: http.Server; let porta = 0;
const semDist = !existsSync(join(DIST, "index.html"));

beforeAll(async () => {
  if (semDist) return;
  s = await subirServidorCompleto();
  // Único ponto de entrada: /api -> app completo do api-server; o resto -> arquivos estáticos com reescrita para index.html.
  const api = http.createServer(s.app);
  await new Promise<void>((ok) => api.listen(0, "127.0.0.1", ok));
  const portaApi = (api.address() as AddressInfo).port;
  publico = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const up = http.request({ host: "127.0.0.1", port: portaApi, path: req.url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res);
      });
      up.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(up); return;
    }
    let arq = join(DIST, decodeURIComponent(url.pathname));
    if (!arq.startsWith(DIST) || !existsSync(arq) || statSync(arq).isDirectory()) arq = join(DIST, "index.html");
    res.writeHead(200, { "content-type": TIPOS[extname(arq)] ?? "application/octet-stream" });
    res.end(readFileSync(arq));
  });
  await new Promise<void>((ok) => publico.listen(0, "127.0.0.1", ok));
  porta = (publico.address() as AddressInfo).port;
}, 400_000);
afterAll(async () => { publico?.close(); await s?.parar?.(); });

describe.skipIf(semDist)("vitrine paxmed.com.br e perímetro (servidor completo, Basic Auth ligado)", () => {
  it("navegador: raiz abre a vitrine, recursos carregam, sem desafio Basic, Médico/Clínica leva a /login", async () => {
    const { chromium } = createRequire(join(RAIZ, "package.json"))("playwright");
    const nav = await chromium.launch({
      executablePath: CHROMIUM,
      args: ["--no-sandbox", "--disable-dev-shm-usage", `--host-resolver-rules=MAP paxmed.com.br 127.0.0.1:${porta}, MAP www.paxmed.com.br 127.0.0.1:${porta}`],
    });
    try {
      for (const host of ["paxmed.com.br", "www.paxmed.com.br"]) {
        const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
        const respostas: { url: string; status: number; desafio: boolean; tipo: string }[] = [];
        const falhas: string[] = [];
        p.on("response", (r: any) => {
          const u = r.url();
          if (new URL(u).host.startsWith(host) || u.includes(`:${porta}`)) {
            respostas.push({ url: u.replace(/^https?:\/\/[^/]+/, "").slice(0, 120), status: r.status(), desafio: Boolean(r.headers()["www-authenticate"]), tipo: r.request().resourceType() });
          }
        });
        p.on("requestfailed", (r: any) => { if (r.url().includes(`:${porta}`)) falhas.push(r.url()); });
        let dialogo = false;
        p.on("dialog", () => { dialogo = true; });

        await p.goto(`http://${host}:${porta}/`, { waitUntil: "load", timeout: 90_000 });
        // Vitrine dourada (e não o Dashboard do Manager)
        await p.getByText("enquanto você cuida").first().waitFor({ timeout: 30_000 });
        expect(await p.getByText("O sistema clínico que trabalha").first().isVisible()).toBe(true);
        expect((await p.content()).toLowerCase()).not.toContain("dashboard");

        const doc = respostas.find((r) => r.tipo === "document");
        expect(doc?.status, `${host}: documento`).toBe(200);
        const proprios = respostas.filter((r) => ["script", "stylesheet", "image", "font"].includes(r.tipo));
        expect(proprios.some((r) => r.tipo === "script"), "algum JS carregou").toBe(true);
        expect(proprios.some((r) => r.tipo === "stylesheet"), "algum CSS carregou").toBe(true);
        expect(proprios.filter((r) => r.status >= 400), `${host}: recursos com erro`).toEqual([]);
        expect(falhas, `${host}: requisições que falharam`).toEqual([]);
        expect(respostas.filter((r) => r.desafio || r.status === 401), `${host}: desafio ou 401 na abertura`).toEqual([]);
        expect(dialogo).toBe(false);

        const botao = p.locator('a[href="/login"]:visible').first();
        await botao.waitFor({ timeout: 30_000 });
        await Promise.all([p.waitForURL(`http://${host}:${porta}/login`, { timeout: 60_000 }), botao.click()]);
        await p.waitForLoadState("load");
        await p.waitForTimeout(2500); // dá tempo para o Manager disparar o que quiser ao abrir o login
        expect(new URL(p.url()).pathname).toBe("/login");
        expect(await p.getByText("enquanto você cuida").count(), "/login não é a vitrine").toBe(0);
        expect(respostas.filter((r) => r.desafio), `${host}: desafio Basic no login`).toEqual([]);
        expect(respostas.filter((r) => r.status === 401), `${host}: 401 no login`).toEqual([]);
        expect(dialogo).toBe(false);
        console.log("RECURSOS", host, JSON.stringify(respostas.map((r) => `${r.tipo}:${r.status}:${r.url}`)));
        console.log(`EVIDENCIA ${host}: ${respostas.length} respostas, todas sem desafio; /login aberto sem 401`);
        await p.close();
      }
    } finally { await nav.close(); }
  }, 240_000);

  it("rota /login e /area em paxmed.com.br pertencem ao Manager (rotas por domínio)", async () => {
    const { vitrineDoEndereco } = await import("../../../padcom/src/lib/host-vitrine");
    expect(vitrineDoEndereco("paxmed.com.br", "/")).toBe("paxmed");
    expect(vitrineDoEndereco("www.paxmed.com.br", "/convite")).toBe("paxmed");
    for (const c of ["/login", "/area", "/dashboard", "/cockpit/1"]) expect(vitrineDoEndereco("paxmed.com.br", c)).toBeNull();
    expect(vitrineDoEndereco("outro.exemplo", "/")).toBeNull();
  });

  it("rotas protegidas continuam recusando sem credencial (desafio Basic só na API, nunca em páginas)", async () => {
    for (const caminho of ["/api/clients", "/api/sessions", "/api/exames-lab/documentos", "/api/professionals", "/api/agenda/resources", "/api/settings"]) {
      const r = await fetch(`http://127.0.0.1:${porta}${caminho}`);
      expect([401, 403], caminho).toContain(r.status);
      expect(r.headers.get("www-authenticate") ?? "", caminho).toContain("Basic");
      expect(await r.text()).not.toMatch(/cpf|prontu|exame-|paciente/i);
    }
    const bearerInvalido = await fetch(`http://127.0.0.1:${porta}/api/clients`, { headers: { Authorization: "Bearer invalido" } });
    expect(bearerInvalido.status).toBe(401);
    expect(bearerInvalido.headers.get("www-authenticate")).toBeNull();
    for (const pagina of ["/", "/login", "/convite", "/area"]) {
      const r = await fetch(`http://127.0.0.1:${porta}${pagina}`);
      expect(r.status, pagina).toBe(200);
      expect(r.headers.get("www-authenticate"), pagina).toBeNull();
    }
  });

  it("rotas públicas da vitrine respondem sem credencial e sem expor dado", async () => {
    const saude = await fetch(`http://127.0.0.1:${porta}/api/healthz`);
    expect(saude.status).toBe(200);
    expect(await saude.json()).toEqual({ status: "ok" });
    const lista = await fetch(`http://127.0.0.1:${porta}/api/vitrine-contatos`);
    expect([401, 403], "listar contatos exige colaborador").toContain(lista.status);
    const lista2 = await fetch(`http://127.0.0.1:${porta}/api/vitrine-convites`);
    expect([401, 403, 404, 405], "listar convites exige colaborador").toContain(lista2.status);
  });
});
