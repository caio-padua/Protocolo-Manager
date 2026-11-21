// Aplica o Catalogo Integrado Padua na anamnese. Aditivo e idempotente (rodar 2x nao duplica).
// Uso: pnpm --filter @workspace/api-server exec tsx src/scripts/aplicar-catalogo-integrado.ts
import { readFileSync } from "node:fs";
import { aplicarCatalogoIntegrado, type Catalogo } from "../lib/catalogo-integrado-anamnese";

const cat = JSON.parse(readFileSync(new URL("../data/catalogo-integrado-padua.json", import.meta.url), "utf8")) as Catalogo;
const r = await aplicarCatalogoIntegrado(cat);
console.log(JSON.stringify(r));
process.exit(0);
