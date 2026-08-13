// ClientIdentity — avatar + nome EB Garamond + badge de alarme clínico
// Posição: lado esquerdo do CockpitHeader quando cliente selecionado.
// Segue skill-layout-paxter: serifa grife para nome; sem infantilidades.

import { useMemo } from "react";
import { tituloProprio } from "@/lib/utils";

interface Client {
  id: number;
  name: string;
  birthDate?: string | null;
  photo?: string | null;
}

interface ClientIdentityProps {
  client: Client;
  alarmColor?: "green" | "amber" | "red";
}

const NAVY = "#16294a";
const GOLD = "#9a7b32";

function calcAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ALARM_MAP: Record<string, { dot: string; label: string; ring: string }> = {
  green:  { dot: "#22c55e", label: "SEM ALARME",  ring: "rgba(34,197,94,0.35)" },
  amber:  { dot: "#f59e0b", label: "SINAL",        ring: "rgba(245,158,11,0.35)" },
  red:    { dot: "#ef4444", label: "URGÊNCIA",     ring: "rgba(239,68,68,0.40)" },
};

export default function ClientIdentity({ client, alarmColor = "green" }: ClientIdentityProps) {
  const age = useMemo(() => calcAge(client.birthDate), [client.birthDate]);
  const alarm = ALARM_MAP[alarmColor];
  const ini = useMemo(() => initials(client.name), [client.name]);

  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* Avatar */}
      <div className="relative shrink-0">
        {client.photo ? (
          <img
            src={client.photo}
            alt={client.name}
            className="w-11 h-11 object-cover"
            style={{ borderRadius: 6, border: `2px solid ${GOLD}` }}
          />
        ) : (
          <div
            className="w-11 h-11 flex items-center justify-center font-black text-sm"
            style={{
              background: `linear-gradient(135deg, #1e3668 0%, #0f1e3a 100%)`,
              border: `2px solid ${GOLD}`,
              borderRadius: 6,
              color: GOLD,
              fontFamily: "'EB Garamond', serif",
              fontSize: 16,
              letterSpacing: "0.06em",
            }}
          >
            {ini}
          </div>
        )}
        {/* Badge de alarme no canto inferior direito do avatar */}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
          style={{
            background: alarm.dot,
            borderColor: "#16294a",
            boxShadow: `0 0 5px ${alarm.ring}`,
          }}
          title={alarm.label}
        />
      </div>

      {/* Nome + metadados */}
      <div className="min-w-0">
        <div
          className="font-bold leading-tight truncate max-w-[240px]"
          style={{
            fontFamily: "'EB Garamond', serif",
            fontSize: 18,
            color: "#fffbf0",
            textShadow: "0 1px 8px rgba(0,0,0,0.55)",
            letterSpacing: "0.01em",
          }}
        >
          {tituloProprio(client.name)}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {age !== null && (
            <span
              className="text-[10px] font-black uppercase tracking-[0.18em]"
              style={{ color: "rgba(255,251,240,0.55)" }}
            >
              {age} anos
            </span>
          )}
          <span
            className="text-[9px] font-black uppercase tracking-[0.22em] px-1.5 py-0.5 rounded-[3px]"
            style={{
              background: `${alarm.ring}`,
              color: alarm.dot,
              border: `1px solid ${alarm.dot}40`,
            }}
          >
            {alarm.label}
          </span>
        </div>
      </div>
    </div>
  );
}
