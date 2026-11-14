import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Comunicacao = {
  botUsername: string;
  botLink: string;
  telegram: { vinculado: boolean; senhaGerada: boolean; senha: string | null; senhaGeradaEm: string | null };
  contato: { temEmail: boolean; temTelefone: boolean };
  areaCliente: { temCpf: boolean; temDataNascimento: boolean; temSenhaPropria: boolean };
};

const apiBase = import.meta.env.VITE_API_URL || "/api";

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 py-2 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-semibold text-right">{valor}</span>
    </div>
  );
}

export function ClientComunicacao({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["client-comunicacao", clientId];
  const { data, isLoading, error } = useQuery<Comunicacao>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch(`${apiBase}/clients/${clientId}/comunicacao`);
      if (!r.ok) throw new Error("Não foi possível carregar a comunicação do cliente.");
      return r.json();
    },
  });

  const acao = useMutation({
    mutationFn: async (p: { caminho: string; metodo: "POST" | "DELETE"; ok: string }) => {
      const r = await fetch(`${apiBase}/clients/${clientId}/${p.caminho}`, { method: p.metodo });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Não foi possível concluir.");
      return p.ok;
    },
    onSuccess: (msg) => { toast({ title: msg }); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (error || !data) return <p className="text-sm text-destructive">{(error as Error)?.message ?? "Erro."}</p>;
  const { telegram: t, areaCliente: a, contato } = data;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="panel-3d-sub p-5 space-y-3">
        <h3 className="text-[11px] font-black uppercase tracking-widest">Telegram (@{data.botUsername})</h3>
        <Linha rotulo="Situação" valor={t.vinculado ? "Vinculado" : "Ainda não vinculado"} />
        <Linha rotulo="Senha de validação" valor={t.senha ?? "Ainda não gerada"} />
        <Linha rotulo="E-mail cadastrado" valor={contato.temEmail ? "Sim" : "Não"} />
        {!t.vinculado && (
          <>
            <p className="text-xs text-muted-foreground">
              O cliente abre o robô, toca em Iniciar e envia a senha acima. Assim o sistema sabe que o Telegram é dele.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={acao.isPending}
                onClick={() => acao.mutate({ caminho: "activate-telegram", metodo: "POST", ok: "Senha de validação gerada." })}>
                {t.senhaGerada ? "Gerar novamente" : "Gerar senha de validação"}
              </Button>
              {t.senhaGerada && contato.temEmail && (
                <Button size="sm" variant="outline" disabled={acao.isPending}
                  onClick={() => acao.mutate({ caminho: "resend-telegram-onboarding", metodo: "POST", ok: "E-mail reenviado ao cliente." })}>
                  Reenviar e-mail de ativação
                </Button>
              )}
            </div>
          </>
        )}
        {t.vinculado && (
          <Button size="sm" variant="outline" disabled={acao.isPending}
            onClick={() => { if (window.confirm("Remover o vínculo do Telegram deste cliente?")) acao.mutate({ caminho: "telegram", metodo: "DELETE", ok: "Vínculo removido." }); }}>
            Desvincular Telegram
          </Button>
        )}
      </section>

      <section className="panel-3d-sub p-5 space-y-3">
        <h3 className="text-[11px] font-black uppercase tracking-widest">Área do Cliente</h3>
        <Linha rotulo="CPF cadastrado" valor={a.temCpf ? "Sim" : "Não"} />
        <Linha rotulo="Data de nascimento" valor={a.temDataNascimento ? "Sim" : "Não"} />
        <Linha rotulo="Senha própria" valor={a.temSenhaPropria ? "Criada" : "Ainda não criada"} />
        <p className="text-xs text-muted-foreground">
          {a.temSenhaPropria
            ? "O cliente entra com CPF e senha. Se esquecer, ele pode entrar com CPF e data de nascimento."
            : "O cliente ainda não tem senha. Ele entra com CPF e data de nascimento e vê na aba COMUNICAÇÃO a senha do Telegram."}
        </p>
        <p className="text-xs text-muted-foreground">
          A mesma senha de validação aparece na Área do Cliente, na aba COMUNICAÇÃO.
        </p>
      </section>
    </div>
  );
}
