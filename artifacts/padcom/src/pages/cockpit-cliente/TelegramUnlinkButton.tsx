import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getGetClientQueryKey, getListClientsQueryKey } from "@workspace/api-client-react";
import { Loader2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCollabToken } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "/api";

export default function TelegramUnlinkButton({ clientId, clientName }: {
  clientId: number;
  clientName: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const unlink = useMutation({
    mutationFn: async (id: number) => {
      const token = getCollabToken();
      const response = await fetch(`${API}/clients/${id}/telegram`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const message = response.status === 404
          ? "Paciente não encontrado ou sem permissão para desvincular."
          : `Não foi possível desvincular o Telegram (erro ${response.status}). Tente novamente.`;
        throw new Error(message);
      }
    },
    onSuccess: async (_, id) => {
      const key = getGetClientQueryKey(id);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, (current: Record<string, unknown> | undefined) =>
        current ? { ...current, telegramChatId: null, telegramLinked: false, telegramVinculadoEm: null } : current,
      );
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ["cockpit", id] });
      toast({ title: "Telegram desvinculado", description: "Os envios pelo Telegram ficam interrompidos até uma nova vinculação." });
    },
    onError: (error: Error) => toast({
      title: "Erro ao desvincular Telegram",
      description: error.message === "Failed to fetch" ? "Falha de conexão. Tente novamente." : error.message,
      variant: "destructive",
    }),
  });

  return (
    <Button
      type="button"
      className="btn-3d-soft h-auto min-h-7 text-[10px] font-black px-3 whitespace-normal text-destructive"
      disabled={unlink.isPending}
      onClick={() => {
        if (window.confirm(`Desvincular o Telegram de ${clientName}? Os envios por esse canal serão interrompidos até uma nova vinculação. O histórico de mensagens será preservado.`)) {
          unlink.mutate(clientId);
        }
      }}
    >
      {unlink.isPending
        ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin shrink-0" />
        : <Unlink className="w-3 h-3 mr-1.5 shrink-0" />}
      {unlink.isPending ? "Desvinculando…" : "Desvincular Telegram"}
    </Button>
  );
}
