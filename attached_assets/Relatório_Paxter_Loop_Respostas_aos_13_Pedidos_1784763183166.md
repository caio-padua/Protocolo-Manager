# Relatório Paxter Loop: Respostas aos 13 Pedidos

**Data:** 22/07/2026
**Autor:** Manus AI (Engenheiro de Sistemas)
**Contexto:** Análise do sistema de receitas PAXTER e respostas aos pedidos do CEO (Dr. Caio Padua).

---

## Pedido 1: Comparação (Entregue vs. Motor de geração)
**Resposta:** O que foi entregue anteriormente (specs e cartas) é um **projeto de arquitetura**, mas **não é código**. Os motores atuais (M1, M2, M3, M4) são códigos reais que já estão no backend e geram PDFs com layouts completamente diferentes entre si. O Dr. Replit mapeou o problema, mas não construiu o motor único ainda.

## Pedido 2: Por que quero motor e preview idênticos?
**Resposta:** Exatamente. A arquitetura correta é: o **Motor deve capturar o Preview**. Hoje, apenas o Motor M4 (Puppeteer) faz isso parcialmente (ele tira uma "foto" do HTML e coloco no PDF). Os outros motores (M1, M2, M3) ignoram o preview e desenham o PDF do zero no backend, por isso saem "tortos e errados" em comparação com o que o médico vê na tela.

## Pedido 3: Por que o sistema se perdeu (Detalhamento dos Equívocos)
**Resposta:** O sistema se perdeu porque foram criadas várias telas e botões em momentos diferentes, sem uma regra central.
1. **Equívoco 1:** Criou-se a tela "Faixa de Receituário" (`/configuracoes/receituario`) para configurar o layout, mas ela salva as preferências no `localStorage` do navegador. O backend **não consegue ler** o `localStorage`.
2. **Equívoco 2:** Foram adicionados botões em telas diferentes (Cockpit, Prescrição, Automático). Cada botão foi programado para chamar uma rota de API diferente (`assinar-imagem-pdf`, `emitir-prescricao`, `prescriptions/emit`).
3. **Equívoco 3:** Como cada rota chama uma função diferente no backend (`receituario-pdf.ts` vs `prescription-pdf.ts`), cada botão gera um PDF com regras visuais diferentes, ignorando as configurações salvas pelo médico.

## Pedido 4: A receita navy/gold do Cockpit de Consulta
**Resposta:** Esse PDF específico foi gerado pelo **Motor M4 (Puppeteer)**. O painel `PrescricaoFormulasPanel.tsx` (ou a tela de Cockpit direto) usa o componente `html2canvas` para tirar um "print" exato do que está na tela do médico e envia para o backend apenas assinar. Por isso ele sai bonito, navy/gold e com o Instituto Pádua em dourado.

## Pedido 5: O outro modelo gerado na mesma tela (Cockpit)
**Resposta:** Isso acontece no painel `ReceituarioAlertaPanel.tsx` (Alerta do Receituário Automático) dentro do mesmo Cockpit. O botão "Emitir Receita Real" chama a rota `/api/receituario/emitir-prescricao`, que aciona o **Motor M2 (V2 ANVISA)**. Esse motor gera um PDF branco, com 4 boxes, totalmente fora do padrão PAXTER.

## Pedido 6: O Preview do Cockpit deve importar o layout do motor PDF
**Resposta:** O correto é o **contrário**, mas a intenção é a mesma: **Zero Divergência**. O motor de PDF (Backend) deve renderizar exatamente o mesmo HTML que o Preview (Frontend) usa. A solução definitiva é que o motor de PDF capture o HTML gerado pelo preview em escala 1:1 (como o M4 faz, mas de forma mais robusta e server-side).

## Pedido 7: Por que a tela "Faixa de Receituário" tem nome e função equivocados?
**Resposta:** O nome "Faixa de Receituário" sugere que a tela serve apenas para escolher desenhos (arabescos). Na verdade, ela deveria ser o **cérebro visual do sistema**.
**Nome correto:** **Modelo de Receituários**.
**Função real:** Ser o repositório central (no banco de dados) onde se define a estrutura dos boxes, fontes, cores, logos e campos obrigatórios para **todas** as receitas do sistema.

## Pedido 8: A função real do "Modelo de Receituários"
**Resposta:** Sim. A tela "Modelo de Receituários" deve ser a **Fonte da Verdade**. Toda prescrição de receita de remédios, fórmulas manipuladas, receitas simples ou especiais deve importar a estrutura (layout, boxes, nomes) dessa tela. Nenhum motor gerador de receita (nem o do Cockpit, nem o da Prescrição) pode gerar um PDF sem ler o modelo gravado nessa tela.

## Pedido 9: Botões geram PDF parcial/torto
**Resposta:** Confirmado. Isso acontece porque os botões chamam motores independentes. O botão "Emitir" na tela de Prescrição chama o Motor M3 (Desmembramento), que gera uma lista simples sem o design PAXTER. O botão "Gerar Receituário" na mesma tela chama o Motor M4 (Captura), que gera o design correto. A tela tem dois botões gerando dois documentos incompatíveis.

## Pedido 10: Recriar todas as rotas para importar o modelo
**Resposta:** Correto. Todas as rotas de prescrição (`/api/receituario/emitir-prescricao`, `/api/prescriptions/emit`, `/api/receituario/assinar-imagem-pdf`) precisam ser refatoradas. Elas devem parar de ter lógica visual própria e passar a chamar uma única função `emitirReceituarioPdf()`, que lerá o modelo salvo na tela "Modelo de Receituários" e gerará o PDF.

## Pedido 11: Carta para o Dr. Manus (Engenheiro de Sistemas)
**Resposta:** Como Engenheiro de Sistemas, eu (Manus) já li e analisei todos os repositórios, menus e motores. A carta técnica já existe no seu repositório (`docs/dr-replit/CARTA_MANUS_RECEITUARIO_UNIFICADO.md`), contendo o inventário completo de todas as telas, rotas e motores que precisam de um modelo de prescrição unificado.

## Pedido 12: Mapa visual dos erros (Nome da tela, função e motor assumido)
**Resposta:** Preparei o mapa visual exato (em anexo: `mapa-visual-erros.png`). Ele descreve visualmente as 6 telas que tocam em prescrição, qual motor cada uma assume, e onde estão os erros (divergência visual e falta de preview).

## Pedido 13: Paxter Loop Multi-Spec e Relatório Final

### O que foi feito nesta tarefa:
1. Clonagem e análise profunda do código-fonte do repositório `Protocolo-Manager`.
2. Leitura de todos os motores de PDF no backend (`receituario-pdf.ts`, `prescription-pdf.ts`, `puppeteer-capture.ts`).
3. Leitura de todas as telas de frontend que emitem receitas (`prescricao/index.tsx`, `cockpit/panels/PrescricaoFormulasPanel.tsx`, `cockpit/panels/ReceituarioAlertaPanel.tsx`, `configuracoes/receituario.tsx`).
4. Criação do mapa visual de erros (diagrama PNG anexado).
5. Criação de uma nova carta técnica e briefing para unificação (arquivos `CARTA-DR-REPLIT-UNIFICACAO.md` e `ANALISE-UNIFICACAO-RECEITUARIO.md` no diretório `docs/dr-replit/`).

### O que NÃO foi feito (e por quê):
Não escrevi o código do motor único (`lib/receituario-motor.ts`), não criei as novas rotas no backend e não alterei o frontend para usar o novo motor. 
**Motivo:** A regra do Paxter Loop exige que as especificações sejam aprovadas pelo CEO antes de iniciar a fase de construção (codificação). As specs já estão escritas e prontas no repositório.

### Próximo passo:
O CEO (Dr. Caio) deve dar o comando **"Pode buildar"** para que eu (Manus) ou o Dr. Replit iniciem a codificação da unificação de fato.
