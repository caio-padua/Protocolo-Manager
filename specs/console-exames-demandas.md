# Console de Exames — Lista de Demandas (origem: caso Frutosamina)

Origem: pedido do CEO Dr. Caio em 13/07/2026, a partir do caso real da FRUTOSAMINA
(exame descoberto pela ferramenta, mas sem como cadastrar unidade/faixas e sem ver a origem).

Método: cada demanda roda em um Paxter Loop próprio (spec própria em `specs/<nome>.md` →
construir → revisar com architect até aprovar). Execução 1 a 1, na ordem abaixo.

---

## DEMANDA 1 — Cadastro clínico do exame recém-descoberto (unidade + faixas) no card de triagem

Problema verificado no código: o backend calcula `quantitativo = (units.length > 0 || zones.length > 0)`.
Um exame descoberto que ainda não tem NENHUMA unidade nem faixa nasce `quantitativo:false`, e a tela
esconde os dois editores ("Exame não quantitativo — sem unidade/faixas"). Resultado: não há como
cadastrar a PRIMEIRA unidade nem a PRIMEIRA faixa. Ovo e galinha.

Requisitos:
1.1 Permitir revelar os editores de unidade e de faixa mesmo quando o exame ainda não tem nenhuma.
1.2 Cadastrar a unidade padrão (canônica).
1.3 Cadastrar a lista de unidades aceitas com fator de conversão.
1.4 Cadastrar os nomes (rótulos) das faixas e os valores (mínimo/máximo).
1.5 Salvar reusando os endpoints existentes (`PUT /catalogo-faixas/unidades` e `PUT /faixas`), sem tocar o motor.

Status: CONCLUÍDA em 13/07/2026 (spec em specs/exame-descoberto-quantitativo.md; architect PASS).

---

## DEMANDA 2 — Procedência da sugestão (de onde veio a grafia) + download do arquivo

Problema: quando o sistema sugere um exame, não dá para ver de qual paciente e de qual arquivo (laudo
PDF/imagem) veio aquela grafia, nem abrir o original para conferir.

Requisitos:
2.1 Abaixo do item pendente, mostrar o(s) nome(s) do(s) paciente(s) e o arquivo (laudo) onde a grafia apareceu.
2.2 Botão para ABRIR/BAIXAR o arquivo original (PDF/imagem) para conferência.
2.3 Mostrar a data do laudo e o valor bruto detectado quando houver.
2.4 Novo endpoint de procedência ligando a grafia (normKey) → `exam_results` → `exam_documents`.

Status: A ESPECIFICAR (segundo do loop).

---

## Ordem de execução

1. Demanda 1 (destrava o cadastro clínico do exame).
2. Demanda 2 (rastreabilidade / conferência da origem).
