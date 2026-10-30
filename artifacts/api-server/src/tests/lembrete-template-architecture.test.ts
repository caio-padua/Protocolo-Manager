import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = "templateLembretePrescricao";

// Existing exceptions only: runtime fallbacks and the non-sending demo gallery.
// Counts are intentional: a new direct call even in these files must fail.
const allowedCalls: Record<string, number> = {
  "lib/prescription-reminder-message.ts": 1,
  "lib/lembrete-periodo.ts": 2,
  "routes/lembretes.ts": 1,
  "routes/demo-galeria.ts": 1,
};

function inspect(source: string, path: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const errors: string[] = [];
  let calls = 0;
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === template) {
      const parent = node.parent;
      if (ts.isImportSpecifier(parent) && parent.name === node && !parent.propertyName) {
        if (!(path in allowedCalls)) errors.push(`${path}: import direto proibido`);
      } else if (ts.isFunctionDeclaration(parent) && parent.name === node && path === "lib/lembrete-templates.ts") {
        // Definition, not a dispatch path.
      } else if (ts.isCallExpression(parent) && parent.expression === node) {
        calls++;
        if (path === "routes/prescriptions.ts") {
          let owner: ts.Node | undefined = parent.parent;
          while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
          if (!owner || (owner as ts.FunctionDeclaration).name?.text !== "montarMensagemLembrete") {
            errors.push(`${path}: fallback fora de montarMensagemLembrete`);
          }
        }
      } else {
        // Reject alias imports, re-exports, namespace access and value assignments.
        errors.push(`${path}: referencia indireta ao fallback proibida`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (calls !== (allowedCalls[path] ?? 0)) {
    errors.push(`${path}: ${calls} chamadas diretas; permitido ${allowedCalls[path] ?? 0}`);
  }
  return errors;
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "tests") return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe("template simples e somente fallback", () => {
  it("impede novos atalhos em todo o codigo de producao do servidor", () => {
    const violations = files(root).flatMap((path) => inspect(readFileSync(path, "utf8"), relative(root, path)));
    expect(violations).toEqual([]);
  });

  it("detecta um canal novo que chama o template diretamente", () => {
    expect(inspect(`import { ${template} } from "../lib/lembrete-templates";
      const mensagem = ${template}({});`, "routes/novo-canal.ts")).not.toEqual([]);
  });

  it("detecta import renomeado e acesso por namespace", () => {
    expect(inspect(`import { ${template} as simples } from "./lembrete-templates";
      simples({});`, "lib/novo.ts")).not.toEqual([]);
    expect(inspect(`templates.${template}({});`, "lib/novo.ts")).not.toEqual([]);
  });

  it("detecta um atalho novo mesmo dentro de prescriptions.ts", () => {
    expect(inspect(`function montarMensagemLembrete() { return ${template}({}); }
      router.post("/novo", () => ${template}({}));`, "routes/prescriptions.ts")).not.toEqual([]);
  });
});
