# Spec — Card de Gateway/Integração PADRÃO (Twilio e Gupshup primeiro)

Decisão do CEO Dr. Caio (28/06/2026). Objetivo: transformar o card de gateway numa MODELAGEM
padrão registrada na skill `skill-layout-paxter` (Art. 59 / Lei do Registro de Modelagem), para
depois REPLICAR em todas as telas de ferramenta/integração. "Tem que ter um padrão, não é pro
jeito do agente."

## Exigências do CEO (verbatim destrinchado)

| Nº | Exigência | Tradução técnica |
|---|---|---|
| 1 | Ícone à esquerda muito grande | reduzir para proporcional (placa Bevel menor) |
| 2 | Luzinha logo AO LADO do ícone | LED de vela no cabeçalho, colado ao ícone (não à direita) |
| 3 | "Indisponível" dentro do Insert Bevel, em vermelho | status TEXTUAL num sulco Concavo (`concave-3d`), cor por estado |
| 4 | Toggle "gateway ativo" na PARTE SUPERIOR | ToggleWell logo abaixo do cabeçalho, ANTES das informações |
| 5 | Credencial: insert EMBAIXO da palavra, num retângulo; valor explícito com OLHINHO | rótulo em cima + insert `concave-3d` com input + botão olho (revela o valor REAL do cofre) |
| 6 | Luzinha das informações à ESQUERDA, alinhada | ExplainRow com LED à esquerda `shrink-0` (linha vertical imaginária) |
| 7 | Posições FIXAS (tem ou não info, mesmo lugar) | Padrão 12: slots de largura/altura fixas; insert não estica conforme a frase |

## Direito do dono de ver o próprio segredo (olhinho)

Decisão: o CEO, como dono logado, tem direito de VER o valor armazenado ("é como me privar de ver
meu próprio RG"). Isso NÃO quebra o Art. 65 (segurança): o valor continua nunca trafegando por
padrão; só é revelado sob AÇÃO EXPLÍCITA do dono, por rota protegida por `requireCollaborator`
(mesma proteção da gravação). Sem login, nada é revelado.

Backend novo: `POST /api/comunicacao/gateways/:provider/reveal` (requireCollaborator) →
`{ values: { <field>: <valorReal> } }`, decifrando via `getSecret` (cofre tem prioridade; cai no env).

## Zonas do card (modelo da grade imaginária)

```
panel-3d-sub
  ZONA A  cabeçalho:  [ícone Bevel menor][LED vela]  NOME ............ [STATUS em insert Concavo]
  ZONA B  toggle:     ToggleWell (Concavo)  "GATEWAY ATIVO"  [Switch]      <- topo, antes da info
  ZONA C  informação: ExplainRow x N (LED à esquerda, alinhado)
  ZONA D  credencial: título "Credenciais (cofre)"; por campo:
            rótulo MAIÚSCULO (em cima)
            insert Concavo (retângulo, altura fixa): [input password/text] [olho]
            legenda fixa: "No cofre: ••••1234 · cofre"  (ou "—")
```

## Aceite

1. Ícone menor e proporcional; LED colado ao ícone no cabeçalho.
2. Status textual ("Configurado" / "Sem credenciais" / "Indisponível" / "Verificando…") dentro de
   insert Concavo, cor por estado (verde / âmbar / vermelho / neutro).
3. Toggle "GATEWAY ATIVO" na parte superior, em ToggleWell, antes das informações.
4. Cada credencial: rótulo em cima, insert retângulo embaixo, olho que revela o valor real do cofre
   (carrega só ao clicar) e oculta de volta.
5. Posições fixas: inserts e legendas não mudam de tamanho/posição com ou sem informação.
6. Padrão NOVO registrado na skill `skill-layout-paxter` (Padrão numerado) e anunciado ao CEO.
7. Validado por screenshot desktop + celular e revisão do architect sem pendência.

RESUMO EM 1 LINHA: card de gateway vira padrão Paxter — ícone proporcional + luz de vela no
cabeçalho, status em insert, toggle no topo, credenciais com olho que revela o valor real (rota
protegida) e posições fixas — registrado na skill para replicar em todas as telas.
