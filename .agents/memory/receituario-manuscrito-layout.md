---
name: Receituário — layout de campo manuscrito
description: Ordem correta dos elementos no FieldLine modo manuscrito (boxes 3 e 4 do receituário ANVISA)
---

# Layout do Campo Manuscrito

**Regra validada pelo CEO (22/07/2026):**

A ordem CORRETA é:
1. `<span style={{ borderBottom: "1px dashed #aaa", display: "block", minHeight: 14 }}/>`  ← linha PRIMEIRO
2. `<span style={{ ... }}>{label}</span>`  ← label ABAIXO

**Resultado visual:**
```
[14px espaço vazio — escrita à mão]
─ ─ ─ ─ ─ ─ ─ ─ ─   ← chão da escrita (borderBottom do span)
NOME                  ← label identificador (abaixo da linha)
```

**Por quê:**
Formulários médicos de controle especial (ANVISA) têm o underline (chão) com o label ABAIXO identificando o campo. O usuário escreve ACIMA da linha, e o label abaixo diz o que foi escrito. Inverter (label em cima, linha embaixo) cria ilusão ótica nos campos consecutivos onde a linha do campo anterior aparece "em cima" do próximo label.

**Como aplicar:**
Em todo `FieldLine` com `manuscrito={true}` — a linha borderBottom vai NO SPAN SUPERIOR, o label vai NO SPAN INFERIOR. Nunca inverter.

**Armadilha:**
A prop `manuscrito` existe no tipo `CampoField` e nos dados (compradorRows/fornecedorRows), MAS o `IdentBoxV2` por muito tempo NÃO passava o prop para `FieldLine`. Sempre verificar que ambas as chamadas de `FieldLine` dentro do loop de `IdentBoxV2` incluem `manuscrito={field.manuscrito}` e `manuscrito={row.manuscrito}`.
