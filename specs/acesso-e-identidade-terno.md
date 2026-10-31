# Especificacao — Acesso e identidade com layout Terno Paxter

Data: 30/10/2026
Estado: IMPLEMENTADO; HOMOLOGACAO PENDENTE DE REVISAO INDEPENDENTE

## Objetivo

Manter as telas de acesso coerentes com a Área do Cliente e oferecer no menu interno uma consulta segura da identidade e do usuário do profissional autenticado, sem revelar senha.

## Requisitos

1. Preservar o login atual por usuário e senha, o login Google adicional, os retornos Google e os destinos de redirecionamento existentes.
2. Aplicar às telas `/login`, `/sign-in` e `/sign-up` o fundo creme com tecido `leva-fabric`, painéis e controles 3D existentes, mantendo conteúdo em português, contraste, acessibilidade e largura adaptável.
3. Não introduzir um novo padrão visual: reutilizar o símbolo, as cores, os painéis 3D e o tecido já usados pela Área do Cliente.
4. Criar a rota interna `/configuracoes/meu-acesso` e o item “Meu Acesso” no grupo “Configurações & Administração” do menu esquerdo.
5. A página deve consultar somente o profissional da sessão autenticada; não aceitar identificador de profissional vindo da tela para escolher a conta consultada.
6. Mostrar nome, cargo, CRM/registro quando cadastrado, usuário de acesso, estado ativo e se há senha configurada, preservando slots fixos e mostrando “—” quando um dado não existir.
7. Nunca devolver, renderizar, registrar ou permitir copiar a senha ou o hash; exibir claramente “A senha não pode ser consultada”.
8. Não incluir neste escopo alteração, redefinição ou emissão de senha, pois a jornada segura de recuperação não está definida.
9. Exigir sessão de colaborador válida para abrir a rota e consultar o perfil; em sessão ausente ou expirada, encaminhar ao login sem expor informação.
10. Não alterar os dados de profissionais, o login existente, as cobranças, o licenciamento ou o fluxo Google.

## Impacto e dependências

- A tela `/login` e as páginas Clerk `/sign-in` e `/sign-up` compartilham o contexto visual, mas mantêm seus motores e rotas atuais.
- A página “Meu Acesso” consome a rota autenticada `/api/collaborator/me`.
- A resposta dessa rota pode acrescentar apenas campos do próprio profissional (`loginUsername`, `crm` e `hasPassword`); nunca pode incluir `passwordHash`.
- O item novo é universal no grupo de configurações e continua obedecendo ao gate geral de colaborador já existente.
- Nenhuma migração de banco é necessária.

## Falhas previstas e barreiras

| Cenário | Barreira | Resultado esperado |
|---|---|---|
| Usuário sem sessão | Gate existente e rota autenticada | Redirecionar ao login; não carregar perfil |
| Sessão expirada durante a consulta | Tratar 401 sem fallback com dados anteriores | Mensagem clara e estado sem identidade |
| Profissional não encontrado/inativo | Validar no servidor | Recusar; não mostrar dados de outro cadastro |
| Usuário de acesso ausente | Slot fixo com “—” | Não inventar identificador |
| CRM/registro ausente | Slot fixo com “—” | Não inferir nem inventar registro |
| Tentativa de ler senha pelo navegador | O servidor devolve apenas `hasPassword` | Nenhum valor nem hash exposto |
| Erro de consulta | Estado de erro explícito e opção de tentar novamente | Não mostrar informação antiga como atual |
| Tela estreita | Layout empilhado, alvos de toque adequados e texto sem corte | Uso completo em celular |

## Definição de pronto

1. Login por usuário e senha e login Google continuam funcionando sem alteração de contrato.
2. As três telas de acesso mostram o tecido de risca de giz e a linguagem visual 3D em celular e desktop.
3. “Meu Acesso” aparece e abre pelo menu esquerdo.
4. A página mostra apenas dados do profissional ligado ao token atual.
5. A resposta do servidor não contém a senha nem seu hash.
6. Sessão ausente, expirada, profissional ausente, dado vazio e erro de servidor têm resultados explícitos.
7. Testes automatizados cobrem acesso autorizado, recusa sem token, formato limitado da resposta e ausência de dados de outros profissionais.
8. Revisão independente, testes, captura visual nas duas larguras e logs sem erro inesperado.

## Linhas vermelhas

- Não mostrar, registrar ou transportar senha ou hash.
- Não usar `/api/collaborator/credentials` para construir uma tela de autosserviço: a rota existente recebe o identificador do alvo no corpo e não faz parte deste fluxo.
- Não alterar senha, usuário, perfil, banco ou vínculo Google como efeito colateral desta consulta.
- Não introduzir novo estilo nem remover o relevo 3D Paxter.
- Não publicar nem sincronizar com GitHub sem autorização expressa.

## Evidências e pendências de homologação

- Testes da autenticação do colaborador: 17 aprovados, incluindo consulta da própria sessão, recusa sem sessão, perfil ausente e ausência de senha/hash na resposta.
- Compilação de produção da interface: concluída; avisos de propriedades duplicadas pertencem a `preview-validacao.tsx`, fora deste escopo.
- Inicialização do servidor de dados e da interface: concluída sem erro de inicialização.
- Capturas visuais: `/login` em celular e desktop; `/sign-in` em celular. A página autenticada não foi fotografada porque a ferramenta de captura não autentica; não foi criado bypass.
- A verificação completa de tipos continua bloqueada por erros anteriores em arquivos não alterados; nenhum erro reportado nos arquivos desta implementação.
- Revisão independente solicitada pelo ciclo Paxter não foi possível porque o recurso de revisor estava indisponível neste ambiente. Portanto, a implementação não deve ser marcada como homologada até revisão independente.
