---
name: Git — autenticação gerenciada e sincronização
description: Usar primeiro o transporte gerenciado do Replit e verificar leitura e escrita separadamente, sem manipular tokens.
---

Priorizar o transporte de Git já configurado pelo Replit, sem ler, imprimir ou injetar credenciais pessoais.

**Why:** Houve falhas históricas de autenticação pessoal, mas em 29/10/2026 o transporte gerenciado por `github.replit.internal` permitiu buscar e enviar alterações normalmente, sem acessar segredos.
A afirmação antiga de que só o painel visual permite envio deixou de corresponder ao ambiente observado.
Leitura de um repositório público, sozinha, nunca comprova autorização de escrita.

**How to apply:** Verificar árvore de trabalho e divergência antes de sincronizar.
Usar apenas envio normal autorizado, sem forçar ou reescrever o histórico.
Se a ferramenta pedir uma autorização adicional para modificar os metadados de Git, seguir a instrução explícita da ferramenta somente dentro do escopo autorizado pelo usuário.
Comparar o identificador local com o ramo remoto depois do envio.
Se houver falha de autenticação, consultar as instruções de integrações.
Não extrair valores do cofre para a conversa, arquivos ou configuração persistente.

## Permissão adicional para automações

Um envio contendo `.github/workflows/` pode ser recusado mesmo com leitura e
envios comuns funcionando. O aviso genérico do painel não comprova divergência
de histórico: conferir a recusa específica retornada pelo servidor.

**Why:** A conexão antiga de GitHub pode ter permissão de repositório sem a
permissão `workflow`, necessária para criar ou alterar verificações automáticas.

**How to apply:** Quando essa for a recusa, conferir se existe outra credencial
já autorizada no cofre, usando a skill de segredos para verificar somente existência.
Com autorização do proprietário, a ferramenta pode consumi-la no próprio processo,
sem revelar seu valor, persistir cabeçalhos ou alterar a configuração de Git.
Na ausência de alternativa autorizada, solicitar reautorização da integração,
incluindo `workflow`. Não forçar envio, remover a verificação ou reescrever commits
para contornar a falta de permissão.
Trocar Git pela interface de programação do mesmo acesso não acrescenta permissões.
Uma conexão anunciada como pronta também pode ter a credencial retida no contexto;
isso não significa que a conta esteja desconectada.
