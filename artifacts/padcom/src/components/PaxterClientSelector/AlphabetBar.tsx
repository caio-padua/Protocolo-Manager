/**
 * AlphabetBar — barra de letras A–Z em estilo keycap 3D (Paxter).
 *
 * Cada letra é um "iconezinho" com aparência de tecla de teclado levemente em relevo.
 * Letras sem clientes ficam esmaecidas e não clicáveis.
 * Letra ativa fica destacada em navy/ouro.
 */

import { cn } from "@/lib/utils";

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

interface AlphabetBarProps {
  letraSelecionada: string | null;
  letrasDisponiveis: Set<string>;
  onLetraChange: (l: string | null) => void;
  className?: string;
}

export function AlphabetBar({
  letraSelecionada,
  letrasDisponiveis,
  onLetraChange,
  className,
}: AlphabetBarProps) {
  return (
    <div className={cn("flex flex-wrap gap-[3px]", className)}>
      {/* Botão TODOS */}
      <KeycapButton
        label="TODOS"
        active={letraSelecionada === null}
        available={true}
        onClick={() => onLetraChange(null)}
        wide
      />

      {/* 26 letras */}
      {LETRAS.map((l) => (
        <KeycapButton
          key={l}
          label={l}
          active={letraSelecionada === l}
          available={letrasDisponiveis.has(l)}
          onClick={() => onLetraChange(letraSelecionada === l ? null : l)}
        />
      ))}
    </div>
  );
}

// ── Botão individual (keycap) ────────────────────────────────────────────────

interface KeycapButtonProps {
  label: string;
  active: boolean;
  available: boolean;
  onClick: () => void;
  wide?: boolean;
}

function KeycapButton({ label, active, available, onClick, wide }: KeycapButtonProps) {
  if (active) {
    // Keycap ativa: navy + borda ouro + sombra
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center justify-center rounded-[4px] select-none transition-all duration-100",
          "text-[10px] font-black uppercase tracking-wider",
          "h-7 px-1.5 min-w-[28px]",
          wide && "px-2.5 min-w-[44px]",
          // Ativo: fundo navy, borda ouro, texto ouro
          "text-[#e7cd8f]",
        )}
        style={{
          background: "linear-gradient(180deg, #1e3668 0%, #16294a 60%, #0f1e3a 100%)",
          border: "1.5px solid rgba(231,205,143,0.7)",
          boxShadow:
            "0 1px 0 rgba(231,205,143,0.15), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 6px rgba(231,205,143,0.2)",
        }}
      >
        {label}
      </button>
    );
  }

  if (!available) {
    // Keycap desabilitada: invisível, não clicável
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-[4px] select-none",
          "text-[10px] font-black uppercase tracking-wider",
          "h-7 px-1.5 min-w-[28px]",
          wide && "px-2.5 min-w-[44px]",
          "opacity-20 cursor-not-allowed text-muted-foreground",
        )}
        style={{
          background: "rgba(0,0,0,0.04)",
          border: "1px solid transparent",
        }}
      >
        {label}
      </span>
    );
  }

  // Keycap inativa mas disponível: relevo sutil (estilo keycap teclado)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-[4px] select-none transition-all duration-100",
        "text-[10px] font-black uppercase tracking-wider",
        "h-7 px-1.5 min-w-[28px]",
        wide && "px-2.5 min-w-[44px]",
        "text-foreground/70 hover:text-foreground active:translate-y-[1px]",
      )}
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)",
        border: "1px solid rgba(0,0,0,0.15)",
        boxShadow:
          "0 2px 0 rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.18)",
      }}
    >
      {label}
    </button>
  );
}
