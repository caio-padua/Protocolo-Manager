# Spec — Onda 8.4: Braços de Pagamento (Bloco D)

Data: 20/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio).
Origem: ENTREGA 8, Bloco D da spec mãe `specs/portao-colaborador.md`.

## Objetivo (uma frase)
Deixar cada uma das três entradas pagas com um "braço de pagamento" pronto — um link
de pagamento editável pelo colaborador e o texto elegante já vinculado — SEM nenhuma
cobrança real (o provedor entra depois, por decisão do CEO).

## Glossário
| Termo | Significado |
|---|---|
| Braço de pagamento | Estrutura no sistema que liga uma entrada a um link de pagamento e a um texto explicativo |
| Link de pagamento | Endereço (URL) que o CEO cola depois (gerado pelo provedor); aqui só guardamos e exibimos |
| Sinal | Pagamento parcial antecipado (25% no caso dos assistentes) abatido do total no dia |

## Estado atual (já existe — não refazer)
1. Textos de pagamento já semeados e editáveis em `site_content`: `pay_text_concierge`, `pay_text_assistente`, `pay_text_estetico`.
2. A coluna `payment_arm` já é gravada no agendamento (`concierge` / `sinal25` / `estetico_pos`).
3. As três entradas (Estético, Dr. Caio/concierge, Assistentes) já exibem o texto vinculado.

## Requisitos exatos (o que falta)
D-1. Guardar UM link de pagamento por braço, editável pelo colaborador, reutilizando `site_content` (categoria nova `payment_link`):
   - `pay_link_estetico` (estético — paga depois)
   - `pay_link_concierge` (concierge Dr. Caio — antecipado)
   - `pay_link_assistente` (sinal 25% do assistente)
   - O link fica no campo `body` do item (texto simples = URL).
D-2. A tela da Central de Cadastro (aba "Textos") passa a listar e editar também a categoria `payment_link` (rótulo claro: "Links de Pagamento").
D-3. Na tela do paciente (`agendar.tsx`), em cada braço pago, abaixo do texto já exibido, mostrar um botão de ação:
   - Estético → "Combinar pagamento" (default) — abre o link se houver.
   - Concierge → "Garantir encaixe (Concierge)" — abre o link se houver.
   - Assistente → "Pagar sinal de 25%" — abre o link se houver.
D-4. Fallback gracioso: se o link estiver vazio, o botão aparece DESABILITADO com legenda "Pagamento em breve" (nunca botão quebrado, nunca link vazio abrindo nada).
D-5. NENHUMA cobrança real, NENHUM provedor (Stripe/etc.) ligado. Só guardar/exibir/abrir o link que o CEO colar.

## Linhas vermelhas
- Não tocar no motor de injetáveis nem no RAS FAP.
- Não misturar as entradas (cada braço com seu próprio link e texto).
- Não implementar cobrança real nem integrar provedor.
- Validar por runtime/screenshot (typecheck global é pré-quebrado).

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| 3 links de pagamento existem em `site_content` (categoria `payment_link`) | Consulta no banco / GET site-content |
| Colaborador edita os 3 links na aba Textos e some/aparece | Editar um link e ver refletir |
| Cada braço pago mostra texto + botão de pagamento | Screenshot das 3 entradas |
| Link vazio → botão desabilitado "Pagamento em breve" | Screenshot com link vazio |
| Sem provedor / sem cobrança real | Leitura do código |

## RESUMO EM 1 LINHA
Onda 8.4 = três links de pagamento editáveis (concierge, sinal 25%, estético) ligados aos textos já existentes e exibidos como botão em cada entrada, sem nenhuma cobrança real.
