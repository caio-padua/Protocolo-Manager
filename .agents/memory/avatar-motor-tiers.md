---
name: Motor de Avatar — Tier system e metering
description: Arquitetura do módulo de avatares de voz/vídeo com 3 tiers, metering por uso e integração com mensageria.
---

# Motor de Avatar — Tier System e Metering

**Tiers:**
- texto (1) = WhatsApp texto — sempre disponível
- voz (2)   = + ElevenLabs MP3 — requer avatar_modulos_contratados nivel='voz'
- video (3) = + HeyGen vídeo   — requer avatar_modulos_contratados nivel='video'

**Tabelas novas (SQL manual, não usar db push):**
- clinic_avatars — coluna nivel TEXT DEFAULT 'texto' adicionada via ALTER TABLE
- avatar_uso_log — metering linha por linha (provider, tipo, chars, segundos, cfRayId)
- avatar_modulos_contratados — qual empresa tem qual tier; empresa_id=5 tem voz+video no piloto

**Libs chave:**
- lib/avatar-messenger.ts — getAvatarAtivoPorEmpresa, enviarVozAvatarWhatsapp, enviarVozManual, getAudioTemp
- lib/avatar-metering.ts  — registrarUso, verificarModuloContratado, resumoUsoMes
- lib/elevenlabs.ts, lib/heygen.ts — clientes REST

**Rotas em routes/avatares.ts:**
- GET  /api/avatares/uso           — metering do mês
- GET  /api/avatares/audio-temp/:key — PÚBLICO sem auth, serve MP3 ao Twilio (TTL 5min)
- POST /api/avatares/enviar-voz    — aceita telefone OU clienteId (union schema Zod)

**Hook na mensageria existente:**
- lembrete-periodo.ts — após sendWhatsapp suceder, void enviarVozAvatarWhatsapp() best-effort
- empresaId vem de ctx.empresaId (adicionado ao select de carregarLembretesAtivos)

**Why:** Twilio busca MP3 via URL pública — cache memória TTL 5min + rota sem auth resolve.
**How to apply:** verificarModuloContratado() ANTES de chamar ElevenLabs; registrarUso() APÓS sucesso.
