# Spec — Módulo 5: Central de Conteúdo (sub-cadastro único, editável pelo CEO)

Data: 25/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio). Método: Paxter Loop.
Origem: ENTREGA 28 (Motor de Encantamento) + revisão do architect (25/06/2026), que apontou
fragmentação de "sub-cadastros" espalhados entre Módulos 2 e 4. Esta spec UNIFICA tudo num lugar.

## Objetivo (uma frase)
Uma ÚNICA Central de Conteúdo na aba Cadastro onde o CEO edita, sem mexer no código, todos os
conteúdos do Motor de Encantamento (roteiros de vídeo, textos de preparo, questionários e cardápios),
organizados por NAMESPACE (gaveta), evitando duplicidade e inconsistência editorial.

## Glossário
| Termo | Significado |
|---|---|
| Namespace | "Gaveta" que separa um tipo de conteúdo de outro dentro da mesma central |
| CRUD | Criar, Ler, Atualizar e Apagar (Create, Read, Update, Delete) registros |
| Variável dinâmica | Espaço no texto (ex.: {{primeiro_nome}}) trocado por dado real do cliente na hora |

## Namespaces (gavetas) da Central
| Namespace | Guarda | Usado por |
|---|---|---|
| `video_templates` | tipo, template_id (HeyGen), voice_id (ElevenLabs), roteiro com variáveis, mapa variável→campo | Módulo 2 (vídeo) |
| `preparo_textos` | textos de preparo por tipo de exame/consulta (ex.: bioimpedância) | Módulos 2 e 4 |
| `questionarios` | perguntas do questionário gastronômico e suas opções | Módulo 4 |
| `cardapios` | itens de finger food disponíveis para montar o cardápio de recepção | Módulo 4 |

## Requisitos exatos
1. UMA tela "Central de Conteúdo" na aba Cadastro, com as 4 gavetas acima (abas/seções internas).
2. CRUD completo por namespace (criar/editar/apagar registros), com validação Zod e logs via `req.log`.
3. PERSISTÊNCIA: tabela única `content_entries` (id, namespace, chave, payload jsonb, ativo, atualizadoEm)
   — ou tabelas dedicadas por namespace se ficar mais claro; decisão de implementação registrada na
   construção. Não alterar tabelas existentes.
4. As variáveis dos roteiros são listadas e o CEO vê quais campos do cliente elas puxam (transparência).
5. As CHAVES de API (`HEYGEN_API_KEY`, `ELEVENLABS_API_KEY`) NÃO ficam nesta central — moram no cofre
   de segredos (skill environment-secrets). A central só referencia que estão/não estão presentes.
6. Os Módulos 2 e 4 CONSOMEM esta central; NÃO criam cadastros isolados.

## Casos extremos a tratar
| Caso | Tratamento |
|---|---|
| Roteiro com variável inexistente no cliente | Avisar na edição; no envio, fallback neutro (nunca texto cru "{{...}}") |
| Conteúdo desativado | `ativo=false` esconde do uso sem apagar histórico |
| Edição concorrente | `atualizadoEm` + último a salvar vence; sem perda silenciosa de campo |
| Preparo não cadastrado para um tipo | Fallback genérico + aviso interno para cadastrar |

## Linhas vermelhas
- NÃO guardar segredos/chaves nesta central (só no cofre).
- NÃO duplicar cadastros nos Módulos 2/4 — esta é a fonte única.
- NÃO tocar motor de anamnese/agenda/injetáveis/RAS FAP.
- Validar por runtime/screenshot (typecheck global é pré-quebrado).

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| 4 gavetas com CRUD | Criar/editar/apagar em cada namespace e ver refletido |
| Módulos 2 e 4 leem desta central | Vídeo/questionário/cardápio usam o que foi cadastrado aqui |
| Chaves só no cofre | A central mostra presença/ausência, nunca o valor |
| Tabela content_entries | push roda; SELECT funciona |
| Revisão architect | requisito por requisito, zero pendência |

## RESUMO EM 1 LINHA
Módulo 5 = uma só Central de Conteúdo (gavetas: roteiros de vídeo, preparo, questionários, cardápios)
editável pelo CEO, fonte única consumida pelos Módulos 2 e 4, com as chaves de API sempre no cofre.
