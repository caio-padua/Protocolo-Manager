// Nomes de profissão exibidos sem alterar as identificações históricas no catálogo.
export function nomeDaProfissao(name: string): string {
  const key = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const nomes: Record<string, string> = {
    medicina: "Médico(a)",
    enfermagem: "Enfermeiro(a)",
    biomedicina: "Biomédico(a)",
    farmacia: "Farmacêutico(a)",
    farmaceutico: "Farmacêutico(a)",
  };
  return nomes[key] ?? name;
}
