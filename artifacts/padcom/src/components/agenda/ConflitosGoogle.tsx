import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { collabAuthHeaders } from "@/lib/collab-auth";

/**
 * Avisos de conflito com o Google: o horário de uma visita foi alterado (ou o evento apagado) direto no Google.
 * O sistema NÃO sobrescreve em silêncio: a decisão é humana. "Enviar o do sistema" reenvia horário e título ao MESMO evento;
 * "Manter o do Google" só encerra o aviso e não envia nada. Nenhum título, cliente ou CPF aparece aqui.
 */
const apiBase = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`;

interface Conflito {
  id: number; sessaoId: number; tipo: "alterado" | "apagado"; agenda: string | null;
  remotoInicio: string | null; remotoFim: string | null; sistemaInicio: string | null; sistemaFim: string | null; criadoEm: string;
}
type Decisao = "enviar_sistema" | "dispensar";

const fmt = (iso: string | null) => iso
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso))
  : "—";

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${apiBase}${caminho}`, { ...init, headers: collabAuthHeaders({ "Content-Type": "application/json" }) });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(corpo.error ?? "Não foi possível concluir a operação."));
  return corpo as T;
}

export function ConflitosGoogle() {
  const { toast } = useToast();
  const [lista, setLista] = useState<Conflito[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pendente, setPendente] = useState<{ c: Conflito; decisao: Decisao } | null>(null);

  const carregar = useCallback(async () => {
    try { setLista((await chamar<{ conflitos: Conflito[] }>("/agenda/google/conflitos")).conflitos); setErro(null); }
    catch (e) { setLista(null); setErro(e instanceof Error ? e.message : "Falha ao consultar os avisos."); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const decidir = async () => {
    if (!pendente) return;
    const { c, decisao } = pendente;
    setPendente(null); setOcupado(true);
    try {
      const r = await chamar<{ mensagem: string }>(`/agenda/google/conflitos/${c.id}/resolver`, { method: "POST", body: JSON.stringify({ decisao, confirmar: true }) });
      toast({ title: decisao === "enviar_sistema" ? "Horário do sistema enviado ao Google" : "Aviso encerrado", description: r.mensagem });
    } catch (e) {
      toast({ title: "Nada foi alterado no Google", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setOcupado(false); await carregar(); }
  };

  return (
    <section className="panel-3d-sub space-y-3 p-4" aria-label="Conflitos com o Google" data-testid="conflitos-google">
      <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">Avisos de conflito com o Google</h2>
      {erro && <p role="alert" className="text-xs font-bold text-red-800" data-testid="conflitos-erro">{erro} Não há prova de que o Google esteja em ordem.</p>}
      {lista && lista.length === 0 && <p className="text-xs text-muted-foreground" data-testid="conflitos-vazio">Nenhum aviso aberto. Todo horário alterado direto no Google será mostrado aqui antes de qualquer envio.</p>}
      <ul className="space-y-2">
        {(lista ?? []).map((c) => (
          <li key={c.id} className="concave-3d space-y-2 p-3 text-xs" data-testid={`conflito-${c.id}`}>
            <p className="flex items-center gap-2 font-black uppercase tracking-widest text-amber-700">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {c.tipo === "apagado" ? "Evento apagado no Google" : "Horário alterado no Google"}
              {c.agenda && <span className="text-muted-foreground">· {c.agenda}</span>}
            </p>
            <table className="w-full text-left">
              <thead><tr className="bevel-3d text-[10px] uppercase tracking-widest"><th className="px-2 py-1">Origem</th><th className="px-2 py-1">Início</th><th className="px-2 py-1">Fim</th></tr></thead>
              <tbody>
                <tr><td className="px-2 py-1 font-bold">Sistema (visita {c.sessaoId})</td><td className="px-2 py-1 tabular-nums">{fmt(c.sistemaInicio)}</td><td className="px-2 py-1 tabular-nums">{fmt(c.sistemaFim)}</td></tr>
                <tr><td className="px-2 py-1 font-bold">Google (agora)</td><td className="px-2 py-1 tabular-nums">{c.tipo === "apagado" ? "Apagado" : fmt(c.remotoInicio)}</td><td className="px-2 py-1 tabular-nums">{c.tipo === "apagado" ? "—" : fmt(c.remotoFim)}</td></tr>
              </tbody>
            </table>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => setPendente({ c, decisao: "dispensar" })}>Manter o do Google</Button>
              <Button type="button" size="sm" disabled={ocupado} onClick={() => setPendente({ c, decisao: "enviar_sistema" })}>Enviar o do sistema</Button>
            </div>
          </li>
        ))}
      </ul>
      <AlertDialog open={!!pendente} onOpenChange={(aberto) => { if (!aberto) setPendente(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendente?.decisao === "enviar_sistema" ? "Enviar o horário do sistema ao Google?" : "Manter o horário do Google?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendente?.decisao === "enviar_sistema"
                ? "O horário e o título do sistema substituem o que está no Google, no mesmo evento. Nenhum evento novo é criado."
                : "O aviso é encerrado e nada é enviado ao Google. O horário do sistema continua diferente até alguém ajustar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void decidir()}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
