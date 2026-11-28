// Código de vínculo do Telegram (senha de validação). Determinístico:
// 3 últimas letras do sobrenome + 4 últimos dígitos do CPF.
// Fonte única: usado pelo cadastro (clients.ts) e pela Área do Cliente (area-paciente.ts).
export function codigoTelegramSemantico(nome: string, cpf: string | null | undefined): string {
  const sobrenome = nome.trim().split(/\s+/).pop() ?? nome;
  const limpo = sobrenome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  const sufixoNome = limpo.slice(-3).padStart(3, "X");
  const digCpf = (cpf ?? "").replace(/\D/g, "");
  const sufixoCpf = digCpf.slice(-4).padStart(4, "0");
  return `${sufixoNome}${sufixoCpf}`;
}
