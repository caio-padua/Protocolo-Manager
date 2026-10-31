# Especificacao — Recuperacao de acesso do medico principal no desenvolvimento

Data: 31/10/2026
Estado: IMPLEMENTADA E TESTADA NO DESENVOLVIMENTO; senha real aguarda acao do CEO; homologacao independente pendente

## Objetivo

Permitir que o responsavel do projeto recupere o acesso ao cadastro ativo e unico do medico principal no ambiente privado de desenvolvimento, para testar o fluxo clinico sem criar outro profissional ou alterar producao.

## Requisitos

1. A recuperacao existe somente quando `NODE_ENV` e `development`; em producao, as rotas retornam indisponivel sem alterar dados.
2. O alvo e resolvido exclusivamente no servidor pelo cadastro marcado simultaneamente como medico principal, proprietario da plataforma e ativo.
3. Se nao houver exatamente um alvo elegivel, a operacao falha fechada; o navegador nao pode enviar identificador, nome, CPF, usuario ou clinica para escolher o cadastro.
4. O primeiro pedido cria um desafio aleatorio de uso unico, mantido somente em memoria, com validade maxima de 10 minutos.
5. O desafio nao aparece em URL, nao e escrito em log e nao e persistido. Reiniciar o servidor invalida desafios pendentes.
6. O formulario permite definir uma senha final de 12 a 128 caracteres, com confirmacao; a senha nunca e exibida novamente nem enviada a auditoria.
7. A conclusao atualiza somente a senha do cadastro-alvo, incrementa `credentialVersion` e invalida sessoes anteriores.
8. A auditoria registra o evento de recuperacao sem senha, desafio, hash, CPF, e-mail ou usuario.
9. Depois da recuperacao, emitir uma sessao normal do colaborador para o medico principal e abrir o destino solicitado pelo usuario.
10. A tela de recuperacao aparece apenas na compilacao de desenvolvimento e reutiliza o tema escuro, os campos de senha com controle de mostrar/ocultar e os componentes Paxter existentes.
11. O fluxo nao cria profissionais, nao altera identificadores, vinculos de clinica, Google, permissoes, prescricoes, exames, cobrancas ou licenciamento.
12. Testes usam dados sinteticos e cobrem sucesso, producao, alvo ausente/duplicado/inativo, desafio expirado/reutilizado, senha fora do limite, concorrencia, auditoria e invalidacao de sessao.

## Impacto e dependencias

- Servidor: novas rotas de inicio e conclusao, restritas a desenvolvimento.
- Interface: acao de recuperacao condicional ao modo de desenvolvimento na pagina de acesso.
- Banco: sem novas tabelas ou migracoes; o desafio existe apenas em memoria e a credencial usa campos existentes.
- Sessao: a rotacao da versao de credencial encerra tokens antigos; a resposta cria um token novo para o mesmo profissional.
- Plataforma: o acesso depende do endereco privado de desenvolvimento da Replit, restrito ao proprietario e colaboradores autorizados do espaco.
- Producao: nenhuma alteracao, migracao, reset, publicacao ou sincronizacao com GitHub.

## Falhas previstas e barreiras

| Cenario | Barreira | Resultado esperado |
|---|---|---|
| Chamada em producao | Verificacao do ambiente no servidor | 404/410 generico; nenhuma alteracao |
| Nenhum medico principal elegivel | Busca server-side e falha fechada | 409 generico |
| Mais de um cadastro elegivel | Exigir exatamente um alvo | 409; nenhuma conta alterada |
| Alvo inativo ou sem papel de proprietario | Revalidar na conclusao | 403/409; nenhuma conta alterada |
| Desafio expirado ou inexistente | Prazo de 10 minutos | 401 generico |
| Desafio repetido ou concorrente | Marcacao atomica de uso antes da escrita | Uma tentativa vence; demais recusadas |
| Senha curta ou longa | Validacao no servidor | 400; hash e versao permanecem |
| Falha na escrita/auditoria | Operacao transacional; falha fechada | Nenhuma confirmacao falsa |
| Reinicio do servidor | Desafios nao persistidos | Desafio invalido; iniciar novamente |
| Tentativa de trocar outro cadastro | Nenhum alvo aceito do navegador | Nenhum outro profissional alterado |

## Definicao de pronto

1. A tela de desenvolvimento permite iniciar a recuperacao e definir a senha sem enviar credenciais pelo chat.
2. A conta existente do medico principal e a unica identidade alterada.
3. A resposta autentica a mesma identidade e permite abrir o Cockpit sem nova entrada.
4. Tokens anteriores sao rejeitados e a nova sessao e aceita.
5. A senha e o desafio nao aparecem em logs, resposta de auditoria, URL nem armazenamento persistente.
6. Todos os caminhos proibidos falham sem alterar senha, versao, cadastro ou vinculos.
7. Testes automatizados, compilacao, verificacao visual da tela em celular e computador e logs do servidor foram conferidos.
8. Revisao independente sequencial concluida; sem essa revisao, a entrega permanece bloqueada para homologacao.
9. A conta real so e modificada quando o CEO concluir o formulario dentro do ambiente de desenvolvimento; testes automatizados nunca alteram a conta real.

## Evidencias desta implementacao

- A suite focada de colaborador passou com 45 testes; os casos de recuperacao cobrem identidade fixa, bloqueio em producao, alvo ausente/duplicado/inativo, senha curta, expiracao, uso unico concorrente, auditoria e invalidação de sessao.
- O servidor da interface de desenvolvimento compilou e iniciou; a rota de inicio respondeu HTTP 200 sem alterar cadastro ou senha.
- A compilacao de producao da interface terminou e o texto do botao de recuperacao nao aparece no pacote final.
- As telas de entrada foram conferidas em 402 × 874 e 1.280 × 800 pixels; os avisos de console observados sao de infraestrutura existente, nao da nova tela.
- A compilacao de producao mostrou avisos preexistentes em `preview-validacao.tsx` sobre chaves `width` e `height` repetidas; nao impediram o pacote de ser gerado e nao pertencem a esta mudanca.
- O `typecheck` global continua com erros em arquivos preexistentes fora da rota e da tela alteradas; por isso, nao foi tratado como verificacao aprovada.
- A revisao independente nao foi executada neste ambiente; houve revisao manual, mas o requisito 8 da definicao de pronto permanece pendente.
- Nenhuma senha foi redefinida no banco real. O CEO ainda precisa definir sua nova senha pelo formulario privado.

## Linhas vermelhas

- Nao reabrir o cadastro publico de primeiro acesso.
- Nao usar cadastro, nome, CPF ou identificador enviados pelo navegador para escolher o alvo.
- Nao alterar senha, banco, cadastro ou sessao de producao.
- Nao colocar senha, desafio ou token em URL, log, arquivo ou mensagem de chat.
- Nao enviar mensagens reais nem criar prescricoes ou exames de clientes reais durante os testes automatizados.
- Nao sincronizar com GitHub sem autorizacao expressa separada.
