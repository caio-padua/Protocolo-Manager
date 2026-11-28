/** Boot: cria a fila persistente (aditivo, idempotente, sem DROP). */
import { pool } from "@workspace/db";
import { criarTabelaFila } from "./fila-motor.js";

let _ready: Promise<void> | null = null;

export function ensureFilaMensagens(): Promise<void> {
  if (!_ready) {
    _ready = criarTabelaFila(pool).catch((err) => {
      _ready = null;
      throw err;
    });
  }
  return _ready;
}
