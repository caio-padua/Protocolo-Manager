---
name: Entrada do Licenciado — regras comerciais marteladas
description: Regras comerciais históricas e direcionamento de licença inicial com franquia e cobrança por consumo.
---

# Entrada do Licenciado (Visao de Desejo)

Regra: existem DUAS entradas nitidamente separadas, com logins distintos:
CEO (acesso total, opera o Instituto Padua) e licenciado (category
"licenciado", destino /licenciado), vitrine de módulos travados.

**Regras comerciais marteladas (CEO 27/07/2026):**
- Valor promocional de adesão vale 48 horas; depois sobe para o valor cheio.
- Indicação por outro licenciado = 10% de desconto SÓ NA ADESÃO; a mensalidade NUNCA muda.
- Tom: recorrência + escassez — "o sistema respira monetização para o CEO".
- Hoje só o CEO usa a entrada de licenciado (testa o próprio produto).
- Valores no catálogo (MODULOS em pages/licenciado/index.tsx) são placeholders; CEO ainda bate o martelo.

**Direcionamento informado em 29/10/2026:**
- O proprietário quer vender uma licença inicial para médicos e clínicas, com um teto e pagamento pelo uso de serviços, como prescrições e mensagens.
- Ainda não definiu se o teto é franquia incluída, limite financeiro ou limite de quantidade, nem como isso se concilia com a mensalidade histórica.
- O proprietário recorda ter contratado Railway para hospedar o controle de bilhetagem; contratação, plano e serviços ativos ainda precisam de verificação.
- Não tratar o consumo de infraestrutura da hospedagem como equivalente ao consumo comercial de cada clínica.

**Why:** decisão de negócio dita por voz; não é derivável do código (os números e o porquê das 48h/10% são contrato comercial, não técnica).
O direcionamento por consumo exige preservar o objetivo comercial sem inventar valores, franquias ou mudanças na mensalidade.

**How to apply:** qualquer onda futura de cobrança da adesão (Asaas), relógio das 48h persistido ou novos licenciados deve obedecer estas regras; o guard de tela cobre só o Layout admin — rotas públicas (/area, /agendar) continuam públicas por desenho.
