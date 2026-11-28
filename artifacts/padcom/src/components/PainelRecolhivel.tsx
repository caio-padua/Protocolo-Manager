/**
 * Painel horizontal em relevo que expande e recolhe pela seta no extremo direito.
 * Nasce aberto. O conteúdo continua montado ao recolher, para não perder o que foi digitado ou emitido.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function PainelRecolhivel({ titulo, children, iniciarAberto = true, testId }: {
  titulo: string; children: ReactNode; iniciarAberto?: boolean; testId?: string;
}) {
  const [aberto, setAberto] = useState(iniciarAberto);
  return (
    <section className="panel-3d-sub min-w-0 space-y-3 !rounded-[3px] p-2" data-testid={testId}>
      <button
        type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}
        className="bevel-3d flex w-full items-center justify-between gap-3 !rounded-[3px] px-4 py-2.5 text-left"
      >
        <span className="text-sm font-black uppercase tracking-widest">{titulo}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${aberto ? "" : "-rotate-90"}`} aria-hidden="true" />
      </button>
      <div hidden={!aberto} className="min-w-0 space-y-3 px-1 pb-1">{children}</div>
    </section>
  );
}
