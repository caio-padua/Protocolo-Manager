import type { Modalidade } from "./meus-jogos-regras";

/**
 * Interface ISOLADA do robo que registra os jogos no canal autorizado. NAO ha implementacao real:
 * nao existe acesso formalmente autorizado a CAIXA/lotericas para esta clinica (ver spec). O sistema usa
 * `roboNaoConectado`, que se declara indisponivel; com isso a API recusa pedidos e nada e tratado como "registrado".
 * Um adaptador simulado existe apenas nos testes.
 */

export interface EstadoRobo { disponivel: boolean; motivo: string; ambiente: "nenhum" | "simulado" | "producao" }

export interface PedidoParaRobo {
  pedidoId: number;
  /** Chave de idempotencia que o robo DEVE honrar: a mesma chave nunca registra duas vezes. */
  chave: string;
  modalidade: Modalidade;
  concurso: number;
  jogos: number[][];
}

export type EstadoRegistro =
  | { estado: "em_andamento" }
  | { estado: "registrado"; comprovante: { bytes: Buffer; origem: string } }
  | { estado: "recusado_sem_aposta"; motivo: string }
  | { estado: "incerto"; motivo: string };

export interface RoboLoterias {
  estado(): Promise<EstadoRobo>;
  /** Pede o registro. Lanca erro quando o resultado e incerto (a aposta pode ou nao ter sido feita). */
  registrarJogos(p: PedidoParaRobo): Promise<{ ref: string }>;
  consultarEstado(ref: string): Promise<EstadoRegistro>;
}

export const roboNaoConectado: RoboLoterias = {
  async estado() {
    return { disponivel: false, motivo: "Registro automático de jogos ainda não está conectado a um canal autorizado.", ambiente: "nenhum" };
  },
  async registrarJogos() { throw new Error("robo nao conectado"); },
  async consultarEstado() { return { estado: "incerto", motivo: "robo nao conectado" }; },
};

let atual: RoboLoterias = roboNaoConectado;
export const roboAtual = (): RoboLoterias => atual;
/** Troca o robo (testes e futura integracao autorizada). Nao e exposto por nenhuma rota. */
export function definirRobo(r: RoboLoterias | null): void { atual = r ?? roboNaoConectado; }
