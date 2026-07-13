# Spec — Apelido manual na Sala de Triagem (escolher exame do catálogo)

Data: 13/07/2026. Autor: Dr. Replit Paxter (por ordem do CEO Dr. Caio).
Método: Paxter Loop (Especificar -> Construir -> Revisar).

## 1. Problema (relatado pelo CEO)

Na Sala de Triagem (rota `/cadastros/console-exames`), uma grafia de laudo cai na fila
como "ambígua" com uma sugestão do sistema. Exemplo real: `TIROXINA TOTAL - T4` entra
com o aviso "PARECE VARIANTE DE T4 LIVRE".

As três ações atuais por item são:

| Ação de hoje | O que faz | Limite |
|---|---|---|
| VIRAR APELIDO | funde a grafia no exame SUGERIDO (`suggestedCode`) | só o sugerido; T4 Total NÃO é apelido de T4 Livre |
| CRIAR NOVO | cria um cadastro DESCOBERTO | duplicaria: T4 Total JÁ existe no cadastro |
| IGNORAR | tira da fila (não é exame) | não é o caso |

Falta a quarta ação: **virar apelido de OUTRO exame já cadastrado, escolhido pelo
usuário** (não o sugerido). É o caso do T4 Total, que já existe como exame próprio.

## 2. Descoberta técnica (verificada no código)

O backend JÁ resolve isto. `POST /api/exames-lab/triagem/:id/resolver` com
`{ acao: "apelido", targetCode }` aceita QUALQUER `targetCode` do catálogo, não só o
sugerido. `absorbAsAlias` recusa (HTTP 409) se a grafia já pertence a outro exame —
trava de segurança que continua valendo. **Nenhuma mudança de backend é necessária.**

A limitação é só de UI: em `ConsoleExamesTool.tsx` o botão "Virar apelido" só aparece
quando existe `suggestedCode` e sempre envia esse código.

## 3. Solução (só frontend — `ConsoleExamesTool.tsx`)

1. Novo botão por item da fila: "Apelido de outro…". Abre, embaixo do item, uma caixa
   de busca sobre o catálogo real (`rows` com `inCatalog === true`) — o mesmo universo
   do bloco de CADASTRO à esquerda.
2. A busca casa por `displayName`, `grupo` e `synonyms` (mesma normalização sem acento
   já usada em `filtrados`). Lista rolável, cada exame clicável.
3. Clicar num exame chama `resolverTriagem(t.id, "apelido", exame.code)` — reusa o
   handler existente. Só um seletor aberto por vez.
4. O botão "Virar apelido" (sugerido) passa a exibir o nome sugerido quando houver
   (`suggestedName`), para o usuário distinguir "o que o sistema achou" de "o que eu
   escolhi".
5. Feedback honesto de erro: se o resolver falhar (ex.: 409 grafia já pertence a outro
   exame), mostrar a mensagem do backend no item, em vez de falhar em silêncio.

## 4. Fora de escopo

- Backend (já suportado).
- Onda de colaboradores fictícios (recepção/administrativo/financeiro, cargos) — fica
  para depois, por ordem do CEO.

## 5. Critérios de aceitação

1. Consigo amarrar `TIROXINA TOTAL - T4` ao exame `T4 TOTAL` já existente (não ao
   sugerido T4 Livre, sem criar novo).
2. O item some da fila após resolver e o apelido aparece no cadastro do exame alvo.
3. Se a grafia já pertence a outro exame, vejo uma mensagem clara e o item permanece na
   fila.
4. Linguagem visual 3D Paxter preservada (concave-3d / btn-3d-soft; ouro/navy).
