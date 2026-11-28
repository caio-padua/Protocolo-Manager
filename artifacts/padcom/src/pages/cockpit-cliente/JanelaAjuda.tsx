import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import "./pulso-niveis.css";

/**
 * MOLDE ÚNICO da janela do "?" (Pulso Diário, cockpit, Área do Cliente e Antropometria).
 * Ordem FIXA, decidida pelo CEO em 22/11/2026:
 *   1. Botões coloridos (níveis / como dar a nota)  — EM CIMA
 *   2. O que é, por que medimos, a importância      — no meio
 *   3. Para lembrar (opcional)
 *   4. Referências bibliográficas                   — EMBAIXO, sempre abertas (sem recolher)
 * Regra escrita em .agents/skills/skill-layout-paxter/references/botao-ajuda-interrogacao.md
 */
export function JanelaAjuda({ aberto = true, onClose, escuro, titulo, subtitulo, apelido, rotuloTopo, topo, rotuloPorque = "O que é e por que medimos", porque, lembrar, referencias }: {
  aberto?: boolean; onClose: () => void; escuro: boolean; titulo: string; subtitulo?: string; apelido?: string;
  rotuloTopo: string; topo: ReactNode; rotuloPorque?: string; porque: ReactNode; lembrar?: ReactNode; referencias: ReactNode;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${escuro ? "dark " : ""}pn-escopo !top-[6vh] !translate-y-0 max-h-[88vh] w-[min(94vw,560px)] max-w-none overflow-y-auto border border-border bg-background p-5 text-foreground`}
        style={{ color: "var(--pn-tinta)" }}>
        <div className="pr-8">
          <DialogTitle className="text-base font-black uppercase tracking-wide">{titulo}</DialogTitle>
          {apelido && <p className="pn-apelido">{apelido}</p>}
          <DialogDescription className={subtitulo ? "pn-texto" : "sr-only"} style={subtitulo ? { color: "var(--pn-mudo)" } : undefined}>{subtitulo ?? titulo}</DialogDescription>
        </div>
        <h4 className="pn-sec-rotulo mt-4">{rotuloTopo}</h4>
        {topo}
        <h4 className="pn-sec-rotulo mt-5">{rotuloPorque}</h4>
        {porque}
        {lembrar && (<><h4 className="pn-sec-rotulo mt-5">Para lembrar</h4>{lembrar}</>)}
        <div className="mt-5">{referencias}</div>
      </DialogContent>
    </Dialog>
  );
}
