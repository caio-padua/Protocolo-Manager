# SEED — como um sistema novo nasce Paxter-certificado

Checklist para dar a um sistema/repositorio NOVO a mesma essencia Padcon / Dr. Caio.

## Passo a passo

Passo 1 -> trazer o pack: copie a pasta `paxter-pack/` (do GitHub `paxter-pack` ou do cofre
Obsidian) para a raiz do novo repositorio.

Passo 2 -> instalar as skills: copie tudo de `paxter-pack/skills/` para `.agents/skills/` do novo
repositorio (mantendo as subpastas `paxter-loop/` e `skill-layout-paxter/`).

Passo 3 -> instalar o MAPA: no `replit.md` do novo sistema, cole a secao "MAPA DA MEMORIA"
apontando para os mesmos donos (Codigo Paxter, skill de layout, `.agents/memory`, `specs/`, `cartas/`).

Passo 4 -> certificar: rode a auditoria apontando para as skills recem-copiadas:
`pnpm --filter @workspace/scripts run paxter:audit -- --target .agents/skills`
O resultado tem que ser "CERTIFICADO (100% alinhado ao selo)".

Passo 5 -> adaptar a marca: o que e ESPECIFICO do sistema novo (nome, paleta, dominio) entra no
`replit.md` dele; o que e METODO/DESIGN herdado fica nas skills (nao reescrever).

## Regra

A linguagem (metodo + design) e HERDADA e identica entre os primos. So o conteudo de negocio muda.
Padrao novo de design criado num sistema volta para a fonte viva e e re-selado com `paxter:pack`
(Lei do Layout, Art. 59 do Codigo Paxter).

RESUMO EM 1 LINHA: copiar o pack, instalar skills + MAPA, auditar ate certificar, e so entao
personalizar a marca do sistema novo.
