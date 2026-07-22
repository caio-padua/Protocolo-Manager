# Briefing Técnico: Unificação do Motor de Receituários (Paxter)

**Para:** Dr. Replit (Executor)
**De:** Manus (Consultor de Arquitetura)
**Data:** 22/07/2026
**Assunto:** Correção da fragmentação de motores de emissão de receituário

---

## 1. O Problema Central (Diagnóstico)

Atualmente, o sistema **Paxter** possui **quatro motores diferentes** gerando PDFs de receituário. Isso explica perfeitamente por que o Dr. Replit (a LLM) está confuso ao tentar gerar receitas: cada vez que uma tela diferente chama uma rota diferente, o layout, a fonte e o tamanho do documento mudam drasticamente. Além disso, a tela "Modelo de Receituário" (ou Designer) não está conectada ao backend como a fonte da verdade.

### Os 4 Motores Atuais:
1. **Motor M1 (V1 Grid):** Usado na rota `POST /api/receituario/gerar-demo`. Gera um PDF simples via `pdf-lib`.
2. **Motor M2 (V2 ANVISA 4-boxes):** Usado na rota `POST /api/receituario/emitir-prescricao`. Gera um PDF complexo, mas **reconstrói o layout manualmente** no backend em vez de usar o modelo visual do frontend.
3. **Motor M3 (Prescrições Estruturadas):** Usado na rota `POST /api/prescriptions/emit`. Gera um PDF completamente diferente (sem arabescos, sem o layout PAXTER clássico) via `lib/prescription-pdf.ts`.
4. **Motor M4 (Puppeteer/Captura):** Usado na rota `POST /api/receituario/assinar-imagem-pdf` e `emitir-cliente`. Este motor tenta capturar o componente React `ReceituarioPreview.tsx` convertendo-o em PNG via `html2canvas` no frontend, enviando para o backend assinar.

**O Bug da Assinatura:** O certificado digital real (PFX) fica armazenado no backend (`lib/cert-source.ts`). A tela frontend "Modelo de Receituário" trata o QR Code e o logo do certificado como uploads de imagem manuais (base64 no `localStorage`), o que faz com que o certificado real do ICP-Brasil não apareça corretamente no preview nem nos PDFs gerados pelos motores que não usam o `cert-source.ts`.

---

## 2. A Solução Proposta (Especificação)

Para resolver a confusão da LLM e unificar o sistema, precisamos seguir as diretrizes do documento `specs/receituario-unificado-*.md` com a seguinte abordagem técnica estrita:

### Passo 1: Criar o Motor Único no Backend (`lib/receituario-motor.ts`)
Devemos criar uma função canônica única chamada `emitirReceituarioPdf`. Esta função deve:
1. Receber os dados da receita (paciente, médico, fórmulas, tipo de receita).
2. Buscar o **modelo ativo** no banco de dados (não no `localStorage` do frontend).
3. Usar o motor **Puppeteer (Opção A)** para renderizar o PDF. O Puppeteer deve capturar uma versão server-side do `ReceituarioPreview.tsx` (ou um HTML idêntico ao dele) injetando os dados e o modelo ativo.
4. Assinar o PDF gerado usando o certificado real extraído via `readCertMetaSync()` do arquivo `cert-source.ts`.

### Passo 2: Unificar as Rotas (`routes/receituario.ts` e `routes/prescriptions.ts`)
Todas as rotas de emissão (emitir-prescricao, emitir-cliente, prescriptions/emit) devem ser alteradas para chamar APENAS a função `emitirReceituarioPdf`. 
- A rota `prescriptions/emit` (M3) deve parar de usar `generateRecipePdf` e começar a usar o motor unificado.
- A rota `assinar-imagem-pdf` (M4) deve ser descontinuada, pois o motor único fará a captura server-side, eliminando a dependência do `html2canvas` do frontend.

### Passo 3: Conectar a Tela "Modelo de Receituário" ao Backend
A tela `/configuracoes/receituario` (ou `/modelo-receituario`) atualmente salva a configuração apenas no `localStorage` do navegador. 
- Devemos criar as rotas `GET /api/receituario-modelos` e `POST /api/receituario-modelos` para salvar essas configurações no banco de dados.
- A tela deve passar o ID do modelo a ser usado na chamada do motor único.

### Passo 4: Ajustar o Bloco de Certificado
O componente `BlocoCertificado` no frontend (`ReceituarioPreview.tsx`) deve parar de usar `cfg.certificadoQrDataUrl` (upload manual) e passar a usar os metadados reais do certificado (`certMeta`) que o backend injeta na renderização do HTML. O backend já possui a função `readCertMetaSync()` que extrai o nome, CPF, AC, serial e validade do PFX real.

---

## 3. Instruções para o Dr. Replit (Tarefas de Implementação)

Dr. Replit, por favor, execute as seguintes modificações no código para destravar o sistema:

1. **Desative o html2canvas:** Na tela `/prescricao`, remova o fluxo de `handleGerarReceituario` que usa `html2canvas` e envia o PNG para `/api/receituario/assinar-imagem-pdf`. Substitua por uma chamada direta para `/api/receituario/emitir-prescricao` (ou o novo endpoint unificado).
2. **Crie a API de Modelos:** Implemente as rotas para ler e salvar o `ReceituarioConfig` no banco de dados, para que o motor único possa acessá-lo.
3. **Injete o Certificado Real:** Na geração do HTML que será capturado pelo Puppeteer, leia o `readCertMetaSync()` e injete os dados reais (Assinante, CPF, AC, Validade) no bloco de certificado, substituindo os placeholders "NOME DO MÉDICO" e "00/00/0000".
4. **Garanta a Paridade Visual:** Certifique-se de que o HTML renderizado no servidor pelo Puppeteer usa exatamente as mesmas classes CSS e fontes que o `ReceituarioPreview.tsx` renderizado no navegador, evitando assim que fontes e alturas mudem entre as emissões.

Esta unificação garantirá que qualquer tela (Prescrição, Automático, Cockpit) gere um PDF com o layout idêntico ao que o médico visualiza na tela de "Modelo de Receituários".
