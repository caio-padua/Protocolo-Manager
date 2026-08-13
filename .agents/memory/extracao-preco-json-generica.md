---
name: Extração genérica de preço em JSON de schema incerto
description: Como extrair um valor (preço) de um payload de terceiro cujo formato exato não é garantido nem documentado com confiança.
---

# Extrair preço sem confiar no schema do dataset de terceiro

Quando o formato exato de retorno de um serviço de terceiro (actor de scraping,
API pouco documentada) não pode ser confirmado com certeza antes de rodar de
verdade, não vale a pena escrever um parser que assume campos fixos
(`item.price`, `item.value`) — quebra silenciosamente assim que o formato real
difere um pouco do esperado.

**Padrão adotado:** percorrer recursivamente TODO o JSON retornado (qualquer
profundidade, qualquer chave), aplicar regex de moeda (`R$ ...`) em cada valor
string encontrado, converter número no formato BR (vírgula=decimal,
ponto=milhar), aplicar limites de sanidade (ex.: R$0,01–R$100.000) para
descartar lixo, tentar associar um campo-irmão de URL no mesmo objeto como
"fonte", remover duplicatas (mesmo preço+contexto) e tirar a média dos valores
plausíveis restantes.

**Why:** resiliente à incerteza real sobre o formato de saída de um actor do
Apify (a documentação de terceiro nem sempre reflete o schema atual) — extrai
o valor de qualquer estrutura que contenha o preço em algum texto, em vez de
acoplar a um schema específico nunca validado contra a API real.

**How to apply:** se nenhum preço plausível for encontrado, retornar `null`
explicitamente (nunca inventar um resultado) — o chamador transforma isso em
status `erro` visível para o usuário, nunca um sucesso fabricado.

Ref.: `extractPrecoInsumoResultado` em `artifacts/api-server/src/lib/apify.ts`
(Central de Pesquisa, Task 235).
