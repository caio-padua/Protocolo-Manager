---
name: PaxCare planos B2C
description: Decisões duráveis dos planos do paciente
---
- Previa do administrador nunca acessa rotas do paciente no PaxCare (credencial distinta).
- Assinatura do app é separada do PAM da clínica.
- Plano nasce vazio: nenhum valor comercial inventado.
- Aceite vale para a oferta completa exibida; qualquer mudança de condição exige novo aceite.
- Medição de franquia existe como motor, mas não está ligada a nenhuma operação real do paciente; cobrança real não integrada.
**Why:** revisão apontou aceite sobre texto parcial e medição sem uso real.
**How to apply:** ao ligar uma operação cobrável, recusar antes de entregar e usar chave de idempotência.
