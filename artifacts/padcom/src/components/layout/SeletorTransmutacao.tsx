import { Repeat, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { HOMOLOGACAO_PERMISSOES, PERFIS_SIMULADOS, definirPerfilSimulado } from "@/lib/transmutacao";

/** Seletor de Transmutação: só o CEO vê. Simulação visual; o servidor continua decidindo. */
export function SeletorTransmutacao({ perfilId, compacto }: { perfilId: string; compacto: boolean }) {
  const qc = useQueryClient();
  const simulando = perfilId !== "ceo";

  function trocar(id: string) {
    // Limpeza de estado: zera o cache de dados e o Layout remonta a tela (chave = perfil).
    qc.clear();
    definirPerfilSimulado(id);
  }

  if (compacto) {
    return (
      <div className="px-2 pb-2 flex justify-center" title="Seletor de Transmutação (expanda o menu)">
        <Repeat className={`w-4 h-4 ${simulando ? "text-amber-400" : "text-sidebar-foreground/50"}`} />
      </div>
    );
  }
  return (
    <div className="px-3 pb-3 space-y-1" data-testid="seletor-transmutacao">
      <label htmlFor="seletor-transmutacao" className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
        <Repeat className="w-3.5 h-3.5" /> Seletor de Transmutação
      </label>
      <select
        id="seletor-transmutacao"
        value={perfilId}
        onChange={(e) => trocar(e.target.value)}
        className="w-full rounded-[5px] border border-sidebar-primary/40 bg-sidebar-accent text-sidebar-accent-foreground text-xs px-2 py-1.5"
      >
        {PERFIS_SIMULADOS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
      </select>
      {simulando && (
        <p role="status" data-testid="aviso-simulacao" className="text-[10px] leading-snug text-amber-300 flex gap-1">
          <Lock className="w-3 h-3 shrink-0 mt-px" />
          Simulação visual. O servidor continua decidindo o acesso real.
          {HOMOLOGACAO_PERMISSOES ? " Modo homologação: telas bloqueadas ficam riscadas." : ""}
        </p>
      )}
    </div>
  );
}

/** Item de menu bloqueado na simulação: acinzentado, riscado, com cadeado e sem clique. */
export function ItemTravado({ nome, Icon, compacto }: { nome: string; Icon: React.ComponentType<{ className?: string }>; compacto: boolean }) {
  return (
    <div
      aria-disabled="true"
      data-testid="item-travado"
      title={`${nome} — acesso restrito neste perfil`}
      className={`flex items-center ${compacto ? "justify-center" : "gap-3"} px-3 py-2 rounded-[5px] border border-transparent opacity-45 cursor-not-allowed select-none text-sidebar-foreground/70`}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      {!compacto && (
        <>
          <span className="text-[13px] tracking-wide flex-1 line-through">{nome}</span>
          <Lock className="w-3.5 h-3.5 shrink-0" aria-label="acesso restrito" />
        </>
      )}
    </div>
  );
}
