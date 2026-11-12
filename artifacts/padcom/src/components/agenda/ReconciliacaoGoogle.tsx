import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { collabAuthHeaders } from "@/lib/collab-auth";

/**
 * Conferência das agendas do sistema contra os calendários REAIS da conta Google (por id do calendário, nunca só pelo nome).
 * A pré-visualização não altera nada. Aplicar só renomeia/cria agenda interna; não apaga calendário, evento nem histórico.
 * O servidor recalcula o plano ao aplicar; esta tela nunca envia o plano.
 */
const apiBase = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`;

type Item =
  | { acao: "renomear"; googleCalendarId: string; nomeAntes: string; nomeDepois: string }
  | { acao: "criar"; googleCalendarId: string; nome: string; categoria: string }
  | { acao: "igual"; googleCalendarId: string; nome: string }
  | { acao: "relatar"; googleCalendarId: string | null; nome: string; motivo: string; detalhe: string };
type Plano = { itens: Item[]; resumo: Record<string, number> };
type Resultado = { aplicados: { acao: string; nome: string }[]; falhas: { googleCalendarId: string; motivo: string }[]; depois: Plano };

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${apiBase}${caminho}`, { ...init, headers: collabAuthHeaders({ "Content-Type": "application/json" }) });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(corpo.error ?? "Não foi possível concluir a operação."));
  return corpo as T;
}

export function ReconciliacaoGoogle() {
  const { toast } = useToast();
  const [plano, setPlano] = useState<Plano | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const conferir = async () => {
    setOcupado(true); setResultado(null); setErro(null);
    try { setPlano(await chamar<Plano>("/agenda/google/reconciliacao")); }
    catch (e) { setPlano(null); setErro(e instanceof Error ? e.message : "Falha ao conferir."); }
    finally { setOcupado(false); }
  };

  const aplicar = async () => {
    const mudancas = plano?.itens.filter((i) => i.acao === "renomear" || i.acao === "criar").length ?? 0;
    if (!mudancas || !window.confirm(`Aplicar ${mudancas} ajuste(s) nas agendas do sistema? Nenhum calendário, evento ou histórico do Google será apagado.`)) return;
    setOcupado(true);
    try {
      const r = await chamar<Resultado>("/agenda/google/reconciliacao/aplicar", { method: "POST", body: JSON.stringify({ confirmar: true }) });
      setResultado(r); setPlano(r.depois);
      toast({ title: r.falhas.length ? "Aplicado com falhas" : "Ajustes aplicados", description: `${r.aplicados.length} aplicado(s), ${r.falhas.length} falha(s).`, variant: r.falhas.length ? "destructive" : undefined });
    } catch (e) { toast({ title: "Nada foi aplicado", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); }
    finally { setOcupado(false); }
  };

  const descrever = (i: Item) =>
    i.acao === "renomear" ? `Renomear “${i.nomeAntes}” para “${i.nomeDepois}”`
      : i.acao === "criar" ? `Criar agenda “${i.nome}” (${i.categoria})`
        : i.acao === "igual" ? `“${i.nome}” já confere`
          : `“${i.nome}”: ${i.detalhe}`;
  const ROTULO = { renomear: "Renomear", criar: "Criar", igual: "Confere", relatar: "Atenção" } as const;

  return (
    <section className="panel-3d-sub space-y-3 p-4" aria-label="Conferência com o Google" data-testid="reconciliacao-google">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">Conferir nomes e agendas com o Google</h2>
        <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void conferir()}>Conferir (não altera nada)</Button>
        {plano && plano.itens.some((i) => i.acao === "renomear" || i.acao === "criar") && (
          <Button type="button" size="sm" disabled={ocupado} onClick={() => void aplicar()}>Aplicar ajustes</Button>
        )}
      </div>
      {erro && <p role="alert" className="text-xs font-bold text-red-800" data-testid="reconciliacao-erro">{erro} Nada foi conferido; não há prova de sincronização.</p>}
      {plano && (
        <ul className="space-y-1 text-xs" data-testid="reconciliacao-itens">
          {plano.itens.map((i, n) => (
            <li key={`${i.googleCalendarId ?? "sem-id"}-${n}`} className="concave-3d flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="bevel-3d px-2 py-1 text-[10px] font-black uppercase tracking-widest">{ROTULO[i.acao]}</span>
              <span>{descrever(i)}</span>
            </li>
          ))}
          {plano.itens.length === 0 && <li>Nenhum calendário encontrado na conta.</li>}
        </ul>
      )}
      {resultado?.falhas.map((f) => <p key={f.googleCalendarId} role="alert" className="text-xs font-bold text-red-800">Falhou ({f.googleCalendarId}): {f.motivo}</p>)}
    </section>
  );
}
