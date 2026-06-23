# Spec — Anamnese Paxter (APP REAL): visual validado, voz premium, videos, modo foco, CRUD de perguntas

Loop Paxter (ESPECIFICAR -> CONSTRUIR -> REVISAR). Esta spec deixou de ser "mockup": o CEO
pediu funcionalidade EDITAVEL DE VERDADE (colar videos exatos, gerir vozes, criar/editar/apagar
perguntas). Logo, o alvo e o APP REAL `artifacts/padcom`, nao o mockup-sandbox.

## Onde isso vive no app real (levantado, NAO comecar do zero)

| Peca | Arquivo / rota | Estado hoje |
|---|---|---|
| Tela do cliente (anamnese progressiva) | `artifacts/padcom/src/pages/anamnese-v2/index.tsx` (`/anamnese/v2`) | Typeform-like, JA tem modo foco, barra, render de video, fala-para-texto |
| Controles de resposta | `artifacts/padcom/src/pages/anamnese-v2/controls.tsx` | binario, escala, multipla, speech-to-text |
| Tela de administracao | `artifacts/padcom/src/pages/mega-anamnese/index.tsx` (`/mega-anamnese`) | edita TEXTO + peso; NAO tem campo de video_url, NAO tem criar/apagar, NAO tem voz |
| Tabela das perguntas | `lib/db/src/schema/motor.ts` -> `anamnese_questionario` | tem `pergunta`,`tipo_resposta`,`opcoes`(jsonb),`video_url`,`depende_de`,`ordem`,`e_sinal_alarme` |
| API perguntas | `GET /anamnese-v2/questions`, `PATCH /mega-anamnese/perguntas/:id` | edicao parcial ja existe |
| Voz premium | skill media-generation (`searchVoices`/`textToSpeech`, ElevenLabs `eleven_multilingual_v2`) | disponivel nativo, sem chave do CEO |

## Decisoes travadas

1. VOZ = premium ElevenLabs (multilingual v2) via media-generation. Gera MP3 reais em pt-BR,
   voz feminina jovem/elegante. Sem conta nem custo a configurar pelo CEO.
2. Construir no APP REAL (anamnese-v2 + mega-anamnese), reaproveitando schema/API existentes.
   NUNCA duplicar a tela nem o motor.
3. Aplicar o VISUAL VALIDADO do Paxter (medalhao com vidro, simbolo, barra) a tela real.

## Requisitos exatos (numerados)

### A) Tela do cliente (anamnese-v2)
1. Vidro cobrindo o medalhao INTEIRO (com o aro dourado), claro e escuro.
2. Simbolo ~72px com respiro dentro do quadradinho.
3. Escuro: medalhao um tom MAIS ESCURO que o painel abaixo; realcar simbolo+vidro.
4. Claro: resolver figura-fundo (medalhao champanhe um tom acima + halo + aro definido).
5. Vidro sutil sobre a barra de evolucao (dois temas).
6. Logo ORIGINAL (asset de marca), sem CAIXA ALTA tipografica; definir posicao nos dois temas.
7. Modo foco revisado (ja existe) — garantir liga/desliga sem pulo, centralizando pergunta+respostas.
8. Alto-falante em TODA pergunta: toca o audio premium da pergunta (estado lendo/parar/repetir).
9. Gravacao de audio nas perguntas abertas (gravar/parar/regravar + duracao); binaria/multipla so alto-falante.
10. Alinhamento travado: posicoes nunca mudam com o tamanho da pergunta; grade de opcoes FIXA
    (sem reflow "3 em cima 1 embaixo"); validar desktop + 360/390/430 px.
11. Video real: render do `video_url` da pergunta (player), com placeholder claro quando vazio.

### B) Estudio de administracao (mega-anamnese)
12. Criar, editar e APAGAR pergunta (CRUD completo), respeitando ordem e dependencias.
13. Campo para colar o VIDEO exato por pergunta (`video_url`) — com pre-visualizacao.
14. Escolha/edicao de VOZ por pergunta (qual voz le aquela pergunta) + botao "gerar audio".
15. Onde o audio premium fica salvo e servido (object storage), com regeneracao ao editar texto/voz.

## Casos extremos
- Voz indisponivel/erro de geracao -> degradar com aviso, nunca quebrar a tela.
- Microfone negado -> mensagem clara, fluxo continua.
- Apagar pergunta usada por dependencia/motor -> avisar e nao corromper o motor.
- Editar texto da pergunta -> marcar audio como desatualizado ate regenerar.
- Vidro nunca reduz contraste do texto/ouro; alinhamento nao quebra com texto longo.

## Definicao de PRONTO
- Cada requisito acima conferido por execucao real + screenshot (desktop e celular).
- Architect aprova requisito por requisito, zero pendencia.
- Voz toca de verdade; video real renderiza; CRUD grava no banco.
- Entregue e demonstrado; comunicacao final em Densidade B.

## Linhas vermelhas
- NAO alterar o motor clinico (`computeMotor`), o skip-logic nem o payload de salvar por estetica.
- NAO duplicar a tela/admin; estender os existentes.
- NAO inventar auth; usar os guards ja existentes.
- Mudanca de schema = aditiva (nova coluna), com push controlado; nunca dropar dado.

## Sequencia (a confirmar com o CEO — uma pergunta)
Ordem das fatias de entrega: A (tela do cliente) primeiro vs B (estudio) primeiro vs tudo junto.
