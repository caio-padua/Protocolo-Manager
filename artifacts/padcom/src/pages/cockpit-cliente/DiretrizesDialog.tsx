import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BookOpen } from "lucide-react";
import { NIVEIS, faixasGlicemia, faixasPressao } from "./pulso-faixas";
import "./pulso-niveis.css";

// Parâmetros e diretrizes de referência, para consulta rápida durante a conversa com o cliente.
export function DiretrizesDialog({ tipo, escuro, onClose }: { tipo: "pressao" | "glicemia" | null; escuro: boolean; onClose: () => void }) {
  if (!tipo) return null;
  const pressao = tipo === "pressao";
  const fp = faixasPressao(), fg = faixasGlicemia();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${escuro ? "dark " : ""}pn-escopo !top-[6vh] !translate-y-0 max-h-[88vh] w-[min(94vw,560px)] max-w-none overflow-y-auto border border-border bg-background p-5 text-foreground`}
        style={{ color: "var(--pn-tinta)" }}>
        <div className="flex items-center gap-3 pr-8">
          <BookOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <DialogTitle className="text-base font-black uppercase tracking-wide">{pressao ? "Pressão arterial: parâmetros" : "Glicemia de jejum: parâmetros"}</DialogTitle>
            <DialogDescription className="text-xs" style={{ color: "var(--pn-mudo)" }}>Adultos. Os números abaixo são os usados por este consultório.</DialogDescription>
          </div>
        </div>
        <table className="pn-tab mt-4" style={{ tableLayout: "auto" }}>
          <thead><tr><th style={{ textAlign: "left" }}>Nível</th>{pressao ? <><th>Máxima (mmHg)</th><th>Mínima (mmHg)</th></> : <th>mg/dL</th>}</tr></thead>
          <tbody>
            {NIVEIS.map((n) => (
              <tr key={n.id}>
                <td style={{ textAlign: "left" }}><span className="bevel-3d pn-chip" data-nivel={n.id}>{n.nome}</span></td>
                {pressao ? <><td>{fp[n.id][0]}</td><td>{fp[n.id][1]}</td></> : <td>{fg[n.id]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-4 space-y-2 text-[12.5px] leading-relaxed">
          {pressao ? (
            <>
              <li>Vale o pior dos dois números da leitura.</li>
              <li>Pressão medida em casa: a meta é ficar abaixo de 130/80. É a média de 7 dias que orienta a conduta, não uma leitura isolada.</li>
              <li>Referência: Diretrizes Brasileiras de Hipertensão Arterial (Sociedade Brasileira de Cardiologia).</li>
              <li>Os níveis "baixo" e "muito baixo" seguem critério clínico do consultório.</li>
              <li>180/110 ou mais: procurar atendimento.</li>
            </>
          ) : (
            <>
              <li>Jejum de pelo menos 8 horas.</li>
              <li>Normal: abaixo de 100. De 100 a 125: faixa de pré-diabetes. 126 ou mais: faixa de diabetes, sempre confirmada em outro dia, com exame de laboratório.</li>
              <li>Abaixo de 70: hipoglicemia. Abaixo de 54: hipoglicemia importante.</li>
              <li>Referência: Diretrizes da Sociedade Brasileira de Diabetes e Standards of Care da American Diabetes Association.</li>
            </>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
