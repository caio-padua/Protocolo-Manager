/** Boot: cria cliente_medicacoes e consentimentos (aditivo, idempotente, sem DROP). */
import { pool } from "@workspace/db";
import { criarTabelasMedicacoes } from "./cliente-medicacoes.js";

let _ready: Promise<void> | null = null;

export function ensureClienteMedicacoes(): Promise<void> {
  if (!_ready) {
    _ready = criarTabelasMedicacoes(pool).catch((err) => {
      _ready = null;
      throw err;
    });
  }
  return _ready;
}
