import { randomBytes, scryptSync } from "node:crypto";

import {
  conferirHash,
  gerarHash,
  precisaRegravarRotulo,
  rotuloDoEsquema,
} from "./passwordScheme.js";

// ============================================================================
// Prova do item 10 da linha de producao.
//
// Roda sem banco, sem rede e sem servidor:
//     npx tsx artifacts/api-server/src/lib/passwordScheme.teste.ts
//
// O que este arquivo garante, e por que cada garantia importa:
//
//   1. a causa raiz existe mesmo         — as duas derivacoes historicas
//                                          produzem chaves diferentes
//   2. ninguem e trancado fora           — hash antigo continua valendo nos
//                                          dois esquemas (FASE 1)
//   3. o rotulo novo e gravado           — hash novo sai marcado
//   4. o rotulo novo confere             — ida e volta funciona
//   5. senha errada continua errada      — a correcao nao abriu porta
//   6. esquema trocado e RUIDOSO         — deixa de parecer senha errada
//   7. da para medir a FASE 2            — quantos hashes faltam regravar
//
// Sem a garantia 2 este item viraria o acidente que ele existe para evitar.
// ============================================================================

let passou = 0;
let falhou = 0;

function conferir(nome: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  ok    ${nome}`);
  } else {
    falhou++;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

// --- reproducao dos dois formatos ANTIGOS, exatamente como estavam no codigo
// antes de 30/07/2026. Nao chamam o modulo novo de proposito: representam o
// que ja esta gravado no banco de producao.

function hashAntigoColaborador(plain: string): string {
  const saltHex = randomBytes(16).toString("hex");
  // salt entregue como STRING hexadecimal
  const derivado = scryptSync(plain, saltHex, 64).toString("hex");
  return `scrypt$${saltHex}$${derivado}`;
}

function hashAntigoPaciente(plain: string): string {
  const salt = randomBytes(16);
  // salt entregue como BUFFER de bytes
  const derivado = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt.toString("hex")}$${derivado}`;
}

const SENHA = "SenhaDeTeste#2026";
const SENHA_ERRADA = "SenhaDeTeste#2027";

console.log("\n=== 1. a causa raiz: as duas derivacoes SAO diferentes ===");
{
  const saltHex = randomBytes(16).toString("hex");
  const comoString = scryptSync(SENHA, saltHex, 64).toString("hex");
  const comoBuffer = scryptSync(SENHA, Buffer.from(saltHex, "hex"), 64).toString("hex");
  conferir(
    "mesmo salt, mesma senha, chaves DIFERENTES conforme string ou buffer",
    comoString !== comoBuffer,
    "se fossem iguais, o bug de 29/07 nao existiria",
  );
}

console.log("\n=== 2. FASE 1: hash antigo continua valendo (ninguem trancado fora) ===");
{
  const antigoCol = hashAntigoColaborador(SENHA);
  const antigoPac = hashAntigoPaciente(SENHA);
  conferir("hash antigo de COLABORADOR ainda confere", conferirHash("colaborador", SENHA, antigoCol));
  conferir("hash antigo de PACIENTE ainda confere", conferirHash("paciente", SENHA, antigoPac));
}

console.log("\n=== 3. o rotulo novo e gravado ===");
{
  const novoCol = gerarHash("colaborador", SENHA);
  const novoPac = gerarHash("paciente", SENHA);
  conferir("colaborador grava scrypt-col$", novoCol.startsWith("scrypt-col$"), novoCol.slice(0, 20));
  conferir("paciente grava scrypt-pac$", novoPac.startsWith("scrypt-pac$"), novoPac.slice(0, 20));
  conferir("rotuloDoEsquema concorda", rotuloDoEsquema("colaborador") === "scrypt-col$");
}

console.log("\n=== 4. rotulo novo confere na ida e volta ===");
{
  conferir("colaborador", conferirHash("colaborador", SENHA, gerarHash("colaborador", SENHA)));
  conferir("paciente", conferirHash("paciente", SENHA, gerarHash("paciente", SENHA)));
}

console.log("\n=== 5. senha errada continua errada (a correcao nao abriu porta) ===");
{
  conferir("rotulo novo recusa senha errada",
    conferirHash("colaborador", SENHA_ERRADA, gerarHash("colaborador", SENHA)) === false);
  conferir("rotulo antigo recusa senha errada",
    conferirHash("colaborador", SENHA_ERRADA, hashAntigoColaborador(SENHA)) === false);
  conferir("hash vazio recusa", conferirHash("colaborador", SENHA, "") === false);
  conferir("hash nulo recusa", conferirHash("colaborador", SENHA, null) === false);
  conferir("formato lixo recusa", conferirHash("colaborador", SENHA, "nada$disso$presta") === false);
}

console.log("\n=== 6. esquema trocado: recusa RUIDOSA, nao silenciosa ===");
{
  const original = console.error;
  let logado = "";
  console.error = (m: unknown) => { logado += String(m); };

  const hashDePaciente = gerarHash("paciente", SENHA);
  const resultado = conferirHash("colaborador", SENHA, hashDePaciente);

  console.error = original;

  conferir("hash de paciente no campo de colaborador e recusado", resultado === false);
  conferir("e o log traz a marca procuravel", logado.includes("SENHA_ESQUEMA_TROCADO"),
    logado ? logado.slice(0, 60) : "nenhum log emitido");
  conferir("o log diz que NAO e senha incorreta", logado.includes("NAO e senha incorreta"));
}

console.log("\n=== 7. medicao da FASE 2 ===");
{
  conferir("hash antigo e apontado para regravar",
    precisaRegravarRotulo(hashAntigoColaborador(SENHA)) === true);
  conferir("hash novo NAO precisa regravar",
    precisaRegravarRotulo(gerarHash("colaborador", SENHA)) === false);
}

console.log(`\n=== RESULTADO: ${passou} passaram, ${falhou} falharam ===\n`);
if (falhou > 0) process.exit(1);
