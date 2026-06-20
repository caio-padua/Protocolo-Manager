# Spec — Onda 8.5: Upload de Vídeo (Object Storage) + Estrutura de Lembrete Twilio

Data: 20/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio).
Origem: ENTREGA 8 da spec mãe `specs/portao-colaborador.md`.

## Objetivo (uma frase)
Permitir que o colaborador faça UPLOAD REAL de um vídeo de apresentação (guardado no
Object Storage da Replit) que toca de verdade na tela do paciente, e deixar pronta —
dormente — a estrutura de lembrete por Twilio, sem custo e sem envio real agora.

## Glossário
| Termo | Significado |
|---|---|
| Object Storage (App Storage) | Armazenamento de arquivos da Replit (sobre Google Cloud Storage), com URL própria |
| Presigned URL | Endereço temporário e assinado para o navegador enviar o arquivo direto ao armazenamento |
| objectPath | Caminho interno do arquivo (ex.: /objects/uploads/uuid) que guardamos no banco |
| Twilio | Serviço de mensagens (WhatsApp/SMS/voz); aqui só estruturamos o gatilho, sem enviar |
| Dormente | Código pronto que NÃO executa envio real enquanto faltarem credenciais (custo zero) |

## Estado atual (já existe)
1. Vídeo hoje é só um LINK em `site_content.mediaUrl` (chave `video_apresentacao_geral`).
2. `agendar.tsx` mostra um placeholder com a URL escrita, não um player de verdade.
3. Aba "Vídeos" da Central de Cadastro só aceita colar link ("upload em breve").
4. NÃO há Object Storage provisionado ainda. NÃO há credenciais de envio Twilio nos secrets.

## Requisitos exatos

### Parte A — Upload de vídeo (entrega principal, testável)
A-1. Provisionar Object Storage (idempotente).
A-2. Servidor: helper de Object Storage + rota para (a) pedir presigned URL de upload e (b) servir o arquivo. Validação de entrada com Zod. Logs via `req.log`.
A-3. Aba "Vídeos" da Central de Cadastro: além de colar link, um botão "Enviar vídeo" que sobe o arquivo (fluxo presigned em 2 passos) e grava o caminho servível em `site_content.mediaUrl`. Mostrar progresso simples e o vídeo atual.
A-4. `agendar.tsx`: trocar o placeholder por um PLAYER real (`<video controls>`) quando a URL for um arquivo de vídeo ou um caminho do nosso Object Storage; manter compatibilidade com link do YouTube/Vimeo (iframe) e, no pior caso, um link clicável.
A-5. Aceite: subir um arquivo .mp4 pela aba Vídeos e ver o vídeo tocando em `/agendar`.

### Parte B — Estrutura de lembrete Twilio (dormente, custo zero)
B-1. Helper que MONTA a mensagem de lembrete a partir de uma solicitação de agendamento (nome, data, hora, profissional quando houver).
B-2. Rota `POST /api/scheduling/requests/:id/send-reminder` (segue a convenção das demais rotas de solicitação, ex.: `PATCH /api/scheduling/requests/:id`) que:
   - monta a mensagem;
   - SE existirem `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_FROM` no ambiente, envia via API REST do Twilio;
   - SENÃO, responde 200 com `{ sent: false, reason: "twilio_nao_configurado", preview: "<mensagem>" }` (nunca quebra, nunca cobra).
B-3. NÃO disparar nenhuma mensagem real durante o build/validação. NÃO adicionar SDK pesado (usar `fetch`). NÃO inventar credenciais.

## Linhas vermelhas
- Não tocar no motor de injetáveis nem no RAS FAP.
- Não misturar as 4 entradas.
- Nenhum envio real de Twilio sem credenciais (custo zero garantido).
- Validar por runtime/screenshot (typecheck global é pré-quebrado).
- Não acoplar a rotas geradas pelo codegen se o barril estiver quebrado; validar com Zod direto se preciso.

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| Object Storage provisionado | Variáveis de ambiente do bucket presentes |
| Upload de .mp4 grava mediaUrl servível | Curl/боtão + GET site-content |
| Vídeo TOCA em /agendar (player real) | Screenshot do player com controles |
| Aba Vídeos permite enviar arquivo | Screenshot do botão de upload |
| Rota de lembrete responde sem custo quando Twilio ausente | Curl POST → sent:false + preview |
| Sem envio real / sem cobrança | Leitura do código |

## RESUMO EM 1 LINHA
Onda 8.5 = upload real de vídeo no Object Storage tocando na tela do paciente, mais o gatilho de lembrete Twilio pronto e dormente (sem credenciais = sem envio e sem custo).
