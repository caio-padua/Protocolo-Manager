# Spec — Experiencia do Paciente (anamnese humanizada) + Linguagem de Estado (glow) + PWA

Data: 21/06/2026. Autor: Dr. Replit Paxter. Metodo: Paxter Loop (Especificar -> Construir -> Revisar).
Aciona esta onda: pedido do CEO Dr. Caio ("quer A e B juntos", colocar no loop, validar passando
pelo processo como paciente elitizado e leigo, aplicar as sugestoes do Dr. Chat sobre glow/estado
filtradas pelo senior, calibrar as "luzes muito expandidas", usar a logo Paxter de cima, criar PWA).

## Objetivo (uma frase)

Entregar a jornada do cliente (paciente) bonita, intuitiva e sem retrabalho: anamnese humanizada
funcionando ponta a ponta, uma linguagem de ESTADO visual calibrada (glow raro e intencional, nao
decoracao global), e o sistema instalavel como aplicativo (PWA) com a marca Paxter.

## Frentes desta onda

- A) Terminar as TELAS da anamnese humanizada (frontend dos requisitos R1-R14 ja especificados em
  `specs/anamnese-v2-humanizacao/requisitos.md`). Backend ja concluido e semeado.
- B) Revisar/ligar o Portal do Cliente (`/portal`) e a Area (`/area`) como porta de entrada.
- C) Linguagem de Estado (glow): aplicar as sugestoes do Dr. Chat, filtradas pelo senior, e CALIBRAR
  o excesso de luz atual ("luzes muito expandidas").
- D) PWA (Progressive Web App = app instalavel): manifest + service worker + icone da marca.
- E) Logo: usar a logo Paxter de cima (contorno quadrado que da a volta) como icone do app.

## Requisitos exatos

### A. Anamnese humanizada (frontend)
1. R1 — Modo teste reversivel: `VITE_OPEN_ACCESS="1"` libera a anamnese sem a senha de colaborador,
   com faixa ambar "MODO TESTE" visivel. Default DESLIGADO. (Avisar o CEO do risco de PII.)
2. R2 — Ao trocar de grupo/pergunta, a tela rola para o TOPO (sem o usuario ter que subir manual).
3. R4 — Pergunta com `videoUrl` mostra um botao "Ver video" (abre o video de apoio).
4. R6 — Cirurgias clicaveis (MULTISELECAO): "Nunca operei" e exclusiva; "Outra" revela o campo Q015B.
5. R7 — Filtro por sexo: pergunta com `aplicavelEm.sexo` so aparece para o sexo informado em A04.
6. R8/R9 — Escala com rotulos de texto mostra os ROTULOS (ex.: "Nunca", "As vezes"), nao o numero cru.
7. R10/R11 — Skip-logic por `dependeDe`: pergunta condicional so aparece se a resposta-ancora bater
   (booleano sim/nao, escolha unica, multiescolha, escala ou numero). Vale para CAGE2-QUEM,
   CAGE2-PARENTE, I-TAB02 e Q015B.
8. R12 — Tabagismo (maços-ano): dois campos gravados (cigarros/dia e anos); o sistema calcula sozinho
   e salva o numero. Nao quebra o contrato de salvar (valor tipo number).
9. R13 — Rota do paciente: `/area` aponta para `/anamnese/v2`; ao concluir, volta para `/area`.
10. A ajuda (`observacao`) aparece como ExplainRow (uma ideia por linha, Concavo + LED); o `exemplo`
    aparece como dica curta. Conteudo SEMPRE vem do banco, nunca hardcoded.

### C. Linguagem de Estado (glow) — refinada pelo senior
11. Glow nao e decoracao global: cada bloco so "acende" quando ha estado real (atencao, atraso,
    alerta, sucesso) ou no hover de desktop. No celular nao depende de hover.
12. Calibrar o excesso atual: reduzir blur/alcance/opacidade das luzes que estao espalhadas demais
    (relato do CEO + diagnostico do Dr. Chat). Manter o relevo 3D intacto; mexer so na luz.
13. Estados nomeados (classes), cada um com cor unica da marca (secao 4.3 da skill de layout):
    atencao=ambar, atraso/critico=vermelho, sucesso/concluido=verde, info/foco=ciano.
14. Hover de desktop discreto (sem ficar fixo no mobile). Reusar o que ja existe na skill
    (`paxter-underglow`, `paxter-attention`, `paxter-alert`, LEDs) antes de criar classe nova.

### D. PWA (app instalavel)
15. `manifest.webmanifest` com nome ("Padcon Conect" / "Paxter"), cores da marca, `display:standalone`,
    `start_url`/`scope` corretos para o base path do artifact.
16. Service worker simples (cache do app shell) registrado so em producao-like; nao atrapalhar o dev.
17. Icones do app (192 e 512, mais maskable) gerados a partir da logo Paxter de cima.
18. `<head>` com `theme-color` e link do manifest; o app pode ser "adicionado a tela inicial".

### E. Logo
19. Usar a logo Paxter de cima (contorno quadrado) como base do icone do PWA e, onde fizer sentido,
    como marca da area do cliente.

## Casos extremos a tratar
- A04 nao respondida ainda: nao esconder perguntas de sexo precipitadamente (so filtra quando ha
  resposta de sexo; antes disso, mostra para nao travar).
- Bloco inteiro que fica vazio apos filtro (ex.: bloco so-andrologico para mulher): mostrar estado
  vazio claro, nunca quebrar a navegacao por indice de grupo.
- Skip-logic em cascata (CAGE2 -> CAGE2-QUEM -> CAGE2-PARENTE): se a ancora some, a dependente some.
- Resposta ja gravada de pergunta que ficou escondida: nao recomputar score com ela visivel.
- maços-ano reaberto: os dois campos podem comecar vazios, mas o resultado salvo aparece.
- Service worker: nao cachear de forma a impedir atualizacao em dev (registrar so quando aplicavel).

## Definicao de PRONTO
- Todos os requisitos acima cumpridos e conferidos pelo architect (Fase 3), requisito por requisito.
- Validado de VERDADE passando pelo fluxo como usuario real (subagente de teste navega, preenche,
  avanca e envia) — nao apenas screenshot. Relato da experiencia na pele do paciente elitizado leigo.
- Glow calibrado: nenhuma tela com luz "espalhada demais"; glow so em estado real ou hover desktop.
- PWA instalavel (manifest valido + SW registrado + icones da marca).
- Padroes novos de glow/estado REGISTRADOS na skill-layout-paxter e anunciados ao CEO; aprendizado
  fino na memoria; metodo/diretriz no CODIGO-PAXTER.md.
- Comunicacao final em Densidade B, siglas explicadas, "RESUMO EM 1 LINHA".

## Linhas vermelhas (nao cruzar)
- Schema so aditivo; nunca truncar dados; conteudo das perguntas vem do banco, nao hardcoded.
- Nao mudar `pesoGravidade`/`peso` nem o motor de score por estetica.
- Nao mudar o payload de salvar respostas (valorSchema) — maços-ano salva como number.
- Nao remover o relevo 3D dos paineis (essencia); glow so calibra a LUZ, nao apaga o relevo.
- Nao tocar `/api/budgets/calculate` nem motores de calculo.
