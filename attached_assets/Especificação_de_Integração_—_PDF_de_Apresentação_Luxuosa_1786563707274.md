# Especificação de Integração — PDF de Apresentação Luxuosa

**Projeto:** Protocolo Manager · Instituto Pádua  
**Objetivo:** Integrar um novo PDF de apresentação elegante e clássico para exibição ao paciente após o fechamento do protocolo  
**Status:** Especificação técnica + exemplo compilado  
**Data:** 20 de julho de 2026

---

## 1. Visão Geral

O novo **PDF de Apresentação Luxuosa** é um documento complementar ao protocolo clínico completo. Ele é exibido ao paciente como um sumário visual e acolhedor que resume os objetivos, a composição e a jornada esperada do tratamento.

### Características principais

- **Estética:** Clássica e luxuosa, com tipografia Libertinus Serif, paleta ouro/azul-marinho e layout simétrico
- **Conteúdo:** 4 páginas de apresentação visual e educativa
- **Dados:** Reutiliza o DTO já disponível na rota `/api/protocols/:id/document-pdf`
- **Integração:** Pode ser gerado como PDF separado ou anexado ao protocolo completo
- **Distribuição:** Segue o mesmo fluxo de download, Google Drive e e-mail

---

## 2. Estrutura do Documento

### Página 1: Capa
- Logo do Instituto Pádua em ouro sobre fundo azul-marinho
- Título "Protocolo Exclusivo"
- Nome do paciente
- Subtítulo "Paxter Clinical Intelligence"

### Página 2: Visão Geral
- Título "Sua Jornada de Cuidado"
- Resumo executivo com 3 métricas: número de substâncias, sessões, reavaliações
- Dois blocos laterais: "Focos de Atenção" e "Composição Selecionada"
- Cada substância tem um card com descrição breve

### Página 3: Radar e Integração
- Gráfico radar (SVG) com 7 dimensões de saúde
- Explicação visual: "quanto mais distante do centro, maior o foco"
- Tabela de integração mostrando como cada substância contribui a cada dimensão
- Card de transparência: "não é diagnóstico, não mede gravidade, não garante resultado"

### Página 4: Próximos Passos
- 4 marcos da jornada: Antes de Iniciar, Primeira Sessão, Acompanhamento, Reavaliação
- Citação inspiradora
- Rodapé com marca do Instituto

---

## 3. Dados Necessários (DTO)

O renderizador reusa o `ProtocolDocumentData` já disponível em `routes/protocols.ts`:

```typescript
interface PresentationData {
  protocol: {
    id: string;
    title: string;
    createdAt: Date;
  };
  patient: {
    name: string;
    email: string;
    dateOfBirth: Date;
  };
  professional: {
    name: string;
    crm: string;
  };
  substances: Array<{
    name: string;
    description: string;
    sessions: number;
    via: string;
    bodySystemEffects: Record<string, number>; // 0-5 scale
  }>;
  objectives: string[]; // "Energia", "Clareza Mental", "Imunidade", etc.
  radarDimensions: Array<{
    label: string;
    value: number; // 1=Apoio, 2=Foco, 3=Foco Principal
  }>;
}
```

---

## 4. Implementação Técnica

### Opção A: Renderizador Typst (Recomendado)

**Vantagens:**
- Tipografia profissional e controle fino de layout
- Fácil manutenção e versionamento
- Suporta SVG nativamente (para o radar)
- Código legível e modularizável

**Desvantagens:**
- Requer compilação Typst no servidor
- Tempo de compilação: ~2–3 segundos por documento

**Implementação:**

1. Criar arquivo `lib/pdf-generators/apresentacao-luxuosa.ts`
2. Função `generatePresentationPdf(data: PresentationData): Buffer`
3. Usar `typst-cli` via child_process para compilar template
4. Retornar PDF como Buffer

```typescript
import { spawn } from 'child_process';
import * as fs from 'fs';

export async function generatePresentationPdf(data: PresentationData): Promise<Buffer> {
  // 1. Serializar dados em JSON
  const dataJson = JSON.stringify(data);
  
  // 2. Escrever template Typst com dados interpolados
  const typstContent = generateTypstTemplate(data);
  fs.writeFileSync('/tmp/apresentacao.typ', typstContent);
  
  // 3. Compilar com typst
  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const proc = spawn('typst', ['compile', '/tmp/apresentacao.typ', '/tmp/apresentacao.pdf']);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(fs.readFileSync('/tmp/apresentacao.pdf'));
      } else {
        reject(new Error('Typst compilation failed'));
      }
    });
  });
  
  return pdf;
}
```

### Opção B: PDF-lib (Compatível com fluxo atual)

**Vantagens:**
- Usa a mesma biblioteca já presente no projeto
- Sem dependência externa de compilação
- Rápido

**Desvantagens:**
- Código mais verboso
- Menos controle tipográfico fino
- Difícil manter visual luxuoso

---

## 5. Integração na Rota

### Novo endpoint

```typescript
// GET /api/protocols/:id/presentation-pdf
app.get('/api/protocols/:id/presentation-pdf', async (req, res) => {
  const protocol = await db.protocol.findById(req.params.id);
  
  // Montar DTO
  const data = await mountPresentationData(protocol);
  
  // Gerar PDF
  const pdf = await generatePresentationPdf(data);
  
  // Retornar
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Apresentacao_${protocol.id}.pdf"`);
  res.send(pdf);
});
```

### Distribuição

Após gerar o PDF de apresentação:

1. **Download:** Disponibilizar via endpoint acima
2. **Google Drive:** Salvar em pasta `APRESENTACOES` do cliente
3. **E-mail:** Anexar ao e-mail de confirmação do protocolo (opcional)

---

## 6. Paleta de Cores (Referência)

| Elemento | Cor | Hex | Uso |
|---|---|---|---|
| Ouro principal | Libertinus Gold | `#D4AF37` | Destaques, linhas, títulos |
| Ouro escuro | Dark Gold | `#997A00` | Títulos secundários |
| Ouro claro | Light Gold | `#F9F6E8` | Fundos suaves |
| Azul-marinho | Navy | `#0B1D3A` | Capa, títulos principais |
| Carvão | Charcoal | `#1A1A1A` | Corpo de texto |
| Creme | Cream | `#FAF9F6` | Fundo padrão |
| Papel | White | `#FFFFFF` | Cards, blocos |
| Cinza | Gray | `#666666` | Texto secundário |
| Linha | Light Gray | `#E0E0E0` | Bordas, divisores |

---

## 7. Tipografia

- **Serif:** Libertinus Serif (títulos, cabeçalhos, citações)
- **Tamanho de corpo:** 11 pt
- **Tamanho de títulos:** 26 pt (capa), 14 pt (seções)
- **Espaçamento:** 1.2 em entre parágrafos, 0.8 em entre linhas
- **Justificação:** Sim (texto corrido)

---

## 8. Radar SVG

O radar é gerado via Python (matplotlib) e inserido como SVG no PDF:

```python
# Arquivo: scripts/gerar_radar_apresentacao.py
import matplotlib.pyplot as plt
import numpy as np

def generate_radar(dimensions: List[str], values: List[int]) -> str:
    """
    Gera SVG do radar com dimensões e valores.
    Valores: 1=Apoio, 2=Foco, 3=Foco Principal
    """
    # ... código matplotlib ...
    fig.savefig('radar.svg', format='svg')
    return 'radar.svg'
```

---

## 9. Fluxo de Geração

```
Paciente clica "Visualizar Apresentação"
        ↓
GET /api/protocols/:id/presentation-pdf
        ↓
Buscar protocolo + dados clínicos
        ↓
Montar DTO (PresentationData)
        ↓
generatePresentationPdf(data)
        ↓
Compilar template Typst com dados
        ↓
Retornar PDF ao navegador
        ↓
Opcionalmente: salvar no Drive, enviar por e-mail
```

---

## 10. Testes Recomendados

| Teste | Objetivo | Critério de aceite |
|---|---|---|
| Renderização | PDF compila sem erros | Sem exceções, arquivo > 50 KB |
| Dados | Todos os campos aparecem corretamente | Nome, substâncias, radar visível |
| Tipografia | Fontes são legíveis em diferentes visualizadores | Libertinus Serif renderiza em Adobe, Chrome, Firefox |
| Cores | Paleta ouro/azul-marinho é consistente | Sem degradação de cor em impressão |
| SVG | Radar renderiza corretamente | Gráfico visível, legível, sem artefatos |
| Performance | Geração é rápida | < 5 segundos por documento |
| Segurança | Dados sensíveis não vazam | Nenhum CPF, CRM ou dados clínicos em metadados |

---

## 11. Próximos Passos

1. **Validação visual:** Revisor de design aprova paleta, tipografia e layout
2. **Integração técnica:** Implementar endpoint e renderizador
3. **Testes:** Compilar com dados reais, validar em múltiplos visualizadores
4. **Distribuição:** Ativar fluxo de Drive e e-mail
5. **Feedback:** Coletar feedback de pacientes sobre clareza e estética

---

## 12. Arquivos Entregues

- `Apresentacao_Luxuosa_Protocolo.pdf` — Exemplo compilado (4 páginas)
- `prototype/document/apresentacao_luxuosa.typ` — Código-fonte Typst
- `scripts/gerar_radar_apresentacao.py` — Gerador de radar (se necessário customizar)
- `ESPECIFICACAO_INTEGRACAO_APRESENTACAO.md` — Este documento

---

## Referências

- **Typst Documentation:** https://typst.app/docs/
- **Libertinus Serif Font:** https://github.com/alerque/libertinus
- **PDF-lib:** https://pdfjs.distribution.apple.com/
- **Matplotlib Radar Charts:** https://matplotlib.org/stable/gallery/specialty_plots/radar_chart.html

---

**Fim da especificação.**

Para dúvidas técnicas ou customizações, consulte os arquivos de código-fonte.
