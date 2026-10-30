const titlePrefixes = new Set(["dr", "dra", "doutor", "doutora"]);
const surnameParticles = new Set(["da", "das", "de", "do", "dos", "e"]);
const surnameSuffixes = new Set([
  "filho",
  "filha",
  "junior",
  "júnior",
  "neto",
  "neta",
  "sobrinho",
  "sobrinha",
]);

function wordsWithoutTitle(name: string | null | undefined): string[] {
  const words = (name ?? "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  while (words.length > 1 && titlePrefixes.has(words[0].replace(/\.$/, "").toLowerCase())) {
    words.shift();
  }
  return words;
}

export function formatProfessionalName(name: string | null | undefined): string {
  const words = wordsWithoutTitle(name);
  if (words.length === 0) return "Profissional";
  if (words.length <= 2) return words.join(" ");

  const lastWord = words.at(-1)?.toLocaleLowerCase("pt-BR") ?? "";
  let surnameStart = surnameSuffixes.has(lastWord) ? words.length - 2 : words.length - 1;
  while (
    surnameStart > 1 &&
    surnameParticles.has(words[surnameStart - 1].toLocaleLowerCase("pt-BR"))
  ) {
    surnameStart -= 1;
  }

  const middleInitials = words
    .slice(1, surnameStart)
    .map((word) => `${Array.from(word)[0]?.toLocaleUpperCase("pt-BR") ?? ""}.`)
    .filter((initial) => initial !== ".");
  return [words[0], ...middleInitials, words.slice(surnameStart).join(" ")].join(" ");
}

export function formatProfessionalInitials(name: string | null | undefined): string {
  const formatted = formatProfessionalName(name).split(" ").filter(Boolean);
  const first = formatted[0]?.[0] ?? "?";
  const last = formatted.at(-1)?.[0] ?? first;
  return `${first}${last}`.toLocaleUpperCase("pt-BR");
}

export function formatProfessionalRole(
  role: string | null | undefined,
  category: string | null | undefined,
): string {
  const normalizedRole = (role ?? "").trim();
  const normalized = normalizedRole.toLocaleLowerCase("pt-BR");
  if (normalized && normalized !== "executor" && normalized !== "admin" && normalized !== "administrator") {
    return normalizedRole;
  }
  if (normalized === "admin" || normalized === "administrator") return "Administrador";

  const categoryLabels: Record<string, string> = {
    medico: "Médico",
    enfermagem: "Enfermagem",
    recepcao: "Recepção",
    administrativo: "Administrativo",
    financeiro: "Financeiro",
    licenciado: "Licenciado",
  };
  return categoryLabels[(category ?? "").trim().toLocaleLowerCase("pt-BR")] ?? "Colaborador";
}

export function formatProfessionalCpf(
  cpf: string | null | undefined,
  reveal = false,
): string {
  const digits = (cpf ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length !== 11) return "CPF pendente";
  if (!reveal) return "•••.•••.•••-••";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
