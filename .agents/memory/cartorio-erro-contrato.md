---
name: Cartório / motor de assinatura — contrato de erro
description: Como erros do envio de assinatura chegam ao front e qual status a spec exige.
---
O motor de assinatura lança Error cuja `message` tem o formato `codigo: detalhe`
(ex.: `paciente_sem_canal: cliente nao tem telefone nem email`). A rota repassa o
texto inteiro em `{error}` e o front guarda isso em `ApiError.code`.

**Regra:** casar erro do motor por PREFIXO (`code.startsWith("paciente_sem_canal")`),
NUNCA por igualdade — a comparação exata sempre falha por causa do sufixo `: detalhe`.

**Status anti-órfã:** `paciente_sem_canal` deve retornar HTTP 400 (decisão da spec do
Cartório), não 422. Aplicado nas duas rotas de envio (`/assinaturas/enviar` e
`/assinaturas/tcle/enviar`).

**Why:** a spec do Cartório fixa 400 e o front depende do prefixo para mostrar a
mensagem amigável anti-órfã; quebrar qualquer um dos dois esconde o aviso justo no
caso em que o paciente não tem canal de envio.
**How to apply:** ao adicionar novos códigos de erro do motor, manter o formato
`codigo: detalhe`, mapear o status na rota e casar por prefixo no front.
