# Especificação — PDF Detalhado de Substâncias

**Projeto:** Protocolo Manager · Instituto Pádua  
**Objetivo:** Documento educativo que explica cada item do protocolo em linguagem clara, com foco no paciente leigo  
**Status:** Exemplo compilado + especificação técnica  
**Data:** 20 de julho de 2026

---

## 1. Visão Geral

O **PDF Detalhado de Substâncias** é um complemento ao protocolo clínico que oferece uma explicação profunda e acessível sobre cada componente do tratamento. Diferentemente do resumo executivo, este documento dedica uma página completa a cada substância, respondendo sistematicamente às dúvidas do paciente.

### Características

- **Estética:** Clássica e luxuosa, paleta ouro/azul-marinho, tipografia Libertinus Serif
- **Estrutura:** Capa + introdução + 1 página por substância + página de compromisso
- **Linguagem:** Simples, verificável, sem promessas exageradas
- **Exemplos:** Vitamina D 600.000 UI IM e Metilcobalamina 2.500 mcg IM
- **Ressalvas:** Avisos de segurança explícitos em cada ficha

---

## 2. Estrutura do Documento

### Página 1: Capa
- Logo, título, nome do paciente, subtítulo "Guia Detalhado de Substâncias"

### Página 2: Introdução
- Explicação do propósito do documento
- 4 perguntas-chave respondidas em cada ficha
- Aviso importante: caráter educativo, não substitui consulta médica

### Página 3: Vitamina D3 (Colecalciferol)
- Dose: 600.000 UI
- Via: Intramuscular (IM)
- Explicação do papel clínico
- O que será acompanhado
- Segurança e contraindicações
- Quando avisar a equipe

### Página 4: Metilcobalamina
- Dose: 2.500 mcg
- Via: Intramuscular (IM)
- Explicação do papel clínico
- O que será acompanhado
- Segurança e contraindicações
- Quando avisar a equipe

### Página 5: Compromisso
- O papel da via injetável
- Importância do diálogo contínuo
- Citação inspiradora

---

## 3. Conteúdo de Cada Ficha

### Estrutura Padrão

Cada ficha de substância segue este padrão:

#### Seção 1: Identificação
```
Título: [Nome da Substância] ([Nome Técnico])
Subtítulo: Componente [Número]

Dose Prevista: [Valor] [Unidade]
Via de Administração: [Via]
Sessões: [Frequência/Cronograma]
```

#### Seção 2: Contexto Clínico
Explicação em 2–3 parágrafos sobre:
- O que é a substância
- Por que foi indicada especificamente
- Qual é o objetivo esperado

#### Seção 3: Acompanhamento
Descrição clara de como o sucesso será medido:
- Marcadores objetivos (exames, medidas)
- Sintomas subjetivos (como o paciente se sente)
- Cronograma de reavaliação

#### Seção 4: Segurança
Informações críticas sobre:
- Contraindicações específicas
- Quando procurar a equipe imediatamente
- Reações esperadas vs. reações que exigem atenção

---

## 4. Exemplo Prático: Vitamina D 600.000 UI IM

### Conteúdo da Ficha

**Identificação:**
- Dose: 600.000 UI (Unidades Internacionais)
- Via: Intramuscular
- Frequência: Conforme cronograma técnico (pode ser dose única de ataque ou fracionada)

**Contexto Clínico:**
A Vitamina D é um pró-hormônio essencial para a regulação do cálcio e do fósforo. A reposição injetável em altas doses é indicada para correção rápida de deficiências confirmadas por exames (dosagem de 25-OH-vitamina D), especialmente quando há dificuldade de absorção pela via oral.

**Acompanhamento:**
- Exame laboratorial: Nova dosagem de 25-OH-vitamina D entre 4–8 semanas
- Sintomas: Observação de fraqueza muscular, dores ósseas ou alterações de mobilidade
- Objetivo: Atingir níveis séricos adequados (geralmente 30–100 ng/mL, conforme protocolo)

**Segurança:**
- Contraindicações: Hipercalcemia, pedras nos rins, sarcoidose, doença renal grave
- Reações esperadas: Nenhuma reação local significativa
- Avisar a equipe: Náuseas, vômitos, fraqueza excessiva, confusão, polidipsia/poliúria

---

## 5. Exemplo Prático: Metilcobalamina 2.500 mcg IM

### Conteúdo da Ficha

**Identificação:**
- Dose: 2.500 mcg (microgramas)
- Via: Intramuscular
- Frequência: Conforme prescrição (ex: semanal durante período de ataque)

**Contexto Clínico:**
A Metilcobalamina é a forma ativa e biologicamente pronta da Vitamina B12. A via intramuscular garante absorção completa, contornando problemas digestivos. É indicada para corrigir deficiências, apoiar o sistema neurológico e auxiliar o metabolismo energético.

**Acompanhamento:**
- Disposição: Redução de fadiga ou cansaço inexplicável
- Sistema Neurológico: Melhora em formigamentos, sensibilidade, concentração
- Marcadores: Hemograma, dosagem de B12 conforme protocolo
- Cronograma: Reavaliação em 1–3 semanas (recuperação neurológica é gradual)

**Segurança:**
- Atenção especial: Alergias ao cobalto ou B12, Doença de Leber
- Reações esperadas: Geralmente bem tolerada
- Avisar a equipe: Reações locais, erupções cutâneas, coceira, desconforto respiratório

---

## 6. Dados Necessários (DTO)

```typescript
interface SubstanceDetailData {
  substance: {
    name: string;
    technicalName: string;
    dose: {
      value: number;
      unit: string; // "UI", "mcg", "mg", etc.
    };
    via: string; // "IM", "IV", "oral", etc.
    frequency: string; // "semanal", "mensal", etc.
    sessions: number;
  };
  clinical: {
    whatIs: string; // Explicação do que é
    whyIndicated: string; // Por que foi indicado
    expectedObjective: string; // Qual é o objetivo
  };
  monitoring: {
    objectiveMarkers: string[]; // Exames, medidas
    subjectiveSymptoms: string[]; // Como o paciente se sente
    timeline: string; // Quando reavaliar
  };
  safety: {
    contraindications: string[];
    expectedReactions: string[];
    whenToAlert: string[];
  };
}
```

---

## 7. Integração Técnica

### Novo Endpoint

```typescript
// GET /api/protocols/:id/substance-details-pdf
app.get('/api/protocols/:id/substance-details-pdf', async (req, res) => {
  const protocol = await db.protocol.findById(req.params.id);
  const substances = await db.substance.findByProtocolId(req.params.id);
  
  // Montar DTO para cada substância
  const data = substances.map(s => mountSubstanceDetailData(s));
  
  // Gerar PDF
  const pdf = await generateSubstanceDetailsPdf(data);
  
  // Retornar
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Substancias_${protocol.id}.pdf"`);
  res.send(pdf);
});
```

### Renderizador Typst

O renderizador utiliza um template modular que itera sobre as substâncias:

```typst
#for substance in substances {
  #pagebreak()
  #substance-detail-page(substance)
}
```

---

## 8. Paleta de Cores

| Elemento | Cor | Hex | Uso |
|---|---|---|---|
| Ouro | Primary | `#D4AF37` | Destaques, linhas |
| Azul-marinho | Navy | `#0B1D3A` | Títulos, cabeçalhos |
| Vermelho-alerta | Alert | `#B94E3F` | Avisos de segurança |
| Fundo alerta | Alert Soft | `#F9E7E3` | Cards de aviso |
| Creme | Cream | `#FAF9F6` | Fundo padrão |

---

## 9. Tipografia

- **Serif:** Libertinus Serif (títulos, corpo)
- **Tamanho de corpo:** 11.5 pt
- **Tamanho de títulos:** 26 pt (capa), 14 pt (seções)
- **Espaçamento:** 1.2 em entre parágrafos, 0.8 em entre linhas
- **Justificação:** Sim

---

## 10. Fluxo de Geração

```
Paciente clica "Entender Substâncias"
        ↓
GET /api/protocols/:id/substance-details-pdf
        ↓
Buscar protocolo + lista de substâncias
        ↓
Montar DTO para cada substância
        ↓
generateSubstanceDetailsPdf(substances)
        ↓
Compilar template Typst com iteração
        ↓
Retornar PDF ao navegador
```

---

## 11. Recomendações de Segurança

### Avisos Obrigatórios

Cada ficha deve incluir, em card de alerta:

1. **Aviso de caráter educativo:** "As informações a seguir têm caráter exclusivamente educativo. Elas não substituem a consulta médica, a avaliação individual ou a leitura da bula."

2. **Confirmação de dose:** "A dose apresentada é um exemplo demonstrativo. A prescrição final deve ser confirmada pelo profissional responsável."

3. **Contraindicações:** Listar sempre contraindicações conhecidas e instruir o paciente a informar a equipe.

4. **Quando avisar:** Deixar claro em que situações o paciente deve procurar a equipe antes da próxima sessão.

---

## 12. Testes Recomendados

| Teste | Objetivo | Critério |
|---|---|---|
| Renderização | PDF compila sem erros | Sem exceções, arquivo > 50 KB |
| Conteúdo | Todas as substâncias aparecem | Uma página por substância |
| Clareza | Linguagem é compreensível | Sem jargão técnico não explicado |
| Segurança | Avisos estão presentes | Cada ficha tem card de alerta |
| Tipografia | Legibilidade em múltiplos visualizadores | Libertinus Serif renderiza corretamente |
| Performance | Geração rápida | < 5 segundos por documento |

---

## 13. Próximos Passos

1. **Revisão clínica:** Médico responsável aprova conteúdo de cada ficha
2. **Revisão editorial:** Revisor de linguagem valida clareza e tom
3. **Testes:** Compilar com dados reais, validar em múltiplos visualizadores
4. **Integração:** Implementar endpoint e renderizador no Manager
5. **Deploy:** Ativar distribuição via download, Drive e e-mail

---

## 14. Arquivos Entregues

- `Apresentacao_Luxuosa_Substancias.pdf` — Exemplo compilado (5 páginas)
- `prototype/document/apresentacao_detalhada.typ` — Código-fonte Typst
- `ESPECIFICACAO_PDF_DETALHADO.md` — Este documento

---

**Fim da especificação.**

Este documento oferece um modelo educativo e seguro para explicar cada item do protocolo ao paciente. A implementação deve manter o tom acolhedor, a clareza técnica e as ressalvas de segurança em todas as versões.
