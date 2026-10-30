// CockpitContent — switch de abas com React.lazy + Suspense.
// Cada aba carrega seu código JS SOMENTE quando o usuário clica nela.
// Fallback: Skeleton panel-3d-sub para manter o relevo 3D enquanto carrega.

import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AbaId } from "./CockpitTabs";

// ── Importações lazy por aba ─────────────────────────────────────────────────
const PrescricaoPanel    = lazy(() => import("./panels/PrescricaoPanel"));
const InjetaveisPanel    = lazy(() => import("./panels/InjetaveisPanel"));
const ImplantesPanel     = lazy(() => import("./panels/ImplantesPanel"));
const ExamesPanel        = lazy(() => import("./panels/ExamesPanel"));
const EvolucaoPanel      = lazy(() => import("./panels/EvolucaoPanel"));
const AnamnesePanel      = lazy(() => import("./panels/AnamnesePanel"));
const DocumentosPanel    = lazy(() => import("./panels/DocumentosCockpitPanel"));
const ProtocolosPanel    = lazy(() => import("./panels/ProtocolosPanel"));
const DietaTreinoPanel   = lazy(() => import("./panels/DietaTreinoPanel"));
const FinanceiroPanel    = lazy(() => import("./panels/FinanceiroPanel"));
const CadastroPanel      = lazy(() => import("./panels/CadastroPanel"));
const TelegramPanel      = lazy(() => import("./panels/TelegramPanel"));

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 rounded-lg panel-3d-sub" />
      <Skeleton className="h-24 rounded-lg panel-3d-sub" />
      <Skeleton className="h-64 rounded-lg panel-3d-sub" />
    </div>
  );
}

interface CockpitContentProps {
  clientId: number;
  aba: AbaId;
}

export default function CockpitContent({ clientId, aba }: CockpitContentProps) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      {aba === "prescricao"  && <PrescricaoPanel  clientId={clientId} />}
      {aba === "injetaveis"  && <InjetaveisPanel  clientId={clientId} />}
      {aba === "implantes"   && <ImplantesPanel   clientId={clientId} />}
      {aba === "exames"      && <ExamesPanel      clientId={clientId} />}
      {aba === "evolucao"    && <EvolucaoPanel    clientId={clientId} />}
      {aba === "anamnese"    && <AnamnesePanel    clientId={clientId} />}
      {aba === "documentos"  && <DocumentosPanel  clientId={clientId} />}
      {aba === "protocolos"  && <ProtocolosPanel  clientId={clientId} />}
      {aba === "dieta-treino" && <DietaTreinoPanel clientId={clientId} />}
      {aba === "financeiro"  && <FinanceiroPanel  clientId={clientId} />}
      {aba === "cadastro"    && <CadastroPanel    clientId={clientId} />}
      {aba === "telegram"    && <TelegramPanel key={clientId} clientId={clientId} />}
    </Suspense>
  );
}
