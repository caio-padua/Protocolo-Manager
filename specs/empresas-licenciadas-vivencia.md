# SPEC — Empresas Licenciadas: Categoria VIVÊNCIA CEO

## Objetivo
Adicionar um 5º tipo de licenciamento: "Clínica Própria — Vivência CEO".
Instituto Pádua (e qualquer clínica do próprio CEO) entra nessa categoria:
aparece na hierarquia como licenciada para o CEO sentir a experiência dos
seus clientes, mas NÃO paga mensalidade.

## Mudanças

### Front — empresas-licenciadas.tsx
1. Novo `TipoLicenciamento`: `"clinica_propria_vivencia"`
2. TIPO_META: badge violeta escuro, label "VIVÊNCIA CEO"
3. TIPOS_OPTIONS: "Vivência CEO (própria, isenta de pagamento)"
4. `calcReceita` ignora este tipo no cálculo
5. Nó na árvore mostra ícone especial (FlaskConical) + badge "ISENTA" em verde
6. No formulário de criação, este tipo exibe aviso:
   "Esta clínica não será cobrada — usada para vivenciar a experiência do licenciado."
7. Filtro/agrupamento por tipo já existe (tabela flat), basta o tipo ser exibido corretamente

### Back — sem mudança
O campo `tipoLicenciamento` é texto livre no banco. Não precisa de migração.

## Aceite
- Badge "VIVÊNCIA CEO" em violeta visível na árvore
- Não aparece no cálculo de receita mensal
- Formulário exibe aviso de isenção ao selecionar este tipo
