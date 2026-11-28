// Registra no histórico de cada fornecedor os catálogos originais que já estavam no projeto. Idempotente (mesmo conteúdo não duplica).
// Uso: pnpm --filter @workspace/api-server exec tsx src/scripts/registrar-catalogos-localizados.ts
import { readdirSync, readFileSync } from "node:fs";
import { pool } from "@workspace/db";
import { ensureFornecedorCatalogosSchema, guardarCatalogo } from "../lib/fornecedor-catalogos";

const DIR = "/home/runner/workspace/attached_assets/";
const EMPRESA = 5;
const ALVOS: { prefixo: RegExp; fornecedorId: number; referencia: string }[] = [
  { prefixo: /^FARMATEC_ORTO_ESTETICA_COM_VALOR_atualizado_29-09-25/, fornecedorId: 1, referencia: "Portfólio com valores, atualizado em 29/09/2025" },
  { prefixo: /^Indose_tabela_1/, fornecedorId: 6, referencia: "Portfólio Agosto/2025" },
  { prefixo: /^Indose_tabela_2/, fornecedorId: 6, referencia: "Portfólio Julho/2025" },
  { prefixo: /^Formedica_Implantes/, fornecedorId: 3, referencia: "Implantes: dose, trocarte, liberação e duração (sem preços)" },
  { prefixo: /^Tabela_de_Pre.*Formédica_SETEMBRO-2026/, fornecedorId: 3, referencia: "Tabela de preços comercial, injetáveis, setembro/2026" },
];
await ensureFornecedorCatalogosSchema();
const arquivos = readdirSync(DIR);
for (const alvo of ALVOS) {
  const nome = arquivos.find((a) => alvo.prefixo.test(a.normalize("NFC")));
  if (!nome) { console.log("NÃO ENCONTRADO:", alvo.prefixo); continue; }
  const limpo = nome.replace(/_\d{13}(?=\.\w+$)/, "");
  const r = await guardarCatalogo(pool, { empresaId: EMPRESA, fornecedorId: alvo.fornecedorId, nomeArquivo: limpo, buffer: readFileSync(DIR + nome), profissionalId: null, origem: "localizado", referencia: alvo.referencia });
  console.log(r.jaExistia ? "já registrado" : "registrado", r.registro.id, limpo, r.registro.tamanhoBytes);
}
await pool.end();
