import { createRoot } from "react-dom/client";
import { useState } from "react";
import "./index.css";
import { ListaAgendas } from "./pages/agenda/ListaAgendas";
import { ComRegistro, LegendaRegistros } from "./components/MarcadorVinculo";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
function App() {
  const [ids, setIds] = useState([23, 19, 20, 21, 22]);
  const [sel, setSel] = useState(20);
  const nomes: Record<number, string> = { 23: "AGENDA ENFERMAGEM - LOCAL", 19: "AGENDA ENFERMAGEM - REMOTO", 20: "AGENDA MEDICO - ASSISTENTE 01 - LOCAL", 21: "AGENDA MEDICO - ASSISTENTE 01 - REMOTO", 22: "AGENDA MEDICO - CAIO PADUA - LOCAL" };
  const [ativa, setAtiva] = useState(true);
  return (
    <div className="p-6 grid gap-6 max-w-5xl mx-auto" style={{ gridTemplateColumns: "340px 1fr" }}>
      <div className="panel-3d p-4 space-y-4">
        <ListaAgendas selecionadaId={sel} onSelecionar={setSel}
          onMover={(id, i) => setIds((l) => { const n = l.filter((x) => x !== id); n.splice(i, 0, id); return n; })}
          itens={ids.map((id) => ({ id, name: nomes[id], color: id % 2 ? "#4a9a6a" : "#7a6ab0", categoryName: "Categoria pendente", modalityLabel: "Sede", sharing: "compartilhada", active: true }))} />
      </div>
      <div className="panel-3d p-4 space-y-4 self-start">
        <div className="flex items-center justify-between gap-3">
          <span className="bevel-3d px-3 py-1.5 text-sm font-semibold uppercase text-primary">Identidade da Agenda</span>
          <div className="flex items-center gap-2.5">
            <ComRegistro codigo="A1"><label className="concave-3d flex items-center gap-2.5 px-3 py-1.5"><Switch checked={ativa} onCheckedChange={setAtiva} /><span className="text-xs font-bold uppercase">{ativa ? "Agenda ativa" : "Agenda inativa"}</span></label></ComRegistro>
            <ComRegistro codigo="A1"><Button className="btn-3d"><Save className="mr-1 h-4 w-4" /> Salvar</Button></ComRegistro>
          </div>
        </div>
        <ComRegistro codigo="C1" pendente><Input className="field-engraved" placeholder="Categoria pendente" /></ComRegistro>
        <LegendaRegistros />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
