// CockpitShell — componente raiz do Cockpit da Consulta v2.
// Lê initialClientId + initialAba via props (passadas pelo Route em App.tsx).
// Navega por useLocation do wouter — zero window.location, zero full reload.
// Regras de arquitetura (specs/cockpit-v2.md):
//   R-ARCH-7: URL é a única fonte de verdade (sem localStorage para clientId/aba)
//   R-ARCH-6: key={clientId} no Route garante remontagem ao trocar de cliente
//   R-PICKER-4: useListClients() REMOVIDO deste componente

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetClient, useListProtocols, useListPayments,
  getGetClientQueryKey, getListPaymentsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { COLLAB_EVENT } from "@/lib/collab-auth";
import { UserRound } from "lucide-react";
import { useScreenTheme } from "@/components/theme/useScreenTheme";

import CockpitHeader from "./CockpitHeader";
import CockpitTabs, { type AbaId } from "./CockpitTabs";
import CockpitViews, { type ModoCockpit } from "./CockpitViews";
import AcompanhamentoDiarioPanel from "./panels/AcompanhamentoDiarioPanel";
import { useProtocoloNavigationGuard } from "./useProtocoloNavigationGuard";
import "./cockpit-identidade.css";

const API = import.meta.env.VITE_API_URL || "/api";
let proximaInstancia = 0;

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
  const { theme, toggle: toggleTheme } = useScreenTheme("light", "paxter.cockpit.theme");
  const queryClient = useQueryClient();
  const mutationsInFlight = useIsMutating();
  const [novoProtocoloAberto, setNovoProtocoloAberto] = useState(false);
  const [protocoloEmAndamento, setProtocoloEmAndamento] = useState(false);
  const [modo, setModo] = useState<ModoCockpit>("abas");
  const [abaVisivel, setAbaVisivel] = useState<AbaId>(initialAba);
  const [focoSolicitado, setFocoSolicitado] = useState<{ id: AbaId; sequencia: number } | null>(null);
  const [versaoSessao, setVersaoSessao] = useState(0);
  const [instancia] = useState(() => ++proximaInstancia);
  const escopoSessao = `${instancia}-${versaoSessao}`;
  const escopoAtual = useRef(escopoSessao);
  escopoAtual.current = escopoSessao;
  const escopoProtocolo = useRef<string | null>(null);
  const protocoloOcupado = useRef(false);
  const limparConsultasDepois = useRef(false);

  // Nunca reaproveitar os dados consultados por outro acesso profissional.
  // Se houver criação de protocolo em trânsito, mantê-la oculta até concluir.
  useEffect(() => {
    const mudouAcesso = () => {
      if (protocoloOcupado.current) limparConsultasDepois.current = true;
      else queryClient.removeQueries();
      setVersaoSessao((anterior) => anterior + 1);
    };
    const mudouStorage = (evento: StorageEvent) => {
      if (!evento.key || evento.key === "padcom_collab_token" || evento.key === "padcom_collab_prof") mudouAcesso();
    };
    window.addEventListener(COLLAB_EVENT, mudouAcesso);
    window.addEventListener("storage", mudouStorage);
    return () => {
      window.removeEventListener(COLLAB_EVENT, mudouAcesso);
      window.removeEventListener("storage", mudouStorage);
    };
  }, [queryClient]);

  const atualizarProtocoloEmAndamento = useCallback((ocupado: boolean) => {
    if (ocupado && !protocoloOcupado.current) escopoProtocolo.current = escopoAtual.current;
    protocoloOcupado.current = ocupado;
    if (!ocupado) {
      if (escopoProtocolo.current && escopoProtocolo.current !== escopoAtual.current) {
        setNovoProtocoloAberto(false);
      }
      escopoProtocolo.current = null;
      if (limparConsultasDepois.current) {
        limparConsultasDepois.current = false;
        queryClient.removeQueries();
      }
    }
    setProtocoloEmAndamento(ocupado);
  }, [queryClient]);
  const avisoOperacaoPendente = useCallback(() => {
    toast({ title: "Aguarde a conclusão do protocolo antes de sair desta tela." });
  }, [toast]);
  useProtocoloNavigationGuard(protocoloEmAndamento, avisoOperacaoPendente);

  // ── Estado local: somente o que não está na URL ──────────────────────────
  // clientId e aba vêm como props (derivadas da URL pelo Route no App.tsx).
  const clientId = initialClientId;
  const aba: AbaId = ABAS_VALIDAS.includes(initialAba) ? initialAba : "prescricao";

  // ── Dados ─────────────────────────────────────────────────────────────────
  const clientQueryKey = ["cockpit-cliente", escopoSessao, clientId ?? 0];
  const { data: client, isLoading: clientLoading, isError: clientError, error: clientQueryError, refetch: retryClient } = useGetClient(clientId ?? 0, {
    query: { enabled: !!clientId, queryKey: clientQueryKey, retry: false, gcTime: 0 },
  });
  const aguardandoSessaoAnterior = protocoloEmAndamento && escopoProtocolo.current !== escopoSessao;
  const clientReady = !!clientId && !clientError && client?.id === clientId && !aguardandoSessaoAnterior;
  const clientConfirmado = useRef<{ client: NonNullable<typeof client>; escopo: string } | null>(null);
  if (clientReady && client) clientConfirmado.current = { client, escopo: escopoSessao };
  const statusErro = clientQueryError && typeof clientQueryError === "object" && "status" in clientQueryError
    ? clientQueryError.status : undefined;
  const acessoNegado = statusErro === 401 || statusErro === 403 || statusErro === 404;
  useEffect(() => {
    if (acessoNegado && !protocoloEmAndamento) {
      clientConfirmado.current = null;
      setNovoProtocoloAberto(false);
    }
  }, [acessoNegado, protocoloEmAndamento]);
  const mesmoClienteConfirmado = clientConfirmado.current?.client.id === clientId;
  const manterConteudo = mesmoClienteConfirmado &&
    (clientConfirmado.current?.escopo === escopoSessao || protocoloEmAndamento) &&
    (!acessoNegado || protocoloEmAndamento);
  const clientParaConteudo = clientReady ? client : manterConteudo ? clientConfirmado.current?.client : undefined;
  const escopoDoConteudo = aguardandoSessaoAnterior
    ? clientConfirmado.current?.escopo ?? escopoSessao
    : escopoSessao;

  // Contagens para badges nas abas
  const { data: protocols } = useListProtocols(
    { clientId: clientId ?? 0 },
    { query: { enabled: clientReady, queryKey: ["protocols", clientId] } },
  );
  const { data: payments } = useListPayments(
    { clientId: clientId ?? 0 },
    { query: { enabled: clientReady, queryKey: getListPaymentsQueryKey({ clientId: clientId ?? 0 }) } },
  );

  const protocolCount = useMemo(() => protocols?.length ?? 0, [protocols]);
  const paymentCount  = useMemo(
    () => (payments ?? []).filter(p => p.status === "pending" || p.status === "overdue").length,
    [payments],
  );

  // ── Navegação (SPA — zero window.location) ────────────────────────────────
  function onSelectClient(id: number | null) {
    if (id === clientId) return;
    if (protocoloEmAndamento) {
      toast({ title: "Aguarde a conclusão do protocolo antes de trocar de cliente." });
      return;
    }
    if (mutationsInFlight > 0) {
      toast({ title: "Aguarde a conclusão da operação antes de trocar de cliente." });
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
    if (modo === "abas" && novoProtocoloAberto && novaAba !== "protocolos") {
      if (!window.confirm("Ao trocar de aba, o preenchimento do protocolo será perdido. Continuar?")) return;
      setNovoProtocoloAberto(false);
    }
    setAbaVisivel(novaAba);
    if (modo !== "abas") {
      setFocoSolicitado((anterior) => ({ id: novaAba, sequencia: (anterior?.sequencia ?? 0) + 1 }));
    }
    navigate(`/cockpit/${clientId}/${novaAba}`, { replace: true } as any);
  }

  function abrirNovoProtocolo() {
    if (!clientReady || !clientId) return;
    setNovoProtocoloAberto(true);
    setAbaVisivel("protocolos");
    if (modo !== "abas") {
      setFocoSolicitado((anterior) => ({ id: "protocolos", sequencia: (anterior?.sequencia ?? 0) + 1 }));
    }
    if (aba !== "protocolos") navigate(`/cockpit/${clientId}/protocolos`);
  }

  function mudarModo(proximo: ModoCockpit) {
    if (proximo === "abas" && novoProtocoloAberto && aba !== "protocolos" && clientId) {
      setAbaVisivel("protocolos");
      navigate(`/cockpit/${clientId}/protocolos`, { replace: true } as any);
    } else if (proximo === "abas") {
      setAbaVisivel(aba);
    }
    setModo(proximo);
  }

  function podeSairParaEdicao() {
    if (protocoloEmAndamento || mutationsInFlight > 0) {
      toast({ title: "Aguarde a conclusão da operação antes de sair." });
      return false;
    }
    return !novoProtocoloAberto || window.confirm("Ao sair, o preenchimento do protocolo será perdido. Continuar?");
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
      queryClient.invalidateQueries({ queryKey: clientQueryKey });
      queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId ?? 0) });
    },
    onError: (err: Error) =>
      toast({ title: "Erro ao configurar Drive", description: err.message, variant: "destructive" }),
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`cc-shell min-h-screen w-full font-sans ${theme === "dark" ? "dark" : ""}`}>
      <CockpitHeader
        theme={theme}
        onToggleTheme={toggleTheme}
        client={clientReady ? client : null}
        clientId={clientId}
        sessionScope={escopoSessao}
        onSelectClient={onSelectClient}
        driveSetupPending={driveSetup.isPending}
        onDriveSetup={() => driveSetup.mutate()}
        onEvolucao={() => onAba("evolucao")}
        onMensagens={() => onAba("telegram")}
        onBeforeEdit={podeSairParaEdicao}
      />
      {clientReady && (
        <div className="cc-rail-wrap">
          <CockpitTabs
            aba={modo === "abas" ? aba : abaVisivel}
            onAba={onAba}
            protocolCount={protocolCount}
            paymentCount={paymentCount}
            modo={modo}
          />
        </div>
      )}

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <div className="cc-workspace-background">
      <main className="cc-main">
        {!clientId ? (
          // Estado vazio — guia o usuário
          <div className="panel-3d mx-auto mt-10 max-w-xl p-8 text-center">
            <UserRound
              className="mx-auto mb-3 h-8 w-8"
              style={{ color: "#9a7b32" }}
            />
            <div className="text-[15px] font-bold uppercase tracking-[0.12em] text-foreground">
              Busque o Cliente
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Use o campo de busca acima para encontrar o cliente pelo nome ou CPF.
              Todas as ferramentas da consulta — prescrição, injetáveis, implantes,
              exames, evolução, anamnese, protocolos, financeiro e cadastro — ficam
              nesta tela sem trocar de página.
            </p>
          </div>
        ) : (
          <>
          {!clientReady && <div className="panel-3d mx-auto mt-10 max-w-xl p-8 text-center" role="status">
            {aguardandoSessaoAnterior ? (
              <p>Aguardando a conclusão da operação iniciada no acesso anterior. As ferramentas permanecem ocultas.</p>
            ) : clientLoading && !clientError ? (
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
          {clientParaConteudo && <div key={escopoDoConteudo} className="space-y-4" hidden={!clientReady}>
            {/* Acompanhamento diário sempre visível acima do conteúdo da aba */}
            <AcompanhamentoDiarioPanel clientId={clientId} />
            {/* Conteúdo da aba ativa — lazy loaded */}
            <CockpitViews
              clientId={clientId}
              client={clientParaConteudo}
              aba={aba}
              modo={modo}
              onModo={mudarModo}
              onFerramentaVisivel={setAbaVisivel}
              focoSolicitado={focoSolicitado}
              clienteVisivel={clientReady}
              novoProtocoloAberto={novoProtocoloAberto}
              protocoloEmAndamento={protocoloEmAndamento}
              onProtocoloEmAndamento={atualizarProtocoloEmAndamento}
              onNovoProtocolo={abrirNovoProtocolo}
              onFecharProtocolo={fecharNovoProtocolo}
              onProtocoloCriado={() => setNovoProtocoloAberto(false)}
            />
          </div>}
          </>
        )}
      </main>
      </div>
    </div>
  );
}
