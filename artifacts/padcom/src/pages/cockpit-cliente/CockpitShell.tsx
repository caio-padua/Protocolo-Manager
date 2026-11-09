// CockpitShell — componente raiz do Cockpit da Consulta v2.
// Lê initialClientId + initialAba via props (passadas pelo Route em App.tsx).
// Navega por useLocation do wouter — zero window.location, zero full reload.
// Regras de arquitetura (specs/cockpit-v2.md):
//   R-ARCH-7: URL é a única fonte de verdade (sem localStorage para clientId/aba)
//   R-ARCH-6: key={clientId} no Route garante remontagem ao trocar de cliente
//   R-PICKER-4: useListClients() REMOVIDO deste componente

import { useState, useMemo, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetClient, useListProtocols, useListPayments,
  getGetClientQueryKey, getListPaymentsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { UserRound } from "lucide-react";

import CockpitHeader from "./CockpitHeader";
import CockpitTabs, { type AbaId } from "./CockpitTabs";
import CockpitContent from "./CockpitContent";
import AcompanhamentoDiarioPanel from "./panels/AcompanhamentoDiarioPanel";
import { useProtocoloNavigationGuard } from "./useProtocoloNavigationGuard";

const API = import.meta.env.VITE_API_URL || "/api";
const CREAM = "hsl(40 33% 96%)";

const ABAS_VALIDAS: AbaId[] = [
  "prescricao","injetaveis","implantes","exames","evolucao",
  "anamnese","documentos","protocolos","dieta-treino","financeiro","cadastro",
  "telegram",
];

interface CockpitShellProps {
  initialClientId?: number | null;
  initialAba?: AbaId;
}

export default function CockpitShell({
  initialClientId = null,
  initialAba = "prescricao",
}: CockpitShellProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [novoProtocoloAberto, setNovoProtocoloAberto] = useState(false);
  const [protocoloEmAndamento, setProtocoloEmAndamento] = useState(false);
  const avisoOperacaoPendente = useCallback(() => {
    toast({ title: "Aguarde a conclusão do protocolo antes de sair desta tela." });
  }, [toast]);
  useProtocoloNavigationGuard(protocoloEmAndamento, avisoOperacaoPendente);

  // ── Estado local: somente o que não está na URL ──────────────────────────
  // clientId e aba vêm como props (derivadas da URL pelo Route no App.tsx).
  const clientId = initialClientId;
  const aba: AbaId = ABAS_VALIDAS.includes(initialAba) ? initialAba : "prescricao";

  // ── Dados ─────────────────────────────────────────────────────────────────
  const { data: client, isLoading: clientLoading, isError: clientError, refetch: retryClient } = useGetClient(clientId ?? 0, {
    query: { enabled: !!clientId, queryKey: getGetClientQueryKey(clientId ?? 0) },
  });
  const clientReady = !!clientId && !clientError && client?.id === clientId;
  const clientConfirmado = useRef<typeof client>(undefined);
  if (clientReady) clientConfirmado.current = client;
  const manterOperacao = protocoloEmAndamento && clientConfirmado.current?.id === clientId;
  const clientParaConteudo = clientReady ? client : manterOperacao ? clientConfirmado.current : undefined;

  // Contagens para badges nas abas
  const { data: protocols } = useListProtocols(
    { clientId: clientId ?? 0 },
    { query: { enabled: !!clientId, queryKey: ["protocols", clientId] } },
  );
  const { data: payments } = useListPayments(
    { clientId: clientId ?? 0 },
    { query: { enabled: !!clientId, queryKey: getListPaymentsQueryKey({ clientId: clientId ?? 0 }) } },
  );

  const protocolCount = useMemo(() => protocols?.length ?? 0, [protocols]);
  const paymentCount  = useMemo(
    () => (payments ?? []).filter(p => p.status === "pending" || p.status === "overdue").length,
    [payments],
  );

  // ── Navegação (SPA — zero window.location) ────────────────────────────────
  function onSelectClient(id: number | null) {
    if (protocoloEmAndamento) {
      toast({ title: "Aguarde a conclusão do protocolo antes de trocar de cliente." });
      return;
    }
    if (novoProtocoloAberto && !window.confirm("Ao trocar de cliente, o preenchimento do protocolo será perdido. Continuar?")) return;
    setNovoProtocoloAberto(false);
    if (id == null) navigate("/cockpit");
    else navigate(`/cockpit/${id}/prescricao`);
  }

  function onAba(novaAba: AbaId) {
    if (!clientId) return;
    if (protocoloEmAndamento && novaAba !== "protocolos") {
      toast({ title: "Aguarde a conclusão do protocolo antes de trocar de aba." });
      return;
    }
    if (novoProtocoloAberto && novaAba !== "protocolos") {
      if (!window.confirm("Ao trocar de aba, o preenchimento do protocolo será perdido. Continuar?")) return;
      setNovoProtocoloAberto(false);
    }
    navigate(`/cockpit/${clientId}/${novaAba}`, { replace: true } as any);
  }

  function abrirNovoProtocolo() {
    if (!clientReady || !clientId) return;
    setNovoProtocoloAberto(true);
    if (aba !== "protocolos") navigate(`/cockpit/${clientId}/protocolos`);
  }

  function fecharNovoProtocolo() {
    if (protocoloEmAndamento) {
      toast({ title: "Aguarde a conclusão do protocolo antes de fechar." });
      return;
    }
    if (window.confirm("Ao fechar, o preenchimento do protocolo será perdido. Continuar?")) {
      setNovoProtocoloAberto(false);
    }
  }

  // ── Mutation: configurar Drive ────────────────────────────────────────────
  const driveSetup = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/google-drive/setup-client/${clientId}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Drive configurado!" });
      queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId ?? 0) });
    },
    onError: (err: Error) =>
      toast({ title: "Erro ao configurar Drive", description: err.message, variant: "destructive" }),
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM }}>

      {/* ── BLOCO STICKY: header + régua de abas ─────────────────────────── */}
      <div className="sticky top-0 z-50">
        <CockpitHeader
          client={clientReady ? client : null}
          clientId={clientId}
          onSelectClient={onSelectClient}
          driveSetupPending={driveSetup.isPending}
          onDriveSetup={() => driveSetup.mutate()}
          onNewProtocol={abrirNovoProtocolo}
        />
        {clientReady && (
          <CockpitTabs
            aba={aba}
            onAba={onAba}
            protocolCount={protocolCount}
            paymentCount={paymentCount}
          />
        )}
      </div>

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <main className="px-4 py-6">
        {!clientId ? (
          // Estado vazio — guia o usuário
          <div className="panel-3d mx-auto mt-10 max-w-xl p-8 text-center">
            <UserRound
              className="mx-auto mb-3 h-8 w-8"
              style={{ color: "#9a7b32" }}
            />
            <div
              className="text-[15px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "#16294a" }}
            >
              Busque o Paciente
            </div>
            <p className="mt-2 text-sm text-[#647c97]">
              Use o campo de busca acima para encontrar o paciente pelo nome ou CPF.
              Todas as ferramentas da consulta — prescrição, injetáveis, implantes,
              exames, evolução, anamnese, protocolos, financeiro e cadastro — ficam
              nesta tela sem trocar de página.
            </p>
          </div>
        ) : (
          <>
          {!clientReady && <div className="panel-3d mx-auto mt-10 max-w-xl p-8 text-center" role="status">
            {clientLoading && !clientError ? (
              <p>Carregando os dados do cliente…</p>
            ) : (
              <>
                <p>Não foi possível confirmar o cliente ou seu acesso. As ferramentas estão temporariamente indisponíveis.</p>
                <button type="button" className="btn-3d-soft mt-4 px-4 py-2" onClick={() => void retryClient()}>
                  Tentar novamente
                </button>
              </>
            )}
          </div>}
          {clientParaConteudo && <div className="space-y-4" hidden={!clientReady}>
            {/* Acompanhamento diário sempre visível acima do conteúdo da aba */}
            <AcompanhamentoDiarioPanel clientId={clientId} />
            {/* Conteúdo da aba ativa — lazy loaded */}
            <CockpitContent
              clientId={clientId}
              client={clientParaConteudo}
              aba={aba}
              novoProtocoloAberto={novoProtocoloAberto}
              protocoloEmAndamento={protocoloEmAndamento}
              onProtocoloEmAndamento={setProtocoloEmAndamento}
              onNovoProtocolo={abrirNovoProtocolo}
              onFecharProtocolo={fecharNovoProtocolo}
              onProtocoloCriado={() => setNovoProtocoloAberto(false)}
            />
          </div>}
          </>
        )}
      </main>
    </div>
  );
}
