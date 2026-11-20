---
name: Tela publica de pagamento PaxMed (/pagar/:token)
description: Decisoes da tela de pagamento por link: token em hash, valor sempre do Asaas, previa estatica.
---
Link de cobranca do cliente abre /pagar/:token (padcom), que consulta GET /api/pagamento/:token (publico, antes do portao). Valor, situacao e link de pagamento vem do Asaas a cada abertura; sem resposta do provedor = erro 502, nunca valor de copia local. Resposta sem nome, CPF ou e-mail; botao so com endereco https do dominio asaas.com.

**Why:** pedido do Dr. Caio (20/11/2026): nunca mostrar quantia errada nem dados pessoais; a previa do Telegram/WhatsApp e imagem estatica (cartao generico PaxMed), so a pagina traz o valor.

**How to apply:** novos tipos de cobranca entram na tabela cobranca_link_publico (origem) e em consultarLink; emitir link novo NAO revoga os antigos (mensagem enviada nao pode quebrar). Visual reaproveita a skill previa-de-link; Numeral/Valor para o dinheiro.

**Flyer (20/11/2026):** a tela e o Telegram usam o MESMO flyer PNG do molde unico (lib flyer-paxmed, registrado na skill previa-de-link). Campos imutaveis, ausente = Não localizado, clinica por ultimo. Asaas so informa a DATA do pagamento: horario fica Não localizado ate haver fonte.
