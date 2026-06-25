# Spec — Módulo 2: Vídeo Personalizado do Dr. Caio (HeyGen + ElevenLabs)

Data: 25/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio). Método: Paxter Loop.
Origem: ENTREGA 28 (Motor de Encantamento) no Canvas. Decisões do CEO: validação de exames LIGADA,
limite de acompanhantes = 1, contas HeyGen/ElevenLabs serão cadastradas pelo CEO amanhã (26/06/2026),
"deixe tudo pronto, os conectores necessários", qualidade acima de velocidade (Kaizen).

## Objetivo (uma frase)
Gerar, sob demanda, um vídeo do Dr. Caio (rosto via HeyGen + voz clonada via ElevenLabs) que CHAMA O
CLIENTE PELO NOME, explica o pedido de exame, agradece a confiança, dá o preparo (ex.: bioimpedância)
e o convida para a consulta — e entregar esse vídeo por e-mail (Gmail já integrado) e WhatsApp (Twilio),
com toda a estrutura PRONTA e DORMENTE até as chaves serem cadastradas (custo zero enquanto dormente).

## Glossário (siglas explicadas na 1ª vez)
| Termo | Significado |
|---|---|
| HeyGen | Plataforma que cria vídeo de um avatar (rosto/corpo) que fala um texto |
| ElevenLabs | Plataforma que clona a voz de uma pessoa e gera fala a partir de texto (TTS = Text To Speech) |
| API (Application Programming Interface) | Porta de comunicação por onde nosso sistema conversa com HeyGen/ElevenLabs |
| Template (HeyGen) | Vídeo-modelo com VARIÁVEIS (ex.: {{primeiro_nome}}) trocadas a cada cliente |
| Variável dinâmica | Espaço reservado no roteiro que recebe um dado real (o nome do cliente) na hora de gerar |
| Databinder | Nossa ponte que pega o dado do banco (cliente.nome) e injeta na variável do template |
| voice_id | Identificador da voz clonada do Dr. Caio no ElevenLabs |
| template_id | Identificador do vídeo-modelo no HeyGen |
| Polling | Perguntar de tempos em tempos "o vídeo já ficou pronto?" até a API responder "completed" |
| Object Storage | Armazenamento de arquivos da Replit (já especificado em videos-upload-twilio.md) com URL própria |
| Dormente | Código pronto que NÃO faz chamada real (nem gasta) enquanto faltam as chaves no cofre |

## Como o NOME do cliente entra no vídeo (o "básico" que o CEO pediu)
Dois caminhos reais; adotamos o A (mais simples e robusto):

- CAMINHO A (adotado) — Template do HeyGen com voz ElevenLabs acoplada:
  1. No HeyGen, cria-se UM template com o roteiro contendo a variável de texto `{{primeiro_nome}}`
     (e outras: `{{exames}}`, `{{preparo}}`).
  2. A voz do avatar é configurada como a voz clonada do Dr. Caio no ElevenLabs (HeyGen integra ElevenLabs).
  3. Nosso sistema chama a API do HeyGen passando os valores das variáveis (o `{{primeiro_nome}}` vem
     do databinder). O HeyGen gera o vídeo já com o avatar FALANDO o nome, na voz do Dr. Caio.
  4. A geração é ASSÍNCRONA: a API devolve um `video_id`; fazemos polling do status até `completed`
     e então pegamos a URL do vídeo (.mp4).
- CAMINHO B (não adotado agora, registrado) — gerar o áudio no ElevenLabs por fora (TTS do roteiro com
  o nome) e enviar esse áudio ao HeyGen como trilha do avatar (lip-sync). Mais passos e mais pontos de
  falha; só consideraríamos se o HeyGen não permitir a voz ElevenLabs no template.

## Como o vídeo chega ao cliente (e-mail e WhatsApp)
```
[1 gera vídeo HeyGen] -> [2 guarda no Object Storage -> URL pública]
   -> [3a e-mail via Gmail (já integrado): link + player]
   -> [3b WhatsApp via Twilio: mensagem com link do vídeo (e mídia quando permitido)]
```
- WhatsApp usa a estrutura dormente já especificada em `videos-upload-twilio.md` (Twilio só dispara
  quando `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_FROM` existirem no cofre; sem isso devolve
  `sent:false` + prévia, custo zero).
- Limitação honesta do WhatsApp: para a clínica INICIAR a conversa fora da janela de 24h, a Meta exige
  um TEMPLATE de mensagem aprovado (HSM). Dentro de 24h após o cliente escrever, é livre. Na prática:
  enviar o LINK do vídeo num template aprovado é o caminho confiável; anexar o .mp4 direto depende da
  janela/política. Isto NÃO bloqueia o build (estrutura dormente).

## Requisitos exatos
1. CONECTORES PRONTOS E DORMENTES (sem chave amanhã = sem chamada real, sem erro, sem custo):
   - Chaves no cofre de segredos: `HEYGEN_API_KEY`, `ELEVENLABS_API_KEY` (o CEO cadastra em 26/06/2026).
   - Helpers de servidor `heygen.ts` e `elevenlabs.ts` usando `fetch` (sem SDK pesado), que: se a chave
     existir, chamam a API real; se não, devolvem `{ ready:false, reason:"sem_chave", preview:<roteiro> }`.
2. SUB-CADASTRO DE CONTEÚDOS (aba Cadastro): tela para o CEO cadastrar, por TIPO de vídeo:
   - `tipo` (ex.: guia_exames, boas_vindas), `template_id` (HeyGen), `voice_id` (ElevenLabs),
     `roteiro` (texto base com as variáveis), e o MAPA de variáveis → campo do cliente.
   - Tudo editável pelo CEO sem mexer no código (cumpre o Módulo 5 para esta parte).
3. DATABINDER DE NOME: ao gerar, o sistema substitui `{{primeiro_nome}}` pelo primeiro nome do cliente
   (mesma fonte do databinder do e-mail) e demais variáveis pelos dados reais (exames, preparo).
4. GERAÇÃO SOB DEMANDA: rota `POST /api/videos/personalizado/gerar` (body: clientId, tipo). Cria o
   pedido no HeyGen, guarda `video_id` e `status`. Dormente quando sem chave.
5. ACOMPANHAMENTO: rota/serviço que faz polling do status; ao `completed`, baixa o .mp4 para o Object
   Storage e grava a URL servível por cliente/tipo.
6. ENTREGA: botões "Enviar por E-mail" (Gmail) e "Enviar por WhatsApp" (Twilio dormente) na ficha do
   cliente/sessão, reusando a estrutura de `videos-upload-twilio.md`.
7. PERSISTÊNCIA: tabela `personalized_videos` (clientId, tipo, status, videoId, objectPath/url,
   geradoEm). Não tocar tabelas existentes além de adicionar esta nova.

## Casos extremos a tratar
| Caso | Tratamento |
|---|---|
| Sem chave HeyGen/ElevenLabs (amanhã) | Dormente: devolve preview do roteiro com o nome já substituído; nunca quebra/cobra |
| HeyGen demora/erra na geração | Status fica "processing"/"failed"; UI mostra estado; reprocessar manual; sem travar a tela |
| Nome do cliente vazio/estranho | Fallback para saudação neutra ("Olá!"); nunca falar "{{primeiro_nome}}" cru |
| WhatsApp fora da janela de 24h | Enviar via template aprovado com o LINK; honestidade se a política bloquear o anexo |
| Vídeo grande | Servir do Object Storage com prefixo restrito (uploads/); link em vez de anexo pesado |
| Custo | Nenhuma chamada real sem chave; geração só por ação explícita do CEO/recepção |

## Linhas vermelhas (NÃO cruzar)
- NÃO chamar HeyGen/ElevenLabs/Twilio de verdade durante build/validação (custo zero garantido).
- NÃO inventar chaves nem colar segredo no código — sempre via cofre (skill environment-secrets).
- NÃO duplicar a estrutura de Object Storage/Twilio: REUSAR a de `videos-upload-twilio.md`.
- NÃO tocar motor de agenda, injetáveis, RAS FAP, /api/budgets/calculate.
- Validar por runtime/screenshot (typecheck global é pré-quebrado).

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| Helpers HeyGen/ElevenLabs dormentes | Curl sem chave → ready:false + preview do roteiro com nome substituído |
| Sub-cadastro de tipos de vídeo | Screenshot da aba Cadastro salvando template_id/voice_id/roteiro |
| Databinder injeta o nome | Preview mostra "Olá, Maria" (não "{{primeiro_nome}}") |
| Tabela personalized_videos | push roda; SELECT funciona |
| Rotas de gerar/acompanhar/entregar | Curl responde sem custo quando dormente |
| Quando o CEO cadastrar a chave (26/06) | 1 vídeo real gera, guarda no Object Storage e toca por link |
| Revisão architect | requisito por requisito, zero pendência |

## RESUMO EM 1 LINHA
Módulo 2 = vídeo do Dr. Caio que fala o nome do cliente (HeyGen avatar + voz ElevenLabs, nome via
databinder), entregue por e-mail e WhatsApp, com conectores PRONTOS e DORMENTES até as chaves entrarem
no cofre — custo zero enquanto isso.
