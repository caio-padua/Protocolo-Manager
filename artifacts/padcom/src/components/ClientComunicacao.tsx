import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type Comunicacao = {
  botUsername: string;
  botLink: string;
  telegram: { vinculado: boolean; senhaGerada: boolean; senha: string | null; senhaGeradaEm: string | null; codigoRepetido: boolean };
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

  const [link, setLink] = useState<{ url: string; expiraEm: string } | null>(null);
  const gerarLink = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase}/clients/${clientId}/telegram-link`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Não foi possível gerar o link.");
      return j as { url: string; expiraEm: string };
    },
    onSuccess: (j) => { setLink(j); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
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
        <Linha rotulo="Código de validação do cadastro" valor={t.senha ?? "Ainda não gerado"} />
        <Linha rotulo="E-mail cadastrado" valor={contato.temEmail ? "Sim" : "Não"} />
        {!t.vinculado && (
          <>
            <p className="text-xs text-muted-foreground">
              Caminho mais simples: gere o <b>link individual</b> e envie ao cliente. Com um toque no link, o Telegram dele fica ligado a este cadastro, sem digitar nada.
              O <b>código de validação</b> é do cadastro da clínica (não é a senha do Telegram) e serve só quando não for possível usar o link.
            </p>
            {t.codigoRepetido && (
              <p className="text-xs font-semibold text-destructive">
                Este código aparece em mais de um cadastro e não vincula com segurança. Use o link individual.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={gerarLink.isPending} onClick={() => gerarLink.mutate()}>
                Gerar link individual
              </Button>
              <Button size="sm" variant="outline" disabled={acao.isPending}
                onClick={() => acao.mutate({ caminho: "activate-telegram", metodo: "POST", ok: "Código de validação gerado." })}>
                {t.senhaGerada ? "Gerar código novamente" : "Gerar código de validação"}
              </Button>
              {t.senhaGerada && contato.temEmail && (
                <Button size="sm" variant="outline" disabled={acao.isPending}
                  onClick={() => acao.mutate({ caminho: "resend-telegram-onboarding", metodo: "POST", ok: "E-mail de ativação enviado ao cliente." })}>
                  Enviar e-mail de ativação
                </Button>
              )}
            </div>
            {link && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="break-all font-mono text-xs">{link.url}</div>
                <div className="text-xs text-muted-foreground">
                  Vale uma vez e expira em {new Date(link.expiraEm).toLocaleDateString("pt-BR")}. Gerar outro invalida este.
                </div>
                <Button size="sm" variant="outline"
                  onClick={() => navigator.clipboard.writeText(link.url).then(() => toast({ title: "Link copiado." }))}>
                  Copiar link
                </Button>
              </div>
            )}
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
            ? "O cliente entra com CPF e senha. Se esquecer a senha, na tela de entrada ele toca em \"Entrar com data de nascimento\"."
            : "O cliente ainda não criou senha. Na tela de entrada ele usa CPF e data de nascimento."}
        </p>
        <p className="text-xs text-muted-foreground">
          Na Área do Cliente, aba COMUNICAÇÃO, ele encontra o passo a passo e o próprio link individual.
        </p>
      </section>
    </div>
  );
}
