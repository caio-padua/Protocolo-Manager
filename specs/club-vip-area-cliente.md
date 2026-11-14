# Área do Cliente (/area): abas MINHA CATEGORIA e CLUB VIP

Fonte: ordens do Dr. Caio de 14/11/2026. Estado de engenharia: EM REVISÃO (código preparado; sem publicação, sem homologação).

## Decisão do Dr. Caio (correção de 14/11/2026)

A categoria comercial do cliente (Prata, Ouro, Platinum, Diamond) NÃO entra no Club VIP: "uma coisa não tem nada a
ver com a outra". O Club VIP é um convite, de aceite voluntário. A experiência recreativa de bolões chama-se
CONEXÃO MILIONÁRIA. A primeira versão desta aba exibia o nível dentro do Club VIP: estava errada e foi corrigida.

## Objetivo

Duas abas independentes na Área do Cliente, sem módulo novo de bolões:

1. MINHA CATEGORIA: mostra só o nível já cadastrado (`clients.plano`). Sem benefício, preço ou comparativo.
2. CLUB VIP: programa por convite. Seção CONVITES ESPECIAIS com o convite CONEXÃO MILIONÁRIA, que só leva à tela
   já existente "Meus Bolões" para consulta.

## Decisões de arquitetura

1. Navegação: chaves `minhacategoria` e `clubvip` em `TabKey` e `TABS`, nesta ordem, depois de EVOLUÇÃO e antes de
   COMUNICAÇÃO. Renderizadas por condição como as demais. Nenhum menu, rota de página ou navegação paralela.
2. MINHA CATEGORIA: `components/MinhaCategoriaCliente.tsx`; textos em `lib/minha-categoria-catalogo.ts`. Nível lido
   por `GET /area-paciente/minha-categoria` (projeção mínima `{ nivel }`, cliente SÓ do Bearer do portal, token na
   URL recusado). Valor fora dos quatro (`legado:*`, nulo, desconhecido) vira `null`: a tela diz que a categoria
   não está disponível. Nomes e paleta vêm de `lib/nivel-cliente.ts`. "Black" não existe.
3. CLUB VIP: `components/ClubVipCliente.tsx`; textos em `lib/club-vip-catalogo.ts`. A tela NÃO faz chamada à API e
   NÃO conhece nível. A rota antiga `GET /area-paciente/club-vip` (que devolvia o nível) foi REMOVIDA.
4. Blocos do Club VIP: "Como funciona" (por convite, aceite voluntário, independente de categoria); três áreas de
   benefícios, todas "Em configuração" (`itens: []`); CONVITES ESPECIAIS > CONEXÃO MILIONÁRIA.
5. CONEXÃO MILIONÁRIA: card com texto de facultatividade e separação (serviços médicos, categoria, tratamentos,
   mensalidades, descontos). O botão "Consultar Meus Bolões" apenas troca a aba para `boloes` (existente). Nenhum
   envio, convite, pagamento, aposta, cota, bilhete, Telegram, WhatsApp ou e-mail.
6. Voltar: a aba `boloes` mostra "← Voltar ao Club VIP" para quem veio dele; quem vem do Início volta ao Início.

## Falhas previstas e barreiras

| Gravidade | Falha | Barreira | Evidência |
|---|---|---|---|
| Crítica | Ler categoria de outro cliente (IDOR) | clientId só do token; sem parâmetro | teste de API: 401 sem token, consulta usa o id do token |
| Crítica | Vazar dado clínico na rota | select só da coluna `plano`; resposta só `{nivel}` | teste de API: corpo exato |
| Alta | Nível aparecer no Club VIP | Club VIP sem fetch e sem rota; rota antiga removida | API: `/club-vip` = 404; e2e: nenhuma leitura de categoria e nenhum nome de nível no texto |
| Alta | Exibir nível inventado | lista fechada no servidor e no cliente; falha de carga = sem categoria | testes API e e2e (null, "black", erro, 4 níveis) |
| Alta | Vínculo comercial entre bolão e serviços | texto fixo de separação; botão só navega | e2e: nenhuma requisição além de leitura |
| Média | "Voltar" levar ao lugar errado | origem em estado local | e2e: ida e volta nos dois caminhos |
| Média | Rolagem horizontal ou menu quebrado no celular | coluna única; menu em rolagem existente | e2e 390 e 1280 de largura |

## Limites (o que NÃO existe)

Não há registro de convite nem de aceite no sistema: a tela explica que o programa é por convite, mas não sabe se o
cliente foi convidado e não tem botão de aceitar. Qualquer controle de convite/aceite exige decisão e especificação
próprias. Nenhuma publicação foi feita.

## Pendências que dependem do Dr. Caio

Catálogo real de benefícios do Club VIP e da categoria (hoje nenhum cadastrado); validação jurídica/regulatória
antes de qualquer oferta relacionada a bolões; modelo de convite e aceite do Club VIP; existência ou não de nível
acima de Diamond.
