# Spec P6 — Upload de Faixas para o Último Bloco

**Data:** 20/07/2026

## Situação atual
Ordem atual dos accordions:
1. Upload de Faixa Ornamental Personalizada (P3/P1) ← PRIMEIRO
2. Faixa Ornamental Ativa (catálogo)
3. Cabeçalho da Receita
4. Campos Internos dos Boxes (P2)
5. Fontes do Corpo (P9-P10)
6. Assinatura do Médico (P11)
7. Bloco do Certificado Digital (P12)
8. Rodapé — Dados da Clínica (P3)
9. Rodapé — Marca do Sistema (P1-P5)

## Ordem desejada
1. Faixa Ornamental Ativa (catálogo) ← sobe para 1º
2. Cabeçalho da Receita
3. Campos Internos dos Boxes (P2)
4. Fontes do Corpo (P9-P10)
5. Assinatura do Médico (P11)
6. Bloco do Certificado Digital (P12)
7. Rodapé — Dados da Clínica (P3)
8. Rodapé — Marca do Sistema (P1-P5)
9. Upload de Faixa Ornamental Personalizada ← ÚLTIMO

## Implementação
Apenas reordenar os blocos JSX na coluna esquerda. Nenhuma lógica muda.
