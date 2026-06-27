import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Formata reais (numero decimal) -> "R$ 1.234,56". O back-end de Financeiro
// guarda valores em REAIS (numeric), nao em centavos.
export function fmtBRL(value: number | null | undefined): string {
  const n = typeof value === "number" && isFinite(value) ? value : 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function reaisFromInput(raw: string): number {
  const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
}

type TitleColor = "primary" | "amber" | "cyan" | "emerald" | "red";

const COLOR_CLASS: Record<TitleColor, string> = {
  primary: "text-primary",
  amber: "text-amber-600 dark:text-amber-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  red: "text-red-600 dark:text-red-400",
};

// Padrao 3 (skill-layout-paxter): titulo de bloco em placa Saliente (bevel-3d),
// MAIUSCULO + tracking, com icone Lucide a esquerda na cor tematica do bloco.
export function BlockTitle({
  icon: Icon,
  children,
  color = "primary",
  trailing,
}: {
  icon: LucideIcon;
  children: ReactNode;
  color?: TitleColor;
  trailing?: ReactNode;
}) {
  return (
    <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 mb-4">
      <Icon className={`w-4 h-4 shrink-0 ${COLOR_CLASS[color]}`} />
      <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">{children}</span>
      {trailing ? <span className="ml-1 inline-flex items-center">{trailing}</span> : null}
    </div>
  );
}

// Painel 3D Saliente com titulo. Bloco-mae de cada secao de Configuracoes.
export function SettingsPanel({
  icon,
  title,
  color,
  children,
  titleTrailing,
}: {
  icon: LucideIcon;
  title: string;
  color?: TitleColor;
  children: ReactNode;
  titleTrailing?: ReactNode;
}) {
  return (
    <section className="panel-3d p-5">
      <BlockTitle icon={icon} color={color} trailing={titleTrailing}>
        {title}
      </BlockTitle>
      {children}
    </section>
  );
}

// Campo gravado (Padrao 7): rotulo MAIUSCULO + input/conteudo afundado.
export function FieldRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

// Chip de status de segredo: aceso (verde) quando configurado, apagado quando nao.
export function SecretBadge({
  isSet,
  masked,
  source,
}: {
  isSet: boolean;
  masked?: string | null;
  source?: string | null;
}) {
  return (
    <div className="concave-3d inline-flex items-center gap-2 px-3 py-1.5">
      <span className="text-[12px] font-medium">
        {isSet ? (
          <>
            Configurado{masked ? ` (${masked})` : ""}
            {source ? <span className="text-muted-foreground"> · {source === "env" ? "ambiente" : "cofre"}</span> : null}
          </>
        ) : (
          <span className="text-muted-foreground">Nao configurado</span>
        )}
      </span>
    </div>
  );
}
