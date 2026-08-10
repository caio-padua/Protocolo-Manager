# SPEC — Tela pública /foto: enquadramento quadrado + editor de recorte

**Data:** 10/08/2026  
**Solicitante:** CEO (Dr. Caio)  
**Status:** ESPECIFICADO

---

## Objetivo

Garantir que o cliente consiga tirar e enviar uma foto de rosto bem enquadrada em formato quadrado (1:1), com guia visual durante a captura e editor de recorte após captura ou seleção da galeria.

---

## Requisitos

### REQ 1 — Guia de enquadramento na câmera (live)
- Durante o preview da câmera (tag `<video>`), exibir um overlay quadrado centralizado sobre o vídeo.
- O overlay deve ter bordas arredondadas, cor ouro (#C9A227 ou similar), opacidade 0,6, sem fundo sólido (só borda).
- Fora do quadrado: máscara semitransparente escura para guiar o foco.
- O quadrado deve ocupar 80% da menor dimensão do vídeo.
- Instrução textual abaixo: "Posicione seu rosto dentro do quadrado".

### REQ 2 — Editor de recorte após captura/seleção
- Após tirar foto pela câmera OU selecionar da galeria, abrir editor de recorte antes do upload.
- O editor deve exibir a imagem completa com uma caixa de recorte quadrada (1:1) arrastável e com zoom.
- Controles: slider de zoom (0,5× a 3×), botão "CONFIRMAR RECORTE", botão "REFAZER" (volta à câmera/galeria).
- Implementar com canvas nativo (sem biblioteca externa) ou com react-image-crop (já instalado, verificar).
- O resultado do recorte é um `Blob` no formato JPEG, qualidade 0,92, dimensão 600×600px.

### REQ 3 — Upload sempre como quadrado 1:1
- O arquivo enviado ao servidor DEVE ter dimensões iguais (largura = altura).
- Servidor deve rejeitar imagens com proporção diferente de 1:1 (tolerância ±5px) com status 400.
- Mensagem de erro: "Envie uma imagem quadrada (1:1). Use o editor de recorte disponível."

### REQ 4 — Compatibilidade com fluxo existente
- Os botões "ABRIR CÂMERA" e "ESCOLHER DA GALERIA" continuam funcionando.
- O botão "ENVIAR FOTO" só fica ativo após o recorte ser confirmado.
- A foto preview exibida no card antes do envio é o resultado quadrado do recorte.

### REQ 5 — Visual Paxter 3D
- Editor de recorte em modal sobre o fundo navy escuro.
- Slider com classe btn-3d-soft, botões com bevel-3d.
- Nenhum componente externo sem aprovação.

---

## Casos extremos

- Imagem já quadrada (ex.: 1080×1080): abre editor com zoom 1× centralizado.
- Imagem muito pequena (<200px): aviso "Imagem muito pequena. Use uma foto de maior resolução." e bloqueia envio.
- Câmera recusada pelo navegador: comportamento atual preservado (mensagem de erro).

---

## Fora do escopo

- Filtros de cor, brilho ou contraste.
- Detecção facial automática.
- Recorte na tela de admin (só na tela pública do cliente).
