---
name: Cadastro público por voz + auto-preenchimento de CEP
description: Armadilhas do fluxo público de cadastro com voz (Web Speech) e do disparo automático do ViaCEP.
---

# Voz em campos mascarados (Web Speech API)

Ditar CPF/data/telefone/CEP é dígito-a-dígito ("dois, três, meia"), não número por
extenso longo. O transcript do Web Speech em pt-BR às vezes vem por extenso, então
antes de aplicar a máscara é preciso normalizar fala→dígitos:

- mapear unidades 0-9 incluindo "meia"=6, dezenas 10-19 e dezenas 20-90 com composto
  ("vinte e um"→21);
- remover acentos antes de comparar (NFD + strip diacríticos);
- preservar dígitos literais já presentes.

**Why:** o architect reprovou "extrair só `\D`" porque número falado por extenso some.
**How to apply:** qualquer campo mascarado com microfone passa o transcript por um
normalizador pt-BR→dígitos antes da máscara; campos livres (nome) usam o texto cru.

# Auto-preenchimento de CEP (ViaCEP) — 3 armadilhas que o architect cobra

1. **Closure defasado:** disparar o lookup logo após `setCep(...)` e ler o estado `cep`
   dentro da função pega o valor ANTIGO (estado React é assíncrono). A função de busca
   deve RECEBER o valor explícito (`lookupCepByValue(valorRecemFormatado)`), nunca ler
   o estado do closure. O botão da lupa é só um wrapper que passa o estado atual.
2. **Resíduo de campo:** `if (data.complemento) set(...)` deixa o complemento do CEP
   anterior quando o novo CEP não tem complemento. Sempre sincronizar:
   `setComplemento(data.complemento || "")`.
3. **Corrida entre buscas:** duas buscas concorrentes podem responder fora de ordem.
   Usar um contador em ref (`++seqRef.current`) e descartar a resposta se
   `seq !== seqRef.current`.

**Why:** os três foram apontados em passadas sucessivas do architect no mesmo fluxo.
**How to apply:** vale para QUALQUER auto-fill disparado por digitação/voz (CEP, busca
incremental) — passar valor explícito, sincronizar limpando, e guardar a sequência.
