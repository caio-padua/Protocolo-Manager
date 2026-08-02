import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// ============================================================================
// Item 10 da linha de producao — marca distinta nos dois esquemas de senha.
//
// O PROBLEMA QUE ISSO RESOLVE
//
// O sistema tem dois esquemas de senha independentes: colaborador e paciente.
// Ate 30/07/2026 os dois gravavam com o MESMO rotulo `scrypt$`, e as duas
// derivacoes eram incompativeis entre si:
//
//   colaborador  scryptSync(senha, saltHex   COMO STRING, 64)
//   paciente     scryptSync(senha, saltBytes COMO BUFFER, 64)
//
// scrypt deriva chaves diferentes para a string "a1b2" e para os bytes
// 0xa1 0xb2. Ou seja: hash de paciente entregue ao verificador de colaborador
// devolvia `false` — indistinguivel de senha errada.
//
// Custou uma noite inteira de investigacao: o login do CEO existia, a senha
// estava correta, e o sistema dizia que nao. Dois frascos de remedio com o
// mesmo rotulo e conteudo diferente.
//
// A CORRECAO, EM DUAS FASES
//
//   FASE 1 (esta)  grava com rotulo distinto: `scrypt-col$` e `scrypt-pac$`
//                  LE tambem o rotulo antigo `scrypt$`, com a derivacao
//                  historica de cada esquema. NINGUEM e trancado fora.
//                  Rotulo do OUTRO esquema e recusado RUIDOSAMENTE, com log
//                  identificavel — deixa de parecer senha errada.
//
//   FASE 2 (depois, por decisao do CEO)  para de aceitar `scrypt$`.
//                  So quando nao houver mais hash antigo no banco.
//
// POR QUE NENHUMA SENHA PRECISA SER REGRAVADA
//
// A derivacao de cada esquema NAO mudou: continua exatamente a que gerou os
// hashes que estao no banco. Mudou apenas o rotulo. Se a derivacao mudasse,
// toda senha existente pararia de funcionar e o CEO seria trancado fora de
// novo — que e precisamente o acidente que este item existe para impedir.
// ============================================================================

export type EsquemaSenha = "colaborador" | "paciente";

const KEYLEN = 64;
const ROTULO_ANTIGO = "scrypt";

const ROTULO: Record<EsquemaSenha, string> = {
  colaborador: "scrypt-col",
  paciente: "scrypt-pac",
};

const OUTRO: Record<EsquemaSenha, EsquemaSenha> = {
  colaborador: "paciente",
  paciente: "colaborador",
};

/**
 * Deriva a chave do jeito HISTORICO de cada esquema.
 *
 * A diferenca entre os dois nao e estilo: e o que mantem compativel o hash
 * que ja esta gravado no banco. `colaborador` entrega o salt como STRING
 * hexadecimal; `paciente` entrega como BUFFER de bytes. Trocar qualquer um
 * dos dois invalida as senhas existentes daquele esquema.
 */
function derivar(esquema: EsquemaSenha, plain: string, saltHex: string, keylen: number): Buffer {
  const salt = esquema === "colaborador" ? saltHex : Buffer.from(saltHex, "hex");
  return scryptSync(plain, salt as never, keylen);
}

/**
 * Recusa ruidosa: hash de um esquema aparecendo no campo do outro.
 *
 * Isso NAO e senha errada — e dado no lugar errado, e trata-se de defeito de
 * programacao ou de migracao. Fica no log com marca procuravel para nunca
 * mais custar uma noite de investigacao.
 */
function recusarRuidosamente(esquemaEsperado: EsquemaSenha, rotuloEncontrado: string): false {
  console.error(
    `[SENHA_ESQUEMA_TROCADO] esperado=${ROTULO[esquemaEsperado]}$ ` +
      `encontrado=${rotuloEncontrado}$ — hash do esquema errado neste campo. ` +
      `NAO e senha incorreta: e dado no lugar errado. Confira a migracao ou ` +
      `a rota que gravou este registro. Item 10 da linha de producao.`,
  );
  return false;
}

/** Gera o hash com o rotulo do esquema. A senha em texto puro NUNCA e gravada. */
export function gerarHash(esquema: EsquemaSenha, plain: string): string {
  const saltHex = randomBytes(16).toString("hex");
  const derivado = derivar(esquema, plain, saltHex, KEYLEN);
  return `${ROTULO[esquema]}$${saltHex}$${derivado.toString("hex")}`;
}

/**
 * Confere a senha contra o hash gravado.
 *
 * Aceita tres casos, nesta ordem:
 *   1. rotulo novo do proprio esquema        -> confere
 *   2. rotulo antigo `scrypt$`               -> confere com a derivacao
 *                                               historica deste esquema (fase 1)
 *   3. rotulo novo do OUTRO esquema          -> recusa RUIDOSA
 *
 * Qualquer outro formato devolve false sem log, porque ai e mesmo lixo.
 */
export function conferirHash(
  esquema: EsquemaSenha,
  plain: string,
  stored: string | null | undefined,
): boolean {
  if (!stored) return false;

  const partes = stored.split("$");
  if (partes.length !== 3) return false;

  const [rotulo, saltHex, esperadoHex] = partes;

  if (rotulo === ROTULO[OUTRO[esquema]]) {
    return recusarRuidosamente(esquema, rotulo);
  }

  const rotuloValido = rotulo === ROTULO[esquema] || rotulo === ROTULO_ANTIGO;
  if (!rotuloValido) return false;

  try {
    const esperado = Buffer.from(esperadoHex, "hex");
    if (esperado.length === 0) return false;
    const derivado = derivar(esquema, plain, saltHex, esperado.length);
    if (derivado.length !== esperado.length) return false;
    return timingSafeEqual(derivado, esperado);
  } catch {
    return false;
  }
}

/**
 * Diz se o hash ainda esta no rotulo antigo.
 *
 * Serve para duas coisas: medir quantas senhas faltam antes de a FASE 2 ser
 * possivel, e regravar com o rotulo novo no proximo login bem-sucedido, sem
 * pedir nada ao usuario.
 */
export function precisaRegravarRotulo(stored: string | null | undefined): boolean {
  if (!stored) return false;
  return stored.startsWith(`${ROTULO_ANTIGO}$`);
}

/** Rotulo esperado de um esquema, para diagnostico e relatorio. */
export function rotuloDoEsquema(esquema: EsquemaSenha): string {
  return `${ROTULO[esquema]}$`;
}
