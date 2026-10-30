// Test-only entry point: unlike the cockpit's keyed panel, this keeps the
// component mounted so delayed send responses must pass its contextRef guards.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ExamRequestHistoryPanel from "../src/pages/cockpit/panels/ExamRequestHistoryPanel";

const queryClient = new QueryClient();

function Harness() {
  const [clientId, setClientId] = useState(42);
  const [professionalId, setProfessionalId] = useState(202);
  return (
    <QueryClientProvider client={queryClient}>
      <p>Paciente {clientId} · Médico {professionalId}</p>
      <button onClick={() => setClientId(43)}>Trocar paciente sintético</button>
      <button onClick={() => setClientId(42)}>Voltar ao paciente sintético</button>
      <button onClick={() => {
        localStorage.setItem("padcom_collab_token", "synthetic-next-token");
        setProfessionalId(203);
      }}>Trocar médico sintético</button>
      <ExamRequestHistoryPanel
        clientId={clientId} professionalId={professionalId} enabled
        email="synthetic@example.invalid" phone="00000000000"
      />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
