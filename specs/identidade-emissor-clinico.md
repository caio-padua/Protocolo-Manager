# Identidade do emissor clinico - primeira entrega

Data: 29/10/2026.
Estado: EM IMPLEMENTACAO; nao e liberacao clinica.

## Objetivo

Derivar o medico de sessao autenticada e o cliente do Cockpit, usando a mesma
validacao de vinculo para prescricao e pedido de exames, sem nomes fixos.

## Requisitos

1. Exigir autenticacao nas duas rotas de emissao e no contexto de emissao.
2. Consultar profissional ativo e medico pelo identificador da sessao.
3. Exigir cliente cadastrado, ativo e com empresa e local explicitamente definidos.
4. Validar vinculo location_professionals com o local do cliente e empresa do local.
   Nao usar empresaId=5, isPlatformOwner ou querystring como autorizacao.
5. Obter nome e registro do cadastro. Dados profissionais enviados no corpo nao
   podem escolher o emissor. Rejeitar professionalId diferente do autenticado.
6. Expor contexto protegido sem CPF profissional, credenciais ou dados de certificado.
   UF do registro so pode vir de registro/conselho explicito (CRM/SP, CRM-SP etc.);
   nao inferir UF pela cidade da clinica. Ausencia bloqueia emissao de receita.
7. Cockpit usa esse contexto para cliente e medico; pedidos nao pedem selecionar medico.
   Interface mostra carregamento/erro e nao emite sem contexto validado.
8. Navegacao legada /prescricao?clientId=N encaminha ao Cockpit correspondente.
9. Testar rejeicoes sem efeitos: anonimo, medico inativo/nao medico, cliente ausente,
   clinica diferente, vinculo inexistente e tentativa de impersonacao.
10. Carta auditavel no GitHub separa implementado, testado e pendente; incluir
    comandos e resultados verificaveis. Publicar por push normal e conferir remoto.

## Limites desta entrega

Nao certificar assinatura digital nem liberar atendimento real.
Nao alterar motor de desmembramento, budgets/calculate, doses ou formulas.
Nao emitir documentos reais nem enviar mensagens para testar.
Nao migrar, apagar, reimportar ou corrigir cadastro automaticamente.
Nao implementar delegacao nesta entrega: somente medico autenticado emite.
Rascunhos persistentes, assinatura/certificado por medico e rotas legadas de
receituario ainda precisam de entregas seguintes; isso constara da carta.

## Verificacao

Testes isolados do resolvedor e das rotas, build dos artefatos, solicitacoes
anonimas ao servidor real e verificacao visual do estado bloqueado no Cockpit.
Teste de sucesso com banco simulado nao comprova receita real assinada.
Revisao separada antes de declarar esta entrega tecnica verificada.

## Reversao

Primeira entrega implementada no ambiente de desenvolvimento. Os testes automatizados
com objetos sinteticos nao homologam documentos clinicos nem resolvem as pendencias
de assinatura, envios automaticos de receitas e rotas antigas de receituario.
Reverter somente o commit desta entrega por checkpoint autorizado; nenhuma
alteracao destrutiva ou migracao de banco faz parte do plano.
