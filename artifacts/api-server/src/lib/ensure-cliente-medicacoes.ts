/** Boot: cria cliente_medicacoes, consentimentos, tomadas e sessões persistentes (aditivo, idempotente, sem DROP). */
import { pool } from "@workspace/db";
import { criarTabelasMedicacoes } from "./cliente-medicacoes.js";
import { criarTabelaTomadas } from "./cliente-medicacao-adesao.js";
import { criarTabelaSessoes } from "./area-paciente-sessao.js";
import { criarTabelaContasExcluidas } from "./area-paciente-conta.js";

let _ready: Promise<void> | null = null;

export function ensureClienteMedicacoes(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      await criarTabelasMedicacoes(pool);
      await criarTabelaTomadas(pool);
      await criarTabelaSessoes(pool);
      await criarTabelaContasExcluidas(pool);
    })().catch((err) => {
      _ready = null;
      throw err;
    });
  }
  return _ready;
}
