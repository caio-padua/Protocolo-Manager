# Club VIP — aba da Área do Cliente (/area)

Fonte: ordem do Dr. Caio de 14/11/2026. Estado de engenharia: EM CONSTRUÇÃO (sem publicação).

## Objetivo

Nova aba interna "CLUB VIP" na Área do Cliente: espaço de relacionamento do Instituto Pádua, com o nível do
cliente (quando seguro), áreas de benefícios ainda em configuração e um convite social OPCIONAL para conhecer
a tela já existente "Meus Bolões".

## Decisões de arquitetura

1. Navegação: a chave `clubvip` entra em `TabKey` e em `TABS` (depois de EVOLUÇÃO, antes de COMUNICAÇÃO) e é
   renderizada por condição, como as demais. Nenhum menu, rota ou navegação paralela.
2. Componente isolado: `artifacts/padcom/src/components/ClubVipCliente.tsx`; dados estáticos em
   `artifacts/padcom/src/lib/club-vip-catalogo.ts` (tipado, sem texto espalhado no JSX).
3. Nível: lido por rota própria `GET /area-paciente/club-vip`, separada do resumo clínico. Projeção mínima:
   `{ nivel: "prata"|"ouro"|"platinum"|"diamond"|null }`. Cliente vem SÓ do token do portal (Bearer).
   Valor fora dos quatro (inclui `legado:*`, nulo, desconhecido) vira `null` — nunca inventa nível.
   Nomes e paleta vêm de `lib/nivel-cliente.ts`. "Black" não existe.
4. Benefícios: três áreas informativas (Conteúdos e orientações; Experiências e encontros; Relacionamento e
   atendimento). Todo benefício concreto fica "Em configuração" até aprovação do administrador. Sem preço,
   cobrança, comparativo de upgrade, desconto, prioridade, brinde ou serviço prometido.
5. Convite "Confraternização entre amigos": card separado; texto acolhedor e aviso de facultatividade e
   independência (consultas, tratamentos, protocolos, mensalidades, planos, descontos, benefícios clínicos).
   CTA "Conhecer os bolões" apenas troca a aba para `boloes` (já existente). Nenhum envio, pagamento, cota,
   ponto ou segmentação clínica; nada de Telegram/WhatsApp/e-mail.
6. Voltar: a aba `boloes` ganha "← Voltar" para quem veio do Club VIP (origem guardada em estado local);
   quem vem do Início continua voltando ao Início. Nenhuma outra aba é alterada.

## Falhas previstas e barreiras

| Gravidade | Falha | Barreira | Evidência |
|---|---|---|---|
| Crítica | Ler nível de outro cliente (IDOR) | clientId só do token; sem parâmetro | teste de API: 401 sem token, consulta usa o id do token |
| Crítica | Vazar dado clínico na rota | select só da coluna `plano`; resposta só `{nivel}` | teste de API: corpo exato |
| Alta | Exibir nível inventado | validação em lista fechada no servidor e no cliente; falha de carga = sem nível | testes API e e2e (sem nível, 4 níveis, erro) |
| Alta | Vínculo comercial entre bolão e benefícios | textos fixos de separação; CTA só navega | e2e: nenhum POST além da leitura |
| Média | Aba "boloes" voltar ao lugar errado | origem em estado local | e2e: ida e volta |
| Média | Rolagem horizontal no celular | layout em coluna única | e2e 390 e 1280 |

## Pendências que dependem do Dr. Caio

Catálogo real de benefícios por nível; validação jurídica/regulatória antes de qualquer oferta comercial
relacionada; existência ou não de um nível acima de Diamond ("Black" não existe no modelo).
