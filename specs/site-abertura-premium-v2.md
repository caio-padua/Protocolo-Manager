# Spec — Site /abertura premium v2 (símbolo contido + marca PADCON + acessos)

## Objetivo
Deixar o site público `/abertura` premium e correto de marca: símbolo dourado chapado com brilho CONTIDO (sem lavar o painel navy), rodapé com a empresa PADCON (não Instituto Pádua) clicável + símbolo PADCON próprio, e mais "abas"/acessos (Cliente e Colaborador), validado em desktop e nos celulares principais.

## Contexto de marca (fonte: artifacts/padcom/src/lib/brand.ts)
- PAXTER = o sistema clínico (produto comercial, vendido a várias clínicas).
- PADCON = a empresa que desenvolve o Paxter. Tagline EN: "Advanced Systems Architecture".
- Instituto Pádua = apenas uma clínica que licencia o Paxter. NÃO é dona do sistema.

## Requisitos exatos
1. Símbolo no site: CHAPADO (sem vidro/bevel), no mesmo plano do wordmark (estilo PAWARDS). Dourado rico. O vidro/bevel continua só na variante compact (app/anamnese/marcação).
2. BRILHO CONTIDO: nenhuma luz dourada pode lavar ou mudar a característica do painel navy ao redor — nem na sidebar (canto superior esquerdo) nem no hero. Reduzir/eliminar radiais douradas grandes e drop-shadows espalhados; o brilho fica concentrado no símbolo.
3. Marca correta: o site é do PRODUTO Paxter. NÃO citar "Instituto Pádua" em nenhum lugar do site.
4. Rodapé: empresa PADCON + tagline EN "Advanced Systems Architecture" + símbolo/logo PADCON + área clicável que abre o site da PADCON em nova aba.
5. Criar um símbolo/logotipo PADCON próprio (SVG geométrico, dourado/navy), componente reutilizável.
6. Mais acessos/abas: incluir Área do Cliente (/area) e Área do Colaborador (/entrada), além dos acessos atuais (Ficha de Saúde, Agendar, Enviar Exames). Surpreender com uma seção de Acessos em destaque + item no menu.
7. Dimensões conferidas: validar por screenshot no desktop (1280) e em 2 larguras de celular principais (≈390 e ≈414) — sem corte/transbordo.

## Casos extremos
- mix-blend screen exige fundo escuro; o RECORTE do símbolo vem do screen, NÃO do brilho. Logo, dá para reduzir drop-shadow/radiais sem quebrar o recorte.
- Todos os links devem apontar para rotas que existem (/area, /entrada, /anamnese/v2, /agendar, /portal). PADCON_SITE_URL é placeholder (data-bind), abre em nova aba.

## Definição de PRONTO
- Screenshots desktop + 2 larguras de celular mostram: símbolo chapado, brilho contido (painel navy preservado), rodapé PADCON com logo + link, abas Cliente + Colaborador visíveis.
- typecheck do pacote padcom sem erro nos arquivos tocados.
- architect aprova requisito por requisito.

## Linhas vermelhas
- NÃO tocar em rotas/motores de API.
- NÃO citar Instituto Pádua no site.
- Preservar identificadores técnicos (UID .ics, colunas, package, tokens).
- NÃO inventar rota inexistente.
- NÃO inflar replit.md.
