---
name: Wordmark PAXTER segue a logo aprovada
description: A marca PAXTER em texto deve reproduzir a logo oficial do CEO (serifa cinzelada ouro 3D), nunca inventar letras
---

Regra: qualquer "wordmark"/nome PAXTER renderizado deve REPRODUZIR a logo oficial aprovada
pelo CEO (anexo `LOGO_PAXTER_0_(PRINCIPAL)`): serifa engravada estilo Trajan/Cinzel, face de
ouro polido em bandas de reflexo, com EXTRUSAO para baixo (relevo "saliente"/sobressalente).
As 2 frases ("Clinical Intelligence System" e "PRECISION IN INTEGRATIVE CARE") tambem entram
em ouro 3D no mesmo tratamento.

**Why:** o CEO rejeitou explicitamente 5 modelos de wordmark abstratos (geometrico, stencil,
inline, monolito) por nao terem "nada a ver" com a logo que ele ja definiu. A identidade ja
existe; o trabalho e VETORIZAR/replicar fiel, nao criar letras novas.

**How to apply:** usar `_shared/paxterLockup.tsx` (componente CSS/vetorial: `PaxterWord`,
`PaxterCIS`, `PaxterPrecision`, `PaxterLockup`). Fontes via @import Google: Cinzel (caps
engravadas do nome e da frase 2) + Cormorant Garamond (frase 1 elegante). Ouro = face
gradient com `-webkit-background-clip:text` + relevo via pilha de `text-shadow` (extrusao).
Escalavel/animavel (nao usar o PNG). Antes de propor letras novas, conferir esta regra.
