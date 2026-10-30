---
name: Rascunho clínico e revalidação transitória
description: Preservação da única cópia em memória quando armazenamento local e revalidação de identidade falham.
---

Uma falha de transporte, servidor ou limite temporário na revalidação de identidade
não equivale à revogação de acesso. Preserve a edição em memória, mas esconda e
bloqueie o editor até confirmar novamente a autorização. Recusa explícita de
autorização ou contexto confirmado diferente deve remover ou trocar o editor.

**Why:** o armazenamento do navegador pode estar cheio ou bloqueado; desmontar o
editor por falha de rede apaga a única cópia da edição clínica. Preservar não pode
significar permitir continuar a operar com uma identidade não revalidada.

**How to apply:** mudanças em guardas de sessão e recuperação de rascunhos devem
testar falha de gravação local seguida de revalidação indisponível e recuperação,
além de verificar que recusa explícita continua impedindo acesso.

Remontar um editor por contexto não substitui o isolamento dos dados em cache.
Paciente, médico e sessão iguais podem continuar iguais enquanto clínica ou
empresa mudam; os dois identificadores devem ser tratados independentemente.

**Why:** a preservação temporária do editor e o cache compartilhado têm ciclos
de vida diferentes. A resposta anterior pode chegar depois da confirmação da
nova clínica, mesmo quando o editor anterior já foi removido.

**How to apply:** ao testar revalidação de clínica, reter a resposta antiga e
entregá-la depois da nova, sem depender apenas do cancelamento da requisição.
Observar também o primeiro render do novo contexto, não só o resultado final.
