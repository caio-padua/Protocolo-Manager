export interface EngineWindow {
  startTime: string;
  endTime: string;
}

export interface EngineSettings {
  blockMinutes: number;
  triggerPercent: number;
  minLeadHours: number;
}

export interface EngineSubBlock {
  startTime: string;
  endTime: string;
  released: boolean;
  total: number;
  occupied: number;
  occupancy: number;
}

export type SlotState = "aberto" | "bloqueado" | "ocupado";

export interface EngineSlot {
  time: string;
  state: SlotState;
  reason: string | null;
  subBlockIndex: number;
}

export interface EngineResult {
  subBlocks: EngineSubBlock[];
  slots: EngineSlot[];
  reason: string | null;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Motor anti-ilha (determinista). Ver specs/motor-agenda.md secao "Motor anti-ilha".
 * Fatia as janelas do dia em sub-blocos de `blockMinutes`, gera os slots de `slotMinutes`,
 * e libera os sub-blocos em CADEIA: o 1o sempre aberto; o N abre quando o N-1 atinge
 * `triggerPercent`% de ocupacao. Slots dentro da antecedencia minima ficam bloqueados.
 */
export function computeAgendaSlots(params: {
  windows: EngineWindow[];
  slotMinutes: number;
  settings: EngineSettings;
  occupiedTimes: Set<string>;
  now: Date;
  date: string;
  isException: boolean;
  blockedRanges?: { start: number; end: number }[];
  occupiedRanges?: { start: number; end: number }[];
  /**
   * Canal INTERNO de encaixe (decidido pelo servidor, nunca pelo navegador): antecedência em MINUTOS no lugar da
   * regra em horas, e liberação em cadeia dispensada. Passado, expediente, ocupação e compromissos continuam valendo.
   * Sem este campo o comportamento é exatamente o de sempre (paciente, protocolo e demais fluxos).
   */
  encaixeInterno?: { leadMinutes: number };
}): EngineResult {
  const { windows, slotMinutes, settings, occupiedTimes, now, date, isException } = params;

  if (isException) return { subBlocks: [], slots: [], reason: "excecao" };

  const sorted = [...windows].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  if (sorted.length === 0) return { subBlocks: [], slots: [], reason: "sem-expediente" };

  const slot = Math.max(1, slotMinutes);
  const block = Math.max(slot, settings.blockMinutes);

  const subRanges: { start: number; end: number }[] = [];
  for (const w of sorted) {
    let s = toMin(w.startTime);
    const e = toMin(w.endTime);
    while (s < e) {
      const end = Math.min(s + block, e);
      if (end - s >= slot) subRanges.push({ start: s, end });
      s += block;
    }
  }

  const leadMs = params.encaixeInterno
    ? Math.max(0, params.encaixeInterno.leadMinutes) * 60 * 1000
    : Math.max(0, settings.minLeadHours) * 60 * 60 * 1000;
  const threshold = now.getTime() + leadMs;

  const subBlocks: EngineSubBlock[] = [];
  const slotsBySub: { time: string; occupied: boolean; blocked: boolean }[][] = [];

  for (const r of subRanges) {
    const slots: { time: string; occupied: boolean; blocked: boolean }[] = [];
    for (let t = r.start; t + slot <= r.end; t += slot) {
      const time = toHHMM(t);
      const overlaps = (range: {start: number; end: number}) => t < range.end && t + slot > range.start;
      slots.push({
        time, occupied: occupiedTimes.has(time) || Boolean(params.occupiedRanges?.some(overlaps)),
        blocked: Boolean(params.blockedRanges?.some(overlaps)),
      });
    }
    slotsBySub.push(slots);
    const occupied = slots.filter((s) => s.occupied).length;
    const total = slots.filter((s) => !s.blocked || s.occupied).length;
    const occupancy = total === 0 ? 0 : Math.round((occupied / total) * 100);
    subBlocks.push({
      startTime: toHHMM(r.start),
      endTime: toHHMM(r.end),
      released: false,
      total,
      occupied,
      occupancy,
    });
  }

  let chainOpen = true;
  for (const block of subBlocks) {
    block.released = (chainOpen || Boolean(params.encaixeInterno)) && block.total > 0;
    if (block.total > 0) chainOpen = chainOpen && block.occupancy >= settings.triggerPercent;
  }

  const outSlots: EngineSlot[] = [];
  for (let i = 0; i < subBlocks.length; i++) {
    const sb = subBlocks[i];
    for (const s of slotsBySub[i]) {
      let state: SlotState;
      let reason: string | null = null;
      // Instante absoluto do slot no fuso da clinica (BRT, UTC-3 fixo — Brasil sem horario de verao),
      // independente do fuso do servidor, para a antecedencia minima nao sofrer off-by-one.
      const dt = new Date(`${date}T${s.time}:00-03:00`);
      if (s.occupied) {
        state = "ocupado";
      } else if (s.blocked) {
        state = "bloqueado";
        reason = "compromisso";
      } else if (dt.getTime() < now.getTime()) {
        // Horário que já começou: não é regra de antecedência, é tempo que passou. Motivo próprio para a tela
        // poder dizer a verdade; o bloqueio é o mesmo de antes (nunca se marca no passado).
        state = "bloqueado";
        reason = "passado";
      } else if (dt.getTime() < threshold) {
        state = "bloqueado";
        reason = "antecedencia";
      } else if (sb.released) {
        state = "aberto";
      } else {
        state = "bloqueado";
        reason = "cadeia";
      }
      outSlots.push({ time: s.time, state, reason, subBlockIndex: i });
    }
  }

  return { subBlocks, slots: outSlots, reason: null };
}
