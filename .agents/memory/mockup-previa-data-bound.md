---
name: Mockup de validacao precisa de previa data-bound
description: Por que mockups do CEO no Canvas devem ter estado controlado e previa ligada a edicao, nao defaultValue
---

# Mockup de validacao do CEO: previa tem que refletir a edicao

Quando o mockup serve para o CEO validar **intuitividade ponta-a-ponta** (nao so aparencia),
a previa do documento/PDF deve DERIVAR do estado editavel. Campos com `defaultValue`
(nao controlados) e previa hardcoded reprovam na revisao do architect, porque o CEO nao
consegue ver a edicao "fluir" para o resultado.

**Regra:**
- Campos editaveis = estado controlado (`useState` + `value`/`onChange`).
- Ferramenta compartilhada (ex.: FerramentaHdCid) = componente CONTROLADO (`{ value, onChange }`),
  com o estado subindo para a pagina, para a previa do documento poder lista-lo.
- A previa renderiza a partir do estado, nunca texto fixo.

**Why:** numa primeira passada o architect deu FAIL exatamente por isso (textareas defaultValue +
previa hardcoded); a segunda passada (estado controlado + previa derivada) deu PASS.

**How to apply:** vale para qualquer mockup-sandbox cujo objetivo seja validar fluxo de edicao.
Cuidado oposto: nao regenerar texto automaticamente a cada mudanca de dependencia se isso
sobrescreve a edicao manual do usuario (ex.: so regenerar o texto pronto do Encaminhamento ao
TROCAR a especialidade, nunca enquanto o medico digita).

## Historia entre DUAS telas-mock = fonte UNICA compartilhada (nao hardcode em cada tela)

Quando o mockup conta uma historia entre telas (ex.: tela de Governanca/permissoes LIBERA -> tela de
Laudo OBEDECE), as duas telas devem ler a MESMA fonte de dados (um modulo `_xxx.ts` compartilhado,
arquivo `_`-prefixado para o glob de rotas ignorar). Se cada tela tiver seu proprio valor fixo
(ex.: `liberado: false` solto no Laudo) a coerencia fica so DECLARATIVA e o architect reprova:
a tela A diz "regra por papel" e a tela B mostra "bloqueado global".

**Regra:** dado que liga duas telas mora num modulo unico; cada tela DERIVA o seu estado dele
(ex.: `podeUsar(matriz, item, papel)`), e a tela "consumidora" mostra o contexto (ex.: "visto como:
Medico Validador") e o motivo correto ("bloqueado p/ este papel", nao "bloqueado global").

**Why:** o architect deu FAIL pedindo "estado mock compartilhado de permissoes" porque Laudo tinha
`TIPOS[].liberado` fixo e Governanca tinha regra por papel — narrativa nao representada no comportamento.

**How to apply:** mockups que demonstram permissao/perfil/feature-flag entre telas; tambem garantir
nome acessivel (`aria-label`) por celula em matrizes de toggle (ferramenta + papel).
