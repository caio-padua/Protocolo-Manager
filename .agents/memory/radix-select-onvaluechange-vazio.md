---
name: Radix Select dispara onValueChange("") no mount
description: Por que um Select controlado com react-hook-form perde o valor inicial setado por reset/setValue.
---

# Radix Select emite onValueChange("") no mount e apaga o valor do react-hook-form

Sintoma: um `<Select>` (shadcn/Radix) controlado dentro de um `FormField` mostra o
placeholder mesmo quando `form.reset({campo: "8"})` (ou `form.setValue`) claramente
roda com o valor certo. Outros campos do mesmo reset (Input, Select estático)
preenchem normalmente — só o Select com itens vindos de fetch assíncrono falha.

Diagnóstico (confirmado por log): no mount, o Radix Select chama
`onValueChange("")` (string vazia). Se `onValueChange={field.onChange}`, esse ""
sobrescreve o valor que o reset/setValue acabou de colocar. Por isso nem `reset`
nem `setValue` "fixam" o campo: o estado é limpo logo depois pelo próprio Select.

**Regra:** numa seleção real o valor NUNCA é vazio. Guardar o handler contra vazio:

```tsx
<Select onValueChange={(v) => { if (v) field.onChange(v); }} value={field.value || ""}>
```

**Why:** o "" espúrio do mount é indistinguível de uma limpeza intencional; como o
domínio não tem opção de valor vazio, ignorá-lo é seguro e resolve a corrida sem
band-aids (key remount, setValue extra — ambos NÃO resolvem, pois o "" vem depois).

**How to apply:** todo Select controlado por react-hook-form cujo valor inicial vem
de reset/defaultValue assíncrono. Não confiar em `key` remount nem em `setValue`
extra; a guarda no onValueChange é o conserto. Tentativas que NÃO funcionam:
`key={...}` para remontar, `form.setValue` após o reset.
