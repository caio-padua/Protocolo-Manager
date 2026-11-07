// Le o endereco que o Google guarda na DESCRICAO da agenda, ex.:
//   "R. Vilela, 652 - Sl 706 - Tatuapé, São Paulo - SP, 03314-000"
// Devolve null quando o texto nao tem a forma esperada: nunca chuta campo.
export interface EnderecoLido {
  cep: string; logradouro: string; numero: string; complemento: string;
  bairro: string; cidade: string; estado: string;
}

export function lerEnderecoGoogle(descricao: string | null | undefined): EnderecoLido | null {
  if (!descricao) return null;
  const texto = descricao.replace(/\s+/g, " ").trim();
  const cepM = texto.match(/(\d{5})-?(\d{3})/);
  if (!cepM) return null;
  const semCep = texto.replace(cepM[0], "").replace(/[,\s-]+$/, "");
  const partes = semCep.split(",").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 3) return null;
  const logradouro = partes[0];
  const meio = partes[1].split(" - ").map((p) => p.trim());
  const numero = meio[0];
  if (!/^\d+[A-Za-z]?$|^s\/?n$/i.test(numero)) return null;
  let complemento = "";
  let bairro = "";
  if (meio.length >= 3) { complemento = meio[1]; bairro = meio.slice(2).join(" - "); }
  else if (meio.length === 2) { bairro = meio[1]; }
  const cidadeUf = partes[2].split(" - ").map((p) => p.trim());
  const cidade = cidadeUf[0];
  const estado = (cidadeUf[1] ?? "").toUpperCase();
  if (!bairro || !cidade || !/^[A-Z]{2}$/.test(estado)) return null;
  return { cep: `${cepM[1]}-${cepM[2]}`, logradouro, numero, complemento, bairro, cidade, estado };
}
