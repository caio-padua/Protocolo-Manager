# Spec — Receituário Designer v2
**Data:** 20/07/2026  
**CEO:** Dr. Caio  
**Agente:** Dr. Replit Paxter  
**Referência visual:** `attached_assets/image_1784573334978.png` + `image_1784573351616.png` (PDF PARXIS demo)

---

## Objetivo

Expandir a tela `/configuracoes/receituario` em um **designer completo do receituário médico** com:
- Configuração visual de TODOS os elementos (cabeçalho, faixas, corpo, assinatura, certificado, rodapé)
- Preview ao vivo sincronizado (data-bind em tempo real, elemento por elemento)
- Geração de PDF imprimível fiel ao preview (via `window.print()` + CSS de impressão dedicado)

---

## Requisitos Exatos (15 Pedidos + 3 Kaizen)

### PEDIDO 1 — Upload do logo PARXIS/PARXIS (não é fixo)
- R1.1 O logo do sistema (PARXIS / PAXTER) NO RODAPÉ DIREITO deve ter CAMPO DE UPLOAD (PNG/SVG, máx 2 MB)
- R1.2 Se não houver upload, cai no fallback: imagem padrão `public/brand/paxter-symbol.png`
- R1.3 O logo do sistema convive com: nome editável (R5) + subtítulo editável (ex-Pedido 7c)

### PEDIDO 2 — Posições dos campos internos dos boxes (layout fixo documentado)
- R2.1 Para cada um dos 4 boxes (Emitente, Paciente, Comprador, Fornecedor), definir em QUAL ORDEM os campos aparecem dentro do cartão
- R2.2 Os campos são arrastáveis (drag-reorder via lista simples de up/down) OU editáveis por texto (separados por vírgula, já implementado) — opção texto basta; drag é Kaizen futuro
- R2.3 O preview deve refletir a ordem dos campos em tempo real
- R2.4 Cada campo exibido no preview aparece com uma linha pontilhada como placeholder do valor real

### PEDIDO 3 — Campos e posições do rodapé inferior (abaixo da faixa de comprador/fornecedor)
- R3.1 Rodapé inferior: linha 1 = endereço completo, linha 2 = telefone/e-mail, linha 3 = tipo do documento (ex: "DOCUMENTO DEMONSTRATIVO - SEM VALIDADE")
- R3.2 Cada linha tem campo de texto editável + aparece no preview
- R3.3 O rodapé inferior fica ABAIXO da faixa de Comprador/Fornecedor (diferente do rodapé já existente no topo das faixas)

### PEDIDO 4 — Preview mostrando logo da clínica + logo PARXIS/PARXIS
- R4.1 Logo da clínica: aparece no canto superior esquerdo do cabeçalho (já existe upload de logo, verificar posição)
- R4.2 Logo do sistema (PARXIS): aparece no rodapé direito ao lado do nome e subtítulo
- R4.3 Ambos os logos aparecem no preview ao vivo imediatamente após upload
- R4.4 O preview escala para caber na coluna direita (scale ~0.55 para folha A4 de 794px de largura)

### PEDIDO 5 — Nome PARXIS: entrada dupla (imagem + texto)
- R5.1 Campo MODO: toggle "Imagem" | "Texto"
  - Modo Imagem: upload de PNG/SVG da wordmark do nome (ex: arte PARXIS) + fallback `public/brand/paxter-wordmark.png`
  - Modo Texto: campo de texto livre, formatado em uppercase bold gold
- R5.2 O preview reflete o modo ativo em tempo real
- R5.3 Padrão: Modo Imagem com `public/brand/paxter-wordmark.png`

### PEDIDO 6 — Nome da clínica: entrada dupla (imagem + texto)
- R6.1 Campo MODO: toggle "Imagem" | "Texto"
  - Modo Imagem: upload de PNG/SVG do nome/wordmark da clínica
  - Modo Texto: campo de texto livre
- R6.2 O preview usa o modo ativo em tempo real no CABEÇALHO (posição: linha do nome da clínica)
- R6.3 Padrão: Modo Texto com o texto já configurado

### PEDIDO 7 — Preview completo e em tempo real de TODOS os elementos
- R7.1 O preview mostra o layout completo do receituário em escala (~0.55 do A4)
- R7.2 Cada campo editado na esquerda reflete no preview em tempo real (sem botão "atualizar")
- R7.3 O preview deve incluir (em ordem de cima para baixo):
  1. Cabeçalho: logo clínica + nome/wordmark clínica + subtítulo + linha decorativa direita (RCE/vias)
  2. Linha divisória estilizada
  3. Título central: "RECEITUÁRIO DE CONTROLE ESPECIAL" + subtítulo (editável)
  4. Faixa ornamental superior (Emitente + Paciente) com boxes
  5. Corpo: "Prescrevo:" + 2 fórmulas demo numeradas
  6. Área de assinatura (esquerda) + bloco de certificado digital (direita)
  7. Faixa ornamental inferior (Comprador + Fornecedor) com boxes
  8. Rodapé: esquerda = endereço/dados, direita = logo sistema + nome + subtítulo

### PEDIDO 8 — Imprimir / Download PDF
- R8.1 Botão "Imprimir / PDF" no topo da tela (ao lado de "Salvar tudo")
- R8.2 Ao clicar: abre um `window.print()` com o CSS `@media print` que esconde tudo exceto o preview
- R8.3 O preview de impressão usa escala 1:1 (A4, 794px × 1123px) sem o scale do preview da tela
- R8.4 Instruções inline: "No diálogo de impressão, escolha 'Salvar como PDF' para gerar o arquivo"
- R8.5 A página de impressão NÃO tem margens extras do navegador (usar `@page { margin: 0 }`)

### PEDIDO 9 — Fontes do corpo do receituário
- R9.1 Campo "Fonte do título da fórmula" (ex: nome do medicamento) — select com 5 opções:
  - Georgia / Times New Roman / Garamond / Arial / Inter
- R9.2 Campo "Fonte do corpo da fórmula" (posologia, campos de detalhe) — mesmo select
- R9.3 As fontes aparecem aplicadas no preview em tempo real
- R9.4 Todas as fontes são fontes do sistema (sem Google Fonts para evitar dependência)

### PEDIDO 10 — Numeração automática das fórmulas
- R10.1 Cada fórmula no corpo é numerada automaticamente: 01, 02, 03...
- R10.2 A numeração aparece no preview como demostração
- R10.3 O número é bold, alinhado à esquerda, antes do nome da fórmula (ex: "01  MEDICAMENTO A...")

### PEDIDO 11 — Posição da assinatura (data bind do cadastro do médico)
- R11.1 A área de assinatura fica no corpo, APÓS as fórmulas e ANTES da faixa inferior
- R11.2 Exibe: imagem da assinatura cursiva (if available) + nome completo + CRM + RQE + cidade + data
- R11.3 Na configuração: campo para definir se a assinatura vem do "cadastro do médico" (data bind) ou é uma imagem fixa (upload)
- R11.4 No preview demo: mostra "Assinatura" em cursive italic + dados fictícios

### PEDIDO 12 — Bloco de certificado digital
- R12.1 O bloco de certificado fica à DIREITA da assinatura (layout 2 colunas)
- R12.2 Exibe: título "DOCUMENTO ASSINADO ELETRONICAMENTE" + campos: Assinante, Certificado, Assinado em, Verificação
- R12.3 Campo de upload do LOGO/QR CODE do certificado (à direita dos textos)
- R12.4 Toggle: "Mostrar bloco de certificado" sim/não
- R12.5 No preview: exibe o bloco com dados fictícios + placeholder do QR

---

### KAIZEN A — Formato dos boxes configurável (como as faixas)
- KA.1 Além do título e dos campos, o operador pode configurar: largura relativa do box (50%/50%, 40%/60%, 60%/40%), altura do box, espessura da borda
- KA.2 Configuração per-box, aparece no preview

### KAIZEN B — Faixinha decorativa à esquerda
- KB.1 Opção de adicionar uma borda/faixa decorativa vertical à esquerda de cada box (cor editável, largura 3px)
- KB.2 Toggle: mostrar/ocultar

### KAIZEN C — Linha estilizada entre elementos
- KC.1 Linha decorativa entre "Nome da clínica" e "Receituário de Controle Especial" — estilo: simples / dupla / ornamentada
- KC.2 Linha decorativa entre o título e os boxes superiores — mesmo set de estilos
- KC.3 Campo select para escolher o estilo de linha; aparece no preview

---

## Arquitetura da Solução

### Onde mora o código
```
artifacts/padcom/src/
  lib/arabesques/
    receituario-config.ts       ← EXPANDIR com todos os novos campos
    ArabesqueBand.tsx           ← SEM mudança (já suporta custom)
    models.ts                   ← SEM mudança
  pages/configuracoes/
    receituario.tsx             ← REESCREVER com todos os 15 pedidos
  components/receituario/
    ReceituarioPreview.tsx      ← NOVO: componente de preview completo
    PrintableReceita.tsx        ← NOVO: versão 1:1 para impressão (mesmos dados, sem scale)
```

### Geração de PDF (Pedido 8)
```
Operador clica "Imprimir / PDF"
  → useReactToPrint (ou window.print) dispara
  → CSS @media print esconde sidebar, config panel, header da tela
  → Exibe PrintableReceita em tamanho A4 real (794×1123px)
  → Navegador gera PDF via "Salvar como PDF"
```

### Persistência (Pedido 8 / config)
- Todos os campos em `localStorage("paxter:receituario-config")`
- Logos e imagens: base64 no mesmo objeto
- Sem chamada de API para salvar config (client-side only)

---

## Tipo ReceituarioConfig expandido (v2)

```typescript
type ReceituarioConfig = {
  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  cabecalhoLogoDataUrl?: string;         // logo clínica (base64)
  cabecalhoNomeModo: "texto" | "imagem"; // Pedido 6
  cabecalhoNomeImagemDataUrl?: string;   // wordmark da clínica (base64)
  cabecalhoNome: string;                 // texto
  cabecalhoTitulo: string;               // subtítulo linha 1
  cabecalhoSubtitulo: string;            // subtítulo linha 2
  cabecalhoRceNumero: string;            // "RCE: 2024" (editável)
  cabecalhoVias: string;                 // "1ª via Farmácia — 2ª via Paciente"
  tituloDocumento: string;               // "RECEITUÁRIO DE CONTROLE ESPECIAL"
  tituloSubtitulo: string;               // "MODELO DEMONSTRATIVO - SEM VALIDADE"
  linhaEstiloCabecalho: "simples"|"dupla"|"ornamentada"; // Kaizen C

  // ── Boxes ──────────────────────────────────────────────────────────────────
  boxPacienteTitulo: string;
  boxPacienteCampos: string;             // vírgula separados
  boxMedicoTitulo: string;
  boxMedicoCampos: string;
  boxCompradorTitulo: string;
  boxCompradorCampos: string;
  boxFarmaciaTitulo: string;
  boxFarmaciaCampos: string;
  boxSplitRatio: "50/50" | "40/60" | "60/40"; // Kaizen A
  boxBorderWidth: number;                // 1–3 px, Kaizen A
  boxFaixinhaEsquerda: boolean;          // Kaizen B
  boxFaixinhaCor: string;                // hex, Kaizen B

  // ── Corpo / Fórmulas ───────────────────────────────────────────────────────
  corpoFonteTitulo: string;              // "Georgia" | "Times New Roman" | ...
  corpoFonteCorpo: string;

  // ── Assinatura ─────────────────────────────────────────────────────────────
  assinaturaDataUrl?: string;            // imagem da assinatura cursiva
  assinaturaModo: "databind" | "imagem"; // Pedido 11
  assinaturaTextoFallback: string;       // nome cursivo texto se não houver imagem

  // ── Certificado digital ────────────────────────────────────────────────────
  certificadoMostrar: boolean;           // Pedido 12
  certificadoQrDataUrl?: string;         // QR code ou logo (base64)
  certificadoLogoDataUrl?: string;       // logo do certificador (à direita)

  // ── Rodapé direito — sistema ────────────────────────────────────────────────
  rodapeSistemaModo: "texto" | "imagem"; // Pedido 5
  rodapeSistemaImagemDataUrl?: string;   // wordmark PARXIS (base64)
  rodapeSistemaLogoDataUrl?: string;     // símbolo/ícone (upload, Pedido 1)
  rodapePaxterNome: string;              // texto fallback
  rodapePaxterSubtitulo: string;

  // ── Rodapé esquerdo ────────────────────────────────────────────────────────
  rodapeEndereco: string;
  rodapeDados: string;
  rodapeDados2: string;
  rodapeDados3: string;

  // ── Faixas customizadas ────────────────────────────────────────────────────
  customBands: CustomBand[];
};
```

---

## Definição de PRONTO

| Critério | Como conferir |
|---|---|
| P1 — Upload logo PARXIS | Fazer upload de PNG → aparece no preview no lugar do ícone padrão |
| P2 — Campos dos boxes | Alterar campos de texto → preview reflete nova ordem/lista |
| P3 — Rodapé inferior | Editar linhas 1/2/3 → aparecem abaixo da faixa de Comprador/Fornecedor |
| P4 — Preview completo | Screenshot mostra logo clínica (topo esq) + logo PARXIS (rodapé dir) |
| P5 — Nome PARXIS duplo | Toggle Imagem→Texto→Imagem funciona; preview alterna |
| P6 — Nome clínica duplo | Idem para o nome da clínica no cabeçalho |
| P7 — Todos no preview | Preview tem os 8 blocos do layout; qualquer mudança = preview atualiza |
| P8 — Print/PDF | Clicar "Imprimir / PDF" → diálogo do navegador abre com layout A4 correto |
| P9 — Fontes do corpo | Mudar fonte → preview atualiza fonte do nome da fórmula |
| P10 — Numeração | Preview mostra "01", "02" antes de cada fórmula demo |
| P11 — Assinatura | Preview mostra área de assinatura (cursiva demo + dados) |
| P12 — Certificado | Toggle "Mostrar" → bloco aparece à direita da assinatura |
| KA — Box format | Mudar splitRatio → preview ajusta largura dos 2 cartões |
| KB — Faixinha | Toggle → faixa colorida aparece à esquerda de cada box |
| KC — Linha estilizada | Mudar estilo → linha entre título e faixa altera |

---

## Linhas Vermelhas (o que NÃO tocar)

- NÃO alterar `ArabesqueBand.tsx` (motor de faixas já funciona)
- NÃO alterar `models.ts` (catálogo de faixas)
- NÃO tocar rotas da API (PDF é client-side via print)
- NÃO apagar campos já existentes em `ReceituarioConfig`; só ADICIONAR
- NÃO quebrar o seletor de faixas já funcional na seção "Faixa Ornamental Ativa"
