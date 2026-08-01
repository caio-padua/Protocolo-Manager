---
name: Motor de Avatar — Tier system + metering + Hermes (Task #57)
description: Arquitetura completa dos avatares de voz e vídeo integrados ao Motor Hermes Paxter.
---

## Regra

O Motor Hermes (engine.ts) aceita 2 novos canais além dos 3 tradicionais:
- **VOICE** — gera MP3 via ElevenLabs, envia via Twilio MediaUrl (WhatsApp) ou anexo (Email)
- **VIDEO** — enfileira em avatar_video_queue; worker (cron 2min) faz polling HeyGen e entrega

### Canais no PaxterCanal (types.ts)
```
"EMAIL" | "WHATSAPP" | "TELEGRAM" | "VOICE" | "VIDEO"
```

### PaxterEnvioContexto — campos novos obrigatórios para VOICE/VIDEO
- `empresaId: number` — obrigatório para VOICE e VIDEO (localiza avatar da clínica)
- `avatarId?: number` — override direto do avatar (pula busca por empresa)
- `clienteId?: number` — para rastreio e metering
- `contexto?: string` — descrição do uso (ex: "lembrete_prescricao_voz")

### Lookup de avatar por canal
1. Se `ctx.avatarId` → busca direto por id (status=ativo obrigatório)
2. Senão → `getAvatarAtivoPorEmpresa(empresaId)` — prefere Médico>Secretária>Livre

### Fluxo VOICE
1. Localiza avatar com ElevenLabs configurado
2. `gerarAudio(script, avatar.elevenLabsVoiceId)` → MP3 Buffer
3. WhatsApp: `setAudioTemp(buffer)` → chave → URL pública `/api/avatares/audio-temp/:key`
4. Email: anexo MP3 (content: buffer, contentType: audio/mpeg)
5. Registra metering + avatar_envios

### Fluxo VIDEO (assíncrono)
1. Localiza avatar com HeyGen configurado (heygenAvatarId)
2. Insere em avatar_video_queue (status=pendente)
3. Retorna videoQueueId imediatamente
4. Worker (2min) faz polling → `buscarStatusVideo()` → quando completed → entrega link

### Tabelas novas (criadas em 01/08/2026 via SQL manual)
- `avatar_video_queue` — fila assíncrona de vídeos HeyGen
- `avatar_envios` — histórico de todos os envios VOICE e VIDEO

### Funções novas em avatar-messenger.ts
- `setAudioTemp(buffer)` — exposta (antes era interna como storeAudioTemp)

### Rotas novas em /api/avatares
- `POST /:id/disparar` — disparo manual com seleção de canal e cliente
- `POST /campanha` — bulk para lista de clienteIds (best-effort background)
- `GET /:id/historico` — histórico de envios do avatar
- `GET /fila-video` — estado da fila HeyGen

### Worker
- `lib/avatar-video-worker.ts` — `processarFilaVideo()` — cron 2min
- MAX_TENTATIVAS = 10 (~20min de polling)
- gerarVideo() LANÇA on error (não retorna success); envolver em try/catch

**Why:** Médico quer que paciente OUÇA sua voz no lembrete. Canal VOICE é aditivo — texto WhatsApp já saiu, voz vem depois.
**How to apply:** Sempre passar empresaId no contexto quando usar VOICE ou VIDEO. Nunca esperar resposta síncrona de VIDEO.
