import { Lock } from "lucide-react";

// Recursos exclusivos de plano. Cadeado dourado clicável: leva à tela "Meu Plano / Conta".
// Honestidade: estes recursos ainda não existem; o cartão diz isso e nada é cobrado por clicar.
const RECURSOS = [
  { nome: "Exames & Comparativo com IA", plano: "Premium", detalhe: "Comparação dos seus exames ao longo do tempo com apoio de IA." },
  { nome: "Preparador de Consulta", plano: "Premium", detalhe: "Resumo organizado para levar à consulta." },
  { nome: "Guardião Família", plano: "Família", detalhe: "Cofre e acompanhamento compartilhados com familiares." },
  { nome: "Créditos de IA", plano: "Créditos IA", detalhe: "Pacote de usos de inteligência artificial." },
] as const;

export default function RecursosPremiumCliente({ onAbrirPlano }: { onAbrirPlano: () => void }) {
  return (
    <div className="space-y-3" data-testid="recursos-premium">
      <p className="text-xs text-muted-foreground">Recursos de plano. Toque no cadeado para ver os planos disponíveis. Nada é contratado ou cobrado sem o seu aceite.</p>
      {RECURSOS.map((r) => (
        <button key={r.nome} type="button" onClick={onAbrirPlano} aria-label={`${r.nome}: recurso do plano ${r.plano}. Abrir Meu Plano`}
          className="panel-3d rounded-xl p-4 w-full text-left flex items-start gap-3 min-h-[44px]">
          <span className="bevel-3d rounded-md p-2 shrink-0"><Lock className="w-5 h-5" style={{ color: "#C9A227" }} /></span>
          <span className="min-w-0">
            <span className="block text-primary font-black text-xs uppercase tracking-widest">{r.nome}</span>
            <span className="block text-[10px] font-black uppercase tracking-widest" style={{ color: "#C9A227" }}>Plano {r.plano}</span>
            <span className="block text-xs text-muted-foreground mt-1">{r.detalhe} Em breve: ainda não disponível e sem cobrança.</span>
          </span>
        </button>
      ))}
    </div>
  );
}
