# Spec — Módulo 4: Experiência da Consulta (questionário gastronômico + acompanhante + preparo)

Data: 25/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio). Método: Paxter Loop.
Origem: ENTREGA 28 (Motor de Encantamento). Decisão do CEO: limite de acompanhantes = **1**.

## Objetivo (uma frase)
Coletar do cliente, antes da consulta, suas preferências gastronômicas (para montar um cardápio de
finger food de recepção), se virá com acompanhante (limite 1) e entregar as instruções de preparo
(ex.: bioimpedância) — tudo cadastrável pelo CEO e na pele de luxo coerente com a marcação.

## Glossário (siglas explicadas na 1ª vez)
| Termo | Significado |
|---|---|
| Finger food | Petiscos servidos em porções pequenas, comidos com a mão, para recepcionar o cliente |
| Acompanhante | Pessoa que vem com o cliente à consulta (limite 1, decisão do CEO) |
| Bioimpedância | Exame de composição corporal que exige preparo (ex.: jejum, sem exercício antes) |
| Sub-cadastro | Área na aba Cadastro onde o CEO edita perguntas, opções e textos sem mexer no código |

## Estado atual (verificado)
1. A tela de marcação do cliente já tem pele de luxo bordô/mocha + ouro (`marcacao-luxo-bordo-mocha.md`).
2. Existe padrão de página pública mobile-first (portal do cliente) que serve de molde de fluxo público.
3. O envio (e-mail/WhatsApp) e o databinder de nome já estão arquitetados (Módulo 2).

## Requisitos exatos
1. QUESTIONÁRIO GASTRONÔMICO (respondido pelo cliente, mobile-first):
   - Perguntas cadastráveis (ex.: doce x salgado, bebida favorita, preferências, **restrições/alergias**).
   - Enviado por link (e-mail/WhatsApp) levando a uma mini-página pública (molde do portal) OU dentro
     da Área do Paciente. Pele de luxo coerente (bordô/mocha + ouro no escuro).
2. CARDÁPIO DE RECEPÇÃO:
   - A partir das respostas, o sistema monta/sugere um cardápio de finger food para a equipe preparar.
   - Itens do cardápio são cadastráveis (catálogo simples editável pelo CEO).
3. ACOMPANHANTE:
   - O cliente informa se virá acompanhado; **limite = 1**. Nome do acompanhante opcional.
   - Pedir mais de 1 é bloqueado com mensagem clara.
4. PREPARO:
   - Instruções de preparo (ex.: bioimpedância) exibidas ao cliente e enviadas junto ao guia; texto
     cadastrável por tipo de exame/consulta.
5. SUB-CADASTRO — vive na CENTRAL DE CONTEÚDO ÚNICA (Módulo 5, `sub-cadastro-conteudos.md`),
   namespaces `questionarios`, `cardapios` e `preparo_textos`. NÃO criar cadastro isolado.
   - O CEO edita: perguntas do questionário, opções de cardápio e textos de preparo, sem código.
6. PERSISTÊNCIA: tabela `consulta_experiencia` (clientId, sessaoRef, preferencias jsonb,
   restricoesAlergias text, acompanhante { vira:boolean, nome?:string }, cardapioSugerido jsonb,
   respondidoEm). Não alterar tabelas existentes além de adicionar esta.

## Casos extremos a tratar
| Caso | Tratamento |
|---|---|
| Cliente não responde o questionário | Cardápio padrão (fallback); não trava a recepção |
| Alergia/restrição alimentar informada | Destacar em VERMELHO para a equipe (segurança alimentar) |
| Cliente pede 2+ acompanhantes | Bloquear no limite 1, mensagem clara e gentil |
| Texto de preparo não cadastrado | Mostrar preparo genérico + aviso interno para cadastrar |
| Leitura mobile (360/390/430) | Sem reflow; contraste sobre bordô/mocha (texto claro/champanhe) |

## Linhas vermelhas (NÃO cruzar)
- NÃO misturar preferência gastronômica com dado clínico (são coisas diferentes); porém alergia
  alimentar é informação sensível — tratar com cuidado e destaque.
- NÃO tocar motor clínico/anamnese/agenda.
- Manter o relevo 3D Paxter e a pele de luxo da marcação (não inventar estilo).
- Validar por runtime/screenshot (typecheck global é pré-quebrado).

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| Questionário responde e salva | Responder pelo link e ver no banco/ficha |
| Cardápio é montado/sugerido | Após responder, ver o cardápio sugerido para a equipe |
| Acompanhante limitado a 1 | Tentar 2 → bloqueio com mensagem |
| Preparo exibido e enviado | Ver preparo na tela do cliente e na mensagem |
| Sub-cadastro edita perguntas/cardápio/preparo | Screenshot salvando alterações |
| Alergia destacada para a equipe | Informar alergia → aparece em vermelho na visão interna |
| Tabela consulta_experiencia | push roda; SELECT funciona |
| Telas premium (claro e escuro) | Screenshots desktop + 360/390/430 |
| Revisão architect | requisito por requisito, zero pendência |

## RESUMO EM 1 LINHA
Módulo 4 = o cliente diz o que gosta de comer (e se traz 1 acompanhante) numa tela de luxo, o sistema
monta o cardápio de finger food da recepção e entrega o preparo (ex.: bioimpedância) — tudo editável
pelo CEO, com alergias destacadas para a equipe.
