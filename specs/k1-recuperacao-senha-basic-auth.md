# K1 — Acesso às rotas de recuperação de senha

## Estado

BLOQUEADO — revisão independente pendente

## Base comparada

- Versão indicada na contraprova: `aa66cb4b305f2b564f4fc73ea4d4bba0ffd1c4d6`.
- Base atual da branch principal e de `origin/main`: `dc67a2d1ae5f64a3e7e8b19c31ce112ccb57663d`.
- A evolução posterior à versão auditada altera somente a ordem de um componente gerado de prévia; os arquivos de K1 permanecem idênticos.
- Trabalho isolado na branch `fix/k1-password-recovery-basicauth`.

## Objetivo

Permitir que uma pessoa sem autenticação básica solicite e conclua a recuperação de senha, sem abrir outros caminhos da área de colaboradores.

## Requisitos exatos

1. A solicitação pública de recuperação deve chegar à rota de recuperação e manter sua resposta genérica atual.
2. A conclusão pública deve chegar à rota de recuperação e manter a validação atual de token, prazo, senha e uso único.
3. Somente os caminhos exatos abaixo ficam dispensados da autenticação básica:
   - `/api/collaborator/password-recovery/request`
   - `/api/collaborator/password-recovery/complete`
4. A exceção não pode liberar caminhos vizinhos, subcaminhos nem outras rotas de colaboradores.
5. O teste deve montar o middleware real antes do roteador real de colaboradores, na mesma ordem de segurança usada pelo servidor, com banco e mensageria simulados.
6. Não enviar e-mails reais, não usar banco ou contas de produção, não fazer merge, publicação ou deploy.
7. Entregar o diff e os resultados para revisão independente; parar após K1.

## Impacto e dependências

- Produtor do bloqueio: lista de caminhos públicos do middleware de autenticação básica.
- Consumidores: aplicação Express, roteador de colaboradores e tela de recuperação.
- Persistência e efeitos externos: não devem ser acionados pelos casos de teste; solicitações sintéticas sem identificador e conclusões com token inválido terminam antes de acessar o banco ou o serviço de e-mail.
- Contrato preservado: código HTTP, mensagem genérica e validações internas das rotas não devem ser alterados.

## Falhas previstas e barreiras

| Falha | Barreira | Prova |
|---|---|---|
| Recuperação continua recebendo `401` da autenticação básica | Teste integrado com o middleware real e as rotas reais | Solicitação chega à resposta genérica da rota; conclusão chega à validação de token |
| Exceção abre todas as rotas de colaboradores | Exceções por caminho exato, sem prefixo amplo | Rota de troca de senha sem autenticação continua recebendo `401` |
| Exceção abre subcaminho futuro inadvertidamente | Comparação exata para as duas exceções | Rota sentinela abaixo de um caminho de recuperação continua recebendo `401` |
| Teste aciona e-mail ou banco real | Usar rotas sintéticas que encerram antes dessas dependências e simulações existentes | Confirmar chamadas externas zeradas e banco não consultado |
| Alteração lateral ou perda de trabalho preexistente | Trabalhar em branch separada e alterar somente os arquivos autorizados e esta especificação | Revisar nomes e conteúdo do diff antes de encerrar |

## Definição de pronto

1. A solicitação sem autenticação básica recebe a resposta genérica da rota, sem informar se a conta existe.
2. A conclusão com token inválido alcança a validação da rota e recebe a recusa específica de link inválido ou expirado.
3. Uma rota de colaborador fora do escopo continua recebendo `401` da autenticação básica.
4. Um subcaminho sob os caminhos liberados continua recebendo `401`.
5. A suíte direcionada passa com mensageria e banco simulados.
6. O diff contém somente a especificação, o middleware de autenticação básica e os testes integrados K1.
7. Nenhum commit, merge, envio real, publicação ou deploy é realizado.

## Evidências coletadas nesta execução

- Suíte: `pnpm --filter @workspace/api-server exec vitest run src/tests/collaborator-google-auth.test.ts` — 59 testes aprovados.
- Compilação: `pnpm --filter @workspace/api-server run build` — concluída sem erro.
- Aplicação de desenvolvimento após reinício: `GET /api/health` — HTTP 200; `POST /api/collaborator/password-recovery/request` com corpo vazio — HTTP 202 e resposta genérica; `POST /api/collaborator/password-recovery/complete` com token sintético inválido e senha sintética válida — HTTP 401 com recusa de link inválido.
- Integração do middleware real e do roteador real: rotas de recuperação alcançam seus controladores; rota não relacionada e subcaminho sentinela recebem HTTP 401 com credenciais de perímetro sintéticas.
- O teste de integração confirma que o motor de mensagens não foi chamado.
- Revisão independente: não executada nesta sessão; a tentativa de acionar o revisor arquitetural foi recusada pelo ambiente. A homologação permanece bloqueada até revisão independente.
- Nenhuma operação foi feita contra conta ou banco de produção; nenhum e-mail real foi enviado.

## Linhas vermelhas

- Não modificar K2 nem qualquer outra etapa Kaizen.
- Não alterar os fluxos alternativos de recuperação de desenvolvimento.
- Não alterar comportamento, conteúdo ou política interna das rotas de recuperação.
- Não abrir `/api/collaborator` nem um prefixo amplo como exceção.
- Não sobrescrever alterações preexistentes.
- Não integrar a branch nem publicar o resultado antes da nova auditoria independente.
