# Segurança restrita ao envio do guia

## Objetivo
Autorizar o envio exclusivamente pelo vínculo atual do colaborador autenticado à clínica e pelo pertencimento do cliente.

## Requisitos
1. Validar a assinatura e a validade do token de colaborador antes de consultar cliente ou enviar.
2. Consultar no servidor a clínica do profissional ativo identificado pelo token, sem fallback para a clínica padrão, reutilizando `resolveOnboardingClinic`.
3. Não usar corpo, cabeçalho, parâmetros do navegador ou contexto legado fixo para conceder acesso.
4. Buscar o cliente pelo par identificador e clínica autenticada antes de cooldown, quota ou mensagens.
5. Negar colaborador ausente, inativo ou sem clínica e cliente de outra clínica, sem efeitos colaterais.
6. A tela deve enviar o token existente no pedido de envio.
7. Testar pedidos autorizados e proibidos pela rota real, com banco e provedores simulados, sem mensagens reais.
8. Preservar a comparação do `tenantSlug` e da clínica no link com a clínica autenticada.

## Limites
Sem mudanças no licenciamento, cobranças, autenticação global ou rotas alheias.
Não corrigir problemas preexistentes fora desse escopo.

## Pronto
Testes demonstram autenticação, isolamento entre clínicas e ausência de chamadas aos provedores em pedidos recusados.

## Verificação e limite de entrega
- A rota real foi exercitada por requisições HTTP em aplicação de teste com banco e provedores simulados.
- A existência de `professionals.empresa_id` e `professionals.active` foi confirmada por consulta somente de leitura aos metadados do banco de desenvolvimento.
- Na sincronização com o projeto principal, foram preservadas as versões corrigidas de cadastro, assinatura e reenvio desse projeto.
- O projeto principal já continha a resolução autenticada da clínica e a validação de clínica no link; essa implementação foi mantida, sem guard paralelo.
- Os setenta e um testes do guia passaram após a sincronização, incluindo os novos testes de autorização.
- O servidor completo iniciou após instalar, sem alterar o arquivo de versões travadas, as dependências já declaradas no projeto principal.
- Não foi realizado envio real nem validação de envio pela tela com sessão autenticada.
