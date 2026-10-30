// CockpitShell — componente raiz do Cockpit da Consulta v2.
// Lê initialClientId + initialAba via props (passadas pelo Route em App.tsx).
// Navega por useLocation do wouter — zero window.location, zero full reload.
// Regras de arquitetura (specs/cockpit-v2.md):
//   R-ARCH-7: URL é a única fonte de verdade (sem localStorage para clientId/aba)
//   R-ARCH-6: key={clientId} no Route garante remontagem ao trocar de cliente
//   R-PICKER-4: useListClients() REMOVIDO deste componente

import { useState, useMemo } from "react";
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

  // ── Estado local: somente o que não está na URL ──────────────────────────
  // clientId e aba vêm como props (derivadas da URL pelo Route no App.tsx).
  const clientId = initialClientId;
  const aba: AbaId = ABAS_VALIDAS.includes(initialAba) ? initialAba : "prescricao";

  // ── Dados ─────────────────────────────────────────────────────────────────
  const { data: client } = useGetClient(clientId ?? 0, {
    query: { enabled: !!clientId, queryKey: getGetClientQueryKey(clientId ?? 0) },
  });

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
    if (id == null) navigate("/cockpit");
    else navigate(`/cockpit/${id}/prescricao`);
  }

  function onAba(novaAba: AbaId) {
    if (!clientId) return;
    navigate(`/cockpit/${clientId}/${novaAba}`, { replace: true } as any);
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
          client={client ?? null}
          clientId={clientId}
          onSelectClient={onSelectClient}
          driveSetupPending={driveSetup.isPending}
          onDriveSetup={() => driveSetup.mutate()}
        />
        {clientId && (
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
          <div className="space-y-4">
            {/* Acompanhamento diário sempre visível acima do conteúdo da aba */}
            <AcompanhamentoDiarioPanel clientId={clientId} />
            {/* Conteúdo da aba ativa — lazy loaded */}
            <CockpitContent clientId={clientId} aba={aba} />
          </div>
        )}
      </main>
    </div>
  );
}
