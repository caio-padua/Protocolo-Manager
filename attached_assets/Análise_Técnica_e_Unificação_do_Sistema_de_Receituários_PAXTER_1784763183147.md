# Análise Técnica e Unificação do Sistema de Receituários PAXTER

**Data:** 22/07/2026
**Autor:** Manus AI (Consultor de Arquitetura)
**Contexto:** Diagnóstico da fragmentação de motores de geração de PDFs no sistema Protocolo-Manager (Paxter) e especificação de testes para validação pelo Dr. Replit.

---

## 1. Diagnóstico do Problema

O sistema atual sofre de uma **fragmentação arquitetural severa** na geração de receituários. A LLM Dr. Replit está confusa porque existem múltiplas rotas e motores independentes, cada um com seu próprio estilo visual, fontes e lógica de layout. Além disso, a tela de "Modelo de Receituário" (ou Designer) não atua como fonte central da verdade para o backend.

### 1.1. Os 4 Motores Concorrentes

A análise do código-fonte em `artifacts/api-server/src/routes/` e `artifacts/api-server/src/lib/` revelou quatro fluxos de emissão distintos [1]:

| Motor | Rota de Origem | Arquivo de Implementação | Características Visuais |
|-------|----------------|--------------------------|-------------------------|
| **M1 (V1 Grid)** | `POST /receituario/gerar-demo` | `receituario-pdf.ts` (Método `generateReceituarioPdf`) | Layout simples, faixa azul marinho, tabela básica, sem arabescos. |
| **M2 (V2 ANVISA)** | `POST /receituario/emitir-prescricao` | `receituario-pdf.ts` (Método `generateReceituarioPdfV2`) | Layout complexo 4-boxes, faixas arábicas, assinatura ICP-Brasil completa. O backend reconstrói o HTML manualmente. |
| **M3 (Prescrições)** | `POST /prescriptions/emit` | `prescription-pdf.ts` (Método `generateRecipePdf`) | Layout estruturado, sem o padrão visual PAXTER, focado em roteamento de farmácias e numeração SNCR. |
| **M4 (Puppeteer)** | `POST /receituario/assinar-imagem-pdf` | Frontend usa `html2canvas` em `ReceituarioPreview.tsx` e envia PNG ao backend | Captura fiel do componente React, mas dependente da resolução da tela do cliente e propenso a erros de quebra de página. |

### 1.2. A Desconexão do "Modelo de Receituário"

A tela `/configuracoes/receituario` (ou Designer do Receituário) é projetada para ser o centro de controle visual. No entanto, o componente `receituario-config.ts` mostra que as configurações (cores, fontes, logos) são salvas **apenas no `localStorage` do navegador do usuário** [2].

O backend não tem acesso a essas configurações. Quando o motor M2 (V2 ANVISA) gera um PDF, ele usa constantes hardcoded (como cores PAXTER, fontes Georgia/Arial) em vez de ler as preferências salvas pelo médico na tela de configuração.

### 1.3. O Problema do Certificado Digital

O Dr. Replit também falha ao inserir o certificado digital corretamente. A causa raiz é uma divergência de dados:
- **No Frontend (`ReceituarioPreview.tsx`):** O bloco de certificado usa dados estáticos ou imagens base64 manuais (`certificadoQrDataUrl`) salvas no `localStorage` [3].
- **No Backend (`cert-source.ts`):** O sistema já possui a infraestrutura completa para ler o certificado real (arquivo `.pfx`), extraindo metadados dinamicamente (Nome do Titular, CPF, Autoridade Certificadora, Data de Validade) [4].
- **O Conflito:** O motor M2 tenta desenhar o bloco de certificado usando dados estáticos, enquanto o motor M4 (Puppeteer) tenta usar o componente React, mas o componente não recebe os metadados reais extraídos do backend.

---

## 2. Especificação da Solução (Motor Único)

Para resolver a confusão e criar um sistema à prova de erros ("meditação digital semântica blster"), a arquitetura deve ser unificada em torno de um **Motor Único Server-Side**.

### 2.1. Nova Arquitetura Proposta

1. **API de Modelos:** Criar rotas (`GET/POST /api/receituario-modelos`) para salvar o `ReceituarioConfig` no banco de dados, removendo a dependência do `localStorage`.
2. **Motor Canônico:** Criar `lib/receituario-motor.ts` contendo a função `emitirReceituarioPdf`. Esta função será o único ponto de entrada para geração de PDFs.
3. **Injeção de Dados:** O motor único deve:
   - Ler o modelo ativo do banco.
   - Ler os metadados do certificado real via `readCertMetaSync()`.
   - Renderizar o `ReceituarioPreview` (ou seu HTML equivalente) no servidor.
   - Usar Puppeteer para converter o HTML em PDF e assinar com o PFX.
4. **Eliminação de Motores Antigos:** As rotas antigas (M1, M2, M3, M4) devem ser refatoradas para chamar exclusivamente `emitirReceituarioPdf`.

---

## 3. Plano de Testes Determinísticos para o Dr. Replit

Para validar a unificação, o Dr. Replit deve implementar os seguintes testes automáticos e scripts de verificação no repositório.

### Teste 1: Paridade Visual (Preview vs. PDF)
O teste deve gerar um PDF usando o motor unificado e comparar pixel-a-pixel com o componente React renderizado no frontend.
- **Critério de Aceite:** Diferença visual zero entre o layout do `/configuracoes/receituario` e o PDF gerado.
- **Ponto de Verificação:** As fontes (Georgia/Arial), alturas dos boxes (116pt / 120pt) e cores (Navy `#16284a`, Cyan `#45B8CC`) devem ser idênticas.

### Teste 2: Injeção de Metadados do Certificado
O teste deve verificar se o bloco de certificado no PDF final contém os dados reais do arquivo `.pfx`.
- **Critério de Aceite:** O PDF deve conter o Nome Real, CPF Real, Nome da AC e Data de Validade extraídos via `node-forge`.
- **Ponto de Verificação:** A URL `https://validar.iti.gov.br/` deve estar presente como QR Code ou texto.

### Teste 3: Persistência de Modelo (Backend)
O teste deve salvar uma configuração customizada na API e verificar se o motor único a utiliza.
- **Critério de Aceite:** Alterar a cor da faixa ornamental na API e gerar um PDF; o PDF deve refletir a nova cor, ignorando qualquer fallback hardcoded.

---

## 4. Roteiro de Implementação para o Dr. Replit

1. **Fase 1 (Backend):** Implementar a persistência de `ReceituarioConfig` no banco de dados e criar o endpoint `/api/receituario-modelos`.
2. **Fase 2 (Integração):** Criar `lib/receituario-motor.ts` que injeta os dados do banco e do `cert-source.ts` no HTML do `ReceituarioPreview`.
3. **Fase 3 (Puppeteer):** Configurar a captura fiel do HTML server-side para PDF com assinatura PAdES.
4. **Fase 4 (Frontend):** Atualizar a tela de Prescrição (`/prescricao`) para remover o fluxo `html2canvas` e usar a nova rota unificada.

Esta abordagem garante que o sistema saia do estado atual de fragmentação (onde cada tela gera uma receita diferente) para um estado de governança total, onde o "Modelo de Receituários" dita a regra visual para todo o ecossistema PAXTER.

---
**Referências**
[1] `artifacts/api-server/src/routes/receituario.ts`
[2] `artifacts/padcom/src/lib/arabesques/receituario-config.ts`
[3] `artifacts/padcom/src/components/receituario/ReceituarioPreview.tsx`
[4] `artifacts/api-server/src/lib/cert-source.ts`
