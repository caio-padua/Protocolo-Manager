---
name: O ELO — ordem do veredito e honestidade causal
description: Regras invioláveis do motor que cruza aderência com marcador de exame; ordem de julgamento e proibição de afirmar causa.
---

# Regra 1 — cruzamento de faixa vence o limiar de ruído

Ao julgar se um marcador melhorou ou piorou entre duas coletas, avaliar **nesta ordem**:

1. Marcador `target` sem faixa de referência completa devolve **SEM VEREDITO** (nunca "estável").
2. **Cruzar a faixa de referência** decide sozinho, a favor ou contra.
3. Só então aplicar o corte de ruído de laboratório.
4. Por fim, aplicar a `direction` do catálogo (`lower_better` / `higher_better` / `target`).

**Why:** um corte percentual global aplicado primeiro mascara mudança clínica real.
Caso concreto que reprovou a primeira versão: hemoglobina glicada de 5,6 para 5,7 sobe
apenas 1,8% — abaixo de qualquer limiar de ruído — mas **atravessa o teto de referência**
e entra em faixa de pré-diabetes. Com a ordem invertida o médico não seria avisado.

**Também:** devolver "estável" quando falta a faixa de referência é mentir por omissão.
O motor tem de calar (SEM VEREDITO) em vez de fingir estabilidade.

**How to apply:** vale para qualquer motor que compare valor de exame contra faixa —
não só O ELO. Um limiar percentual global é sempre provisório; a tolerância definitiva
é **por analito** (o ruído do TSH não é o da HbA1c) e é decisão clínica do Dr. Caio,
nunca decisão de programador.

# Regra 2 — nenhuma tela afirma causa

Duas coletas consecutivas estabelecem **coincidência no tempo**, jamais relação causal.

Proibido em qualquer tela, PDF ou mensagem: "a constância funcionou", "prova que o
tratamento funcionou", "por causa do tratamento".

Permitido: "os dois caminharam juntos", "na mesma janela", "associação temporal",
"a leitura clínica é do médico".

**Why:** o CEO é médico endocrinologista. Afirmação causal a partir de dado observacional
de duas medidas é erro técnico que destrói a credibilidade do produto inteiro, e contradiz
a exigência de sinceridade total. Foi apanhado em revisão: a especificação dizia
"coincidência medida" enquanto a tela do paciente dizia "a constância funcionou".

**How to apply:** ao escrever texto de resultado clínico, checar se a frase sobreviveria
à pergunta "isso prova causa?". Se não sobreviver, trocar por linguagem de associação.
A tela do médico deve ainda trazer o aviso explícito de que o motor mede coincidência.
