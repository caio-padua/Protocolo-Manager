/**
 * PatientSelectorBar — Seletor padrão de paciente com barra A–Z.
 *
 * Componente canônico para QUALQUER tela que precise buscar ou filtrar pacientes.
 * Use o hook `usePatientFilter` para a lógica e o componente `PatientSelectorBar`
 * para renderizar a barra visual.
 *
 * Skill de referência: .agents/skills/skill-patient-selector/SKILL.md
 */

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constantes ──────────────────────────────────────────────────────────────

export const LETRAS_AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// ── Utilitário: normaliza string para comparação (sem acentos, maiúsculas) ──

export function normPatient(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

// ── Hook: lógica de filtro local (busca + letra) ────────────────────────────

/**
 * `usePatientFilter` — encapsula busca por texto + filtro A–Z sobre
 * uma lista de pacientes já carregada em memória.
 *
 * Busca por: nome, CPF (apenas dígitos) e telefone (apenas dígitos).
 * Agrupamento sempre por primeira letra do nome.
 *
 * @param pacientes    Lista completa. Precisa ter campo `name`; `cpf` e `phone`
 *                     são opcionais e usados na busca textual quando presentes.
 * @param extraFilter  Filtro adicional opcional (ex.: filtros server-side já aplicados).
 *
 * @example
 *   const { busca, setBusca, letra, setLetra, letrasDisponiveis, filtrados, grupos } =
 *     usePatientFilter(pacientesCarregados);
 */
export function usePatientFilter<
  T extends { name: string; cpf?: string | null; phone?: string | null; email?: string | null }
>(
  pacientes: T[],
  extraFilter?: (p: T) => boolean,
) {
  const [busca, setBusca]       = useState("");
  const [letra, setLetra]       = useState<string | null>(null);

  // Letras que têm pelo menos um paciente (sempre por nome)
  const letrasDisponiveis = useMemo(() => {
    const s = new Set<string>();
    const pool = extraFilter ? pacientes.filter(extraFilter) : pacientes;
    for (const p of pool) s.add(normPatient(p.name).charAt(0) || "#");
    return s;
  }, [pacientes, extraFilter]);

  // Resultado filtrado — busca por nome, CPF (dígitos) e telefone (dígitos)
  const filtrados = useMemo(() => {
    let pool = extraFilter ? pacientes.filter(extraFilter) : pacientes;
    if (letra) {
      pool = pool.filter((p) => normPatient(p.name).charAt(0) === letra);
    }
    if (busca.trim()) {
      const q      = normPatient(busca);
      const digits = busca.replace(/\D/g, "");
      pool = pool.filter((p) => {
        if (normPatient(p.name).includes(q)) return true;
        if (digits.length >= 3) {
          const byCpf   = (p.cpf   ?? "").replace(/\D/g, "").includes(digits);
          const byPhone = (p.phone  ?? "").replace(/\D/g, "").includes(digits);
          const byEmail = normPatient(p.email ?? "").includes(q);
          if (byCpf || byPhone || byEmail) return true;
        }
        return false;
      });
    }
    return pool;
  }, [pacientes, extraFilter, letra, busca]);

  // Agrupa filtrados por letra para renderização
  const grupos = useMemo(() => {
    const g: { letra: string; pacientes: T[] }[] = [];
    for (const p of filtrados) {
      const l = normPatient(p.name).charAt(0) || "#";
      const last = g[g.length - 1];
      if (last && last.letra === l) last.pacientes.push(p);
      else g.push({ letra: l, pacientes: [p] });
    }
    return g;
  }, [filtrados]);

  // Muda letra: se já selecionada, deseleciona
  function toggleLetra(l: string) {
    setLetra((prev) => (prev === l ? null : l));
  }

  // Muda busca: limpa letra
  function handleBuscaChange(q: string) {
    setBusca(q);
    setLetra(null);
  }

  return {
    busca,
    setBusca: handleBuscaChange,
    letra,
    setLetra: toggleLetra,
    letrasDisponiveis,
    filtrados,
    grupos,
  };
}

// ── Componente principal ────────────────────────────────────────────────────

export interface PatientSelectorBarProps {
  /** Texto atual da busca */
  busca: string;
  /** Chamado quando o texto muda */
  onBuscaChange: (v: string) => void;
  /** Letra selecionada (null = TODOS) */
  letraSelecionada: string | null;
  /** Chamado quando o usuário clica em uma letra */
  onLetraChange: (l: string | null) => void;
  /** Conjunto de letras que têm pacientes (desabilita as outras) */
  letrasDisponiveis: Set<string>;
  /** Placeholder do campo de busca */
  placeholder?: string;
  /** Classe extra para o container */
  className?: string;
}

/**
 * `PatientSelectorBar` — Barra de busca + A–Z canônica.
 *
 * Sempre use junto ao hook `usePatientFilter`.
 * Coloque dentro de um `panel-3d-sub` para seguir o design system Paxter.
 *
 * @example
 *   <div className="panel-3d-sub p-3 space-y-2 rounded-lg">
 *     <PatientSelectorBar
 *       busca={busca}
 *       onBuscaChange={setBusca}
 *       letraSelecionada={letra}
 *       onLetraChange={setLetra}
 *       letrasDisponiveis={letrasDisponiveis}
 *     />
 *   </div>
 */
export function PatientSelectorBar({
  busca,
  onBuscaChange,
  letraSelecionada,
  onLetraChange,
  letrasDisponiveis,
  placeholder = "Buscar por nome...",
  className,
}: PatientSelectorBarProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {/* Campo de busca */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder={placeholder}
          className="field-engraved w-full pl-8 pr-3 py-1.5 text-sm"
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
        />
      </div>

      {/* Barra A–Z */}
      <div className="flex flex-wrap gap-[3px]">
        {/* Botão TODOS */}
        <button
          type="button"
          onClick={() => onLetraChange(null)}
          className={cn(
            "h-6 rounded border px-2 text-[10px] font-black uppercase tracking-widest transition-colors",
            letraSelecionada === null
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          TODOS
        </button>

        {/* Uma letra por botão */}
        {LETRAS_AZ.map((l) => {
          const tem   = letrasDisponiveis.has(l);
          const ativa = letraSelecionada === l;
          return (
            <button
              key={l}
              type="button"
              disabled={!tem}
              onClick={() => onLetraChange(ativa ? null : l)}
              className={cn(
                "h-6 w-6 rounded border text-[11px] font-bold transition-colors",
                ativa
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : tem
                    ? "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                    : "cursor-not-allowed border-transparent text-muted-foreground/25",
              )}
            >
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Separador de grupo (título da letra) ────────────────────────────────────

/**
 * `PatientGroupDivider` — Título de grupo da letra na lista.
 *
 * @example
 *   grupos.map(g => (
 *     <div key={g.letra}>
 *       <PatientGroupDivider letra={g.letra} count={g.pacientes.length} />
 *       {g.pacientes.map(...)}
 *     </div>
 *   ))
 */
export function PatientGroupDivider({
  letra, count,
}: {
  letra: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 mb-1 mt-3 first:mt-0">
      <span className="bevel-3d text-xs font-black px-2 py-0.5 min-w-[1.5rem] text-center">
        {letra}
      </span>
      <div className="flex-1 h-px bg-navy/10" />
      <span className="text-[10px] text-slate-400 uppercase tracking-wider">{count}</span>
    </div>
  );
}
