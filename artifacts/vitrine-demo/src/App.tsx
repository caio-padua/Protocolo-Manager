import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useState } from "react";
import { VitrineDemo } from "@/pages/VitrineDemo";
import { VitrineClinica } from "@/pages/VitrineClinica";
import { AcessoGate, acessoLiberado } from "@/components/AcessoGate";

const queryClient = new QueryClient();

function VitrinePacienteGated() {
  const [liberado, setLiberado] = useState(() => acessoLiberado("paciente"));
  if (!liberado) return <AcessoGate tipo="paciente" onLiberar={() => setLiberado(true)} />;
  return <VitrineDemo />;
}

function VitrineClinicaGated() {
  const [liberado, setLiberado] = useState(() => acessoLiberado("clinica"));
  if (!liberado) return <AcessoGate tipo="clinica" onLiberar={() => setLiberado(true)} />;
  return <VitrineClinica />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={VitrinePacienteGated} />
      <Route path="/clinica" component={VitrineClinicaGated} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
