import { useEffect, useState } from "react";
import {
  useGetESignatureSettings,
  useUpdateESignatureSettings,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PenTool, Save, KeyRound } from "lucide-react";
import { SettingsPanel, FieldRow, SecretBadge } from "@/components/settings/SettingsUI";

export default function ConfigAssinatura() {
  const { toast } = useToast();
  const q = useGetESignatureSettings();
  const [active, setActive] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (q.data) setActive(q.data.active);
  }, [q.data]);

  const save = useUpdateESignatureSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Assinatura eletronica salva" });
        setToken("");
        q.refetch();
      },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    },
  });

  function persist() {
    save.mutate({ data: { active, token: token.trim() === "" ? null : token.trim() } });
  }

  const st = q.data?.tokenStatus;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Assinatura Eletronica</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Integracao com a ZapSign para coleta de assinatura eletronica do cliente. O token de acesso fica guardado
          cifrado no cofre — nunca aparece de volta na tela.
        </p>
      </header>

      {q.isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <SettingsPanel
          icon={PenTool}
          title="ZapSign"
          color="cyan"
          titleTrailing={
            <span
              className={`paxter-led ${active ? "paxter-led-green" : "paxter-led-amber"}`}
              aria-label={active ? "Integracao ativa" : "Integracao inativa"}
              title={active ? "Integracao ativa" : "Integracao inativa"}
            />
          }
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              persist();
            }}
          >
            <div className="concave-3d flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide">Integracao ativa</div>
                <div className="text-[12px] text-muted-foreground">Liga/desliga o envio para a ZapSign.</div>
              </div>
              <Switch checked={active} onCheckedChange={setActive} aria-label="Integracao ativa" />
            </div>

            <FieldRow label="Token de acesso (API)" hint="Deixe em branco para manter o token atual. Preencha apenas para trocar.">
              <Input
                className="field-engraved"
                type="password"
                autoComplete="new-password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={st?.isSet ? "•••••••• (manter atual)" : "Cole o token da ZapSign"}
              />
            </FieldRow>

            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Token atual</span>
              <SecretBadge isSet={!!st?.isSet} masked={st?.masked} source={st?.source} />
            </div>

            <div className="flex justify-end">
              <Button type="submit" className="btn-3d" disabled={save.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {save.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </SettingsPanel>
      )}
    </div>
  );
}
