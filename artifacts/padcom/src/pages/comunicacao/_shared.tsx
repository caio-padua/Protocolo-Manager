import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

// Base do artefato (prefixo de rota) — padrao usado nas demais paginas.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type ComunicacaoStatus = {
  telegram: boolean;
  whatsapp: boolean;
  gmail: boolean;
  drive: boolean;
  onedrive: boolean;
};

// Busca o estado VERDADEIRO de cada canal no servidor (so booleanos).
export function useComunicacaoStatus() {
  const [status, setStatus] = useState<ComunicacaoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refetch = useCallback(() => {
    setLoading(true);
    return fetch(`${BASE}/api/comunicacao/status`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status"))))
      .then((d) => {
        setStatus(d.status as ComunicacaoStatus);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${BASE}/api/comunicacao/status`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status"))))
      .then((d) => {
        if (!alive) return;
        setStatus(d.status as ComunicacaoStatus);
        setError(false);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { status, loading, error, refetch };
}

// Casca da tela: cabecalho em placa Saliente (bevel) + corpo.
export function ConsoleShell({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="panel-3d p-5">
        <div className="flex items-center gap-4">
          <div className="bevel-3d flex h-12 w-12 items-center justify-center text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold uppercase tracking-[0.08em]">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

// Etiqueta gravada do bloco (placa Saliente).
export function BlockTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="bevel-3d mb-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
      <Icon className="h-4 w-4" />
      {children}
    </div>
  );
}

// Luzinha em vela (status de ferramenta): verde = ligado, ambar = desligado,
// vermelho = ERRO ao consultar (NUNCA confundir falha de leitura com "desligado").
// Ordem de prioridade: pending > error > on.
export function StatusVela({
  on,
  labelOn = "Ligado",
  labelOff = "Não configurado",
  pending = false,
  error = false,
}: {
  on: boolean;
  labelOn?: string;
  labelOff?: string;
  pending?: boolean;
  error?: boolean;
}) {
  const ledClass = pending
    ? ""
    : error
      ? "paxter-led-red"
      : on
        ? "paxter-led-green"
        : "paxter-led-amber";
  const textClass = error
    ? "text-rose-700 dark:text-rose-400"
    : on
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-amber-700 dark:text-amber-400";
  const label = pending ? "Verificando…" : error ? "Indisponível" : on ? labelOn : labelOff;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
      <span className={`paxter-led paxter-led-breathe ${ledClass}`} />
      <span className={textClass}>{label}</span>
    </span>
  );
}

// Cartao de uma ferramenta/canal dentro de um console.
export function ToolCard({
  icon: Icon,
  name,
  children,
  vela,
  accent = "text-primary",
}: {
  icon: LucideIcon;
  name: string;
  children: React.ReactNode;
  vela?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="panel-3d-sub p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`bevel-3d flex h-9 w-9 items-center justify-center ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em]">{name}</h3>
        </div>
        {vela}
      </div>
      <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

// Uma ideia por linha, gravada (insert concavo), espelha a Densidade B.
export function ExplainRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="concave-3d flex items-start gap-2.5 px-3 py-2 text-[13px]">
      <span className="paxter-led paxter-led-green mt-1.5 shrink-0" />
      <span className="text-foreground/80">{children}</span>
    </div>
  );
}
