import { expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import puppeteer from "puppeteer";

// Explicit opt-in: this test needs the development database and the running PADCOM.
test.skipIf(process.env.RUN_CONCIERGE_NAME_INTEGRATION !== "1")(
  "real registrarFalha/listPenalidades show the patient below the masked CPF, or — without a match",
  async () => {
    if (process.env.NODE_ENV === "production") throw new Error("Development-only test");
    const { db, pool } = await import("@workspace/db");
    const { registrarFalha, listPenalidades } = await import("../lib/concierge-penalidade");
    const rollback = new Error("intentional test rollback");
    let executeSpy: ReturnType<typeof vi.spyOn> | undefined;
    let testedCpfs: string[] = [];
    let before: unknown[] = [];
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

    try {
      await expect(db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
        const result = await tx.execute(sql`
          SELECT regexp_replace(c.cpf, '[^0-9]', '', 'g') AS cpf, c.name
          FROM clients c
          WHERE c.empresa_id = 5 AND c.deleted_at IS NULL
            AND length(regexp_replace(c.cpf, '[^0-9]', '', 'g')) = 11
            AND c.name IS NOT NULL AND c.name <> ''
          ORDER BY c.id LIMIT 1
        `);
        const client = result.rows[0] as { cpf: string; name: string } | undefined;
        if (!client) throw new Error("An existing development client with CPF is required");
        const candidates = await tx.execute(sql`
          SELECT lpad(n::text, 11, '0') AS cpf FROM generate_series(1, 1000) AS n
          WHERE NOT EXISTS (
            SELECT 1 FROM clients
            WHERE regexp_replace(cpf, '[^0-9]', '', 'g') = lpad(n::text, 11, '0')
          ) LIMIT 1
        `);
        const unknownCpf = candidates.rows[0]?.cpf as string | undefined;
        if (!unknownCpf) throw new Error("No unmatched synthetic CPF available");
        testedCpfs = [client.cpf, unknownCpf];
        const existingTable = await tx.execute(sql`SELECT to_regclass('concierge_penalidades') AS name`);
        if (existingTable.rows[0].name) {
          before = (await tx.execute(sql`
            SELECT * FROM concierge_penalidades WHERE cpf IN (${client.cpf}, ${unknownCpf}) ORDER BY cpf
          `)).rows;
        }

        // Route the unmodified engine's SQL to this real, rollback-only connection.
        executeSpy = vi.spyOn(db, "execute").mockImplementation(tx.execute.bind(tx));
        await registrarFalha(client.cpf, `name-verification:${crypto.randomUUID()}`);
        await registrarFalha(unknownCpf, `name-verification:${crypto.randomUUID()}`);
        const mask = (cpf: string) => `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`;
        const rows = await listPenalidades();
        const known = rows.find((r) => r.cpf_mascarado === mask(client.cpf));
        const unknown = rows.find((r) => r.cpf_mascarado === mask(unknownCpf));
        // Avoid printing personal data in assertion failures.
        expect(known?.nome_paciente === client.name).toBe(true);
        expect(unknown?.nome_paciente).toBeNull();
        for (const cpf of testedCpfs) {
          const filtered = await listPenalidades(cpf);
          expect(filtered.length).toBe(1);
          expect(filtered[0].cpf_mascarado === mask(cpf)).toBe(true);
          expect(filtered[0].nome_paciente === (cpf === client.cpf ? client.name : null)).toBe(true);
        }

        browser = await puppeteer.launch({
          executablePath: process.env.CHROMIUM_PATH ||
            "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
          headless: true,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 1000 });
        await page.evaluateOnNewDocument(() => {
          localStorage.setItem("padcom_collab_token", "test-only-token");
          localStorage.setItem("padcom_collab_prof", JSON.stringify({
            id: 1, name: "Profissional Teste", role: "medico",
          }));
        });
        const pageErrors: string[] = [];
        page.on("pageerror", () => pageErrors.push("Page runtime error"));
        await page.setRequestInterception(true);
        page.on("request", (request) => {
          const url = new URL(request.url());
          if (!url.pathname.startsWith("/api/")) return void request.continue();
          let body: unknown = {};
          if (url.pathname === "/api/admin/concierge-penalidade") {
            body = { ok: true, rows: [known, unknown], total: 2 };
          } else if (url.pathname === "/api/clients") {
            body = [];
          } else if (url.pathname === "/api/collaborator/me") {
            body = { professional: { id: 1, name: "Profissional Teste", role: "medico" } };
          }
          void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        });
        await page.goto(`${process.env.PADCOM_BASE_URL || "http://localhost:18148"}/ceo/concierge-penalidades`);
        await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 2);
        const display = await page.evaluate((expected) => {
          const cells = Array.from(document.querySelectorAll("tbody tr > td:first-child"));
          const inspect = (cpf: string, name: string) => {
            const cell = cells.find((c) => c.querySelector("span")?.textContent?.trim() === cpf);
            const spans = cell?.querySelectorAll("span");
            if (!spans || spans.length < 2) return false;
            const first = spans[0].getBoundingClientRect();
            const second = spans[1].getBoundingClientRect();
            return spans[1].textContent?.trim() === name &&
              second.top >= first.bottom && second.width > 0 && second.height > 0;
          };
          return {
            named: inspect(expected.mask, expected.name),
            unmatched: inspect(expected.unknownMask, "—"),
          };
        }, { mask: mask(client.cpf), name: client.name, unknownMask: mask(unknownCpf) });
        expect(display).toEqual({ named: true, unmatched: true });
        expect(pageErrors).toEqual([]);
        throw rollback;
      })).rejects.toBe(rollback);
    } finally {
      executeSpy?.mockRestore();
      await browser?.close();
      try {
        if (testedCpfs.length) {
          const table = await db.execute(sql`SELECT to_regclass('concierge_penalidades') AS name`);
          const after = table.rows[0].name ? (await db.execute(sql`
            SELECT * FROM concierge_penalidades
            WHERE cpf IN (${testedCpfs[0]}, ${testedCpfs[1]}) ORDER BY cpf
          `)).rows : [];
          expect(JSON.stringify(after) === JSON.stringify(before)).toBe(true);
        }
      } finally {
        await pool.end();
      }
    }
  },
  60_000,
);
