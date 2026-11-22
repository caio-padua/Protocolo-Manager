import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BotaoAjuda } from "./BotaoAjuda";
import "./pulso-niveis.css";

// "?" dos painéis que resumem os outros (médias e tabela de registros). Não tem artigo próprio:
// as referências nacional e internacional ficam no "?" de cada medida, e a janela avisa isso.
export function AjudaPainelDialog({ titulo, escuro, children }: { titulo: string; escuro: boolean; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <BotaoAjuda aberto={aberto} onClick={() => setAberto((a) => !a)} rotulo={titulo} />
      {aberto && (
        <Dialog open onOpenChange={(o) => { if (!o) setAberto(false); }}>
          <DialogContent className={`${escuro ? "dark " : ""}pn-escopo !top-[8vh] !translate-y-0 max-h-[84vh] w-[min(94vw,480px)] max-w-none overflow-y-auto border border-border bg-background p-5`} style={{ color: "var(--pn-tinta)" }}>
            <DialogTitle className="pr-8 text-base font-black uppercase tracking-wide">{titulo}</DialogTitle>
            <DialogDescription className="sr-only">Como ler este painel</DialogDescription>
            <h4 className="pn-sec-rotulo mt-4">Como ler</h4>
            <div className="grid gap-3 pn-texto">{children}</div>
            <h4 className="pn-sec-rotulo mt-5">Referências</h4>
            <p className="pn-texto">As referências científicas, nacional e internacional, estão no "?" de cada medida: Pressão arterial, Glicemia, Frequência cardíaca, Energia, Libido e Sono.</p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
