---
name: Cobrança de teste Asaas — guard de identidade e limites vigentes
description: Teste real só no cadastro cuja identidade bate local×Asaas; teto R$5/10 cobranças/R$50; webhook de produção não se mexe sem mapa.
---
Cobrança de teste real (laboratório) confere nome, CPF e e-mail do cadastro local contra o cliente no Asaas ANTES de reservar; divergência = 409 e nada é cobrado. Tetos: R$ 5,00 por cobrança, 10 cobranças, R$ 50,00 total (substitui o antigo R$ 1,00 x 50).
**Why:** o Asaas avisa o cliente por conta própria (e-mail/SMS) e cobra taxa fixa (~R$ 1,99 no PIX): cobrar o cadastro errado é efeito real. Aceito pelo provedor não é recebido nem pago; pago só por consulta/evento real.
**How to apply:** o webhook de produção do Asaas está desabilitado/interrompido, sem authToken, apontando ao domínio de desenvolvimento; é lido por GET /api/asaas/webhook-diagnostico (só leitura). Nunca recriar/reativar sem apontar ao domínio publicado, definir authToken e testar com uma cobrança. Usar "sincronizar" (leitura) para status.
