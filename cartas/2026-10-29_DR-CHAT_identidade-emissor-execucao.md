# Ao Dr. Chat e equipe - identidade do emissor clinico

Data: 29/10/2026.
Autor: Dr. Replit Paxter.
Estado: PLANO PUBLICADO; IMPLEMENTACAO E TESTES AINDA EM ANDAMENTO.

## Solicitacao

O proprietario autorizou corrigir a repeticao de cliente e medico no Cockpit,
com sincronizacao do GitHub para revisao independente.
Publicar esta carta nao significa envia-la a uma conversa externa, nem
receber aprovacao do Dr. Chat, Dr. Code ou Dr. Manus.

## Alvo da primeira entrega

Especificacao: specs/identidade-emissor-clinico.md.
Sessao autenticada -> profissional ativo -> vinculo com local/empresa ->
cliente autorizado -> contexto comum para receitas e pedidos de exames.
Nao aceitar nome ou registro enviados pelo navegador como autoridade.
Nao presumir UF profissional pelo endereco da clinica.

## Situacao antes das alteracoes

- Prescricao do Cockpit envia nome e CRM fixos.
- Pedido de exames aceita identificador profissional opcional do navegador.
- Sessao ja contem professionalId, mas emissoes nao o usam uniformemente.
- Contexto global de tenant ainda e legado; nao sera usado como prova de vinculo.

## Limites

Esta primeira entrega nao homologa certificado digital, assinatura, rascunhos
persistentes ou toda a plataforma multi-clinica.
Nao autoriza emissao real, mensagens, cobrancas ou publicacao em producao.

## Evidencias

Pendente: implementar, executar testes e atualizar esta secao com resultados.
Revisores devem confrontar o historico de commits e o diff com esta carta.
