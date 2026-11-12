import type { AgendaDoProfissional, OrigemVinculo } from "@/lib/agenda-vinculos-api";
import { ROTULO_ORIGEM } from "@/lib/agenda-vinculos-api";

/**
 * Situação do profissional em um LOCAL, lida das mesmas três origens que a Agenda Configuração usa
 * (titular da agenda, vínculo do cadastro, preferência). Antes a aba Vínculos olhava só o vínculo do local e
 * mostrava "desligado" para quem a Agenda Configuração já mostrava como titular.
 */
export interface VinculoDoLocal {
  /** Ligado por QUALQUER origem. */
  ligado: boolean;
  origens: OrigemVinculo[];
  /** Motivo exato quando o botão não pode ser mexido aqui (null = pode). */
  travadoPor: string | null;
  /** Texto curto para mostrar na linha ("Titular da agenda + Vínculo do cadastro"). */
  rotuloOrigem: string | null;
}

export function vinculoDoLocal(
  agendas: readonly AgendaDoProfissional[], locationId: number, temVinculoDoLocal: boolean,
): VinculoDoLocal {
  const origens: OrigemVinculo[] = [];
  for (const a of agendas) {
    if (a.locationId !== locationId) continue;
    for (const o of a.origens) if (!origens.includes(o)) origens.push(o);
  }
  if (temVinculoDoLocal && !origens.includes("local")) origens.push("local");
  const titular = origens.includes("individual");
  return {
    ligado: origens.length > 0,
    origens,
    travadoPor: titular ? "Titular desta agenda: a titularidade é definida em Agenda Configuração." : null,
    rotuloOrigem: origens.length ? origens.map((o) => ROTULO_ORIGEM[o]).join(" + ") : null,
  };
}
