import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../artifacts/padcom/src/index.css";
import { ProtocolSubstancePicker } from "../../artifacts/padcom/src/components/ProtocolSubstancePicker";
import { resolveProtocolSubstanceDefaults } from "../../artifacts/padcom/src/lib/protocol-substance-selection";

const data = [
  { id: 1, name: "Coenzima Q10", defaultDose: "100 MG / 2 ML", presentationQuantity: 1, presentationUnit: "ampola", ampouleVolumeMl: 2 },
  { id: 2, name: "Coenzima Q10", defaultDose: "50 MG / 2 ML", presentationQuantity: 1, presentationUnit: "ampola", ampouleVolumeMl: 2 },
  { id: 3, name: "ADEK", defaultDose: "A 25.000 UI + D3 100.000 UI / 2 ML" },
  ...Array.from({ length: 214 }, (_, i) => ({ id: i + 4, name: `Substância ${i + 4}`, defaultDose: "10 mg" })),
];
const options = data.map(item => ({
  id: item.id, name: item.name, dose: resolveProtocolSubstanceDefaults(item).dose,
  via: "Intramuscular", color: "#347777",
}));
function App() {
  const [selected, setSelected] = useState<number | undefined>();
  const [dose, setDose] = useState("");
  const [filter, setFilter] = useState(false);
  return <main className="p-4"><button type="button" onClick={() => setFilter(!filter)}>Trocar filtro</button>
    <ProtocolSubstancePicker options={filter ? options.filter(item => item.id > 3) : options}
      selected={options.find(item => item.id === selected)}
      onSelect={id => { setSelected(id); setDose(options.find(item => item.id === id)?.dose ?? ""); }} />
    <label htmlFor="dose-teste">Dose por aplicação</label>
    <input id="dose-teste" value={dose} onChange={e => setDose(e.target.value)} />
    <output data-testid="identidade">{selected ?? "nenhuma"}</output>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
