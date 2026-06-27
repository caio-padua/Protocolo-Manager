# Spec — Cadastro Público: Modos (Simples/Completo) + Convite Animado + Leitura por IA

Data: 27/06/2026. Autor: Dr. Replit Paxter. Loop: Paxter (Especificar → Construir → Revisar).
Onda anterior (base): `specs/cadastro-publico-voz-foto.md` (tela `/cadastro` com voz + máscaras + foto).

## 1. Objetivo (uma frase)

Evoluir a tela pública `/cadastro` para ter DOIS modos (Simples e Completo), um CONVITE animado e
elegante que incita o cliente a fazer o cadastro completo (com narrativa de benefícios), busca de CEP
ao sair/Enter do campo, e um PREENCHIMENTO RÁPIDO POR IA (foto do documento RG ou CNH lê nome, CPF e
data de nascimento) — sem mexer no fluxo só-foto (`/foto` intocado).

## 2. Dor do CEO (verbatim destilado)

1. Os 5 obrigatórios são os principais, MAS o cadastro completo deve oferecer TODOS os campos
   voltados ao cliente que já existem hoje no cadastro do cliente.
2. Público = empresários com pouco tempo. Precisa de uma ferramenta para o cliente VER e OPTAR entre
   preencher o cadastro SIMPLES ou o COMPLETO.
3. Chamada para o completo no estilo "Preenchendo o cadastro completo, você pode receber descontos".
4. Uma telinha (card) VERDE OU AMARELA, meio FOSCA, quadradinha, que entra no meio da tela: entra
   pela direita, amplia, diminui e volta saindo pela direita, em ~1 segundo. Enquanto a animação roda,
   o cliente NÃO consegue digitar.
5. Esse convite aparece quando ele está preenchendo o PENÚLTIMO campo do cadastro simples. Depois da
   animação, o toggle do "Completo" fica em destaque para ele selecionar.
6. Criar uma NARRATIVA que o incite ao completo (a clínica oferece algumas coisas — descontos,
   prioridade etc.).
7. CEP: ao mudar / dar Enter / sair do campo, buscar o endereço automaticamente. O CEP vem ANTES dos
   demais campos de endereço.
8. Colocar IA GRÁTIS para facilitar o preenchimento — "o que há de mais moderno além de digitado".

## 3. Decisões travadas (defaults do Paxter; CEO pode trocar depois)

| Tema | Decisão travada | Motivo |
|---|---|---|
| Modos | Toggle "Cadastro Simples" (default) x "Cadastro Completo", visível desde o início no topo | Atende "ver e optar"; default simples = menos atrito para quem tem pressa |
| Campos do Simples | Os 5 obrigatórios (nome, nascimento, CPF, e-mail, celular) + Foto + Preenchimento por IA | Mínimo viável de cadastro |
| Campos do Completo | Tudo do Simples + Endereço (CEP→logradouro→nº→compl.→bairro→cidade→estado→país) + Instagram + Como conheceu + Clínica de origem | "Todos os campos do cliente" hoje existentes; `notes`/`status`/agendas são internos e NÃO entram |
| Cor do convite | VERDE esmeralda fosca (frosted) com borda dourada | Verde = positivo/desconto; combina com navy/ouro Paxter (CEO autorizou verde OU amarelo) |
| IA de preenchimento | Foto do DOCUMENTO (RG ou CNH) → Gemini lê → preenche Nome, CPF, Data de Nascimento | Resposta mais moderna a "além de digitado"; a voz por campo já existe da onda anterior |
| Privacidade do documento | A imagem do documento é usada SÓ para leitura e NÃO é armazenada (descartada após extrair) | Dado sensível; mínimo necessário |

## 4. Requisitos exatos

### 4.1 Modos Simples/Completo
1. Toggle (segmented control 3D Paxter) no topo do formulário: "SIMPLES" (default) | "COMPLETO".
2. No modo Simples: renderizar SÓ o painel de Dados Pessoais (5 obrigatórios) + painel de IA + painel
   de Foto + botão enviar. Esconder Endereço e Adicionais.
3. No modo Completo: renderizar tudo (Dados Pessoais + Endereço + Adicionais + Foto).
4. Trocar de modo NÃO apaga o que já foi digitado (estado preservado).
5. O envio (`submit`) é idêntico nos dois modos; no Simples os campos de endereço/adicionais vão
   vazios (não enviados), e o servidor continua exigindo só os 5 obrigatórios.

### 4.2 Convite animado (CTA)
6. Card frosted verde (backdrop-blur + verde translúcido + borda dourada), quadrado, centralizado,
   com a narrativa de benefícios e uma dica "Toque em CADASTRO COMPLETO".
7. Animação ~1,2s: entra pela direita (translateX) → centro com escala 1 → amplia (~1.12) → diminui
   (~0.96) → sai pela direita. Implementada por @keyframes próprio (não depende de config Tailwind).
8. Durante a animação, um overlay cobre a tela e BLOQUEIA digitação (pointer-events).
9. Dispara UMA vez, quando o cliente conclui o PENÚLTIMO obrigatório do Simples (e-mail válido ao sair
   do campo), e só no modo Simples. Guardado por flag (não repete).
10. Ao terminar a animação, o toggle "COMPLETO" recebe destaque/pulse temporário.
11. Se a animação não puder rodar (ex.: usuário já no Completo), nada acontece — não quebra o fluxo.

### 4.3 CEP
12. Campo CEP é o primeiro do bloco de endereço (já é). Buscar o endereço automaticamente em TRÊS
    gatilhos: ao completar 8 dígitos (onChange, já existe), ao sair do campo (onBlur) e ao pressionar
    Enter (onKeyDown). Reaproveitar `lookupCepByValue` (com guarda de corrida existente).

### 4.4 Preenchimento por IA (foto do documento)
13. Painel "PREENCHIMENTO RÁPIDO" (no topo, nos dois modos) com botão "FOTO DO DOCUMENTO (RG OU CNH)"
    que abre câmera/galeria (input próprio, separado da foto de perfil).
14. Ao escolher a imagem: POST `multipart` para `/api/client-registration/scan-document` (campo `file`
    + `token`); mostrar estado "Lendo o documento..." (a chamada leva alguns segundos).
15. Resposta `{ name, cpf, birthDate }` (qualquer campo pode vir null). Preencher os campos
    correspondentes JÁ mascarados (CPF e data). Mostrar aviso curto: "Confira os dados lidos e ajuste
    se preciso." Em erro, aviso curto sem quebrar (cliente segue digitando/falando).
16. A imagem do documento NÃO é salva em lugar nenhum (só vai ao Gemini e é descartada).

### 4.5 Backend — nova rota
17. `POST /client-registration/scan-document`: multer memory (`file`), valida token de cadastro
    (anti-IDOR, mesmo escopo), valida tipo de imagem (allowlist atual), chama Gemini
    `gemini-2.5-flash` com a imagem inline (base64) + prompt de extração de documento brasileiro,
    `responseMimeType: "application/json"`, retorna `{ name, cpf, birthDate }`. Erros viram 4xx/5xx
    com mensagem curta. NÃO grava nada no banco, NÃO sobe a imagem ao Object Storage.

## 5. Casos extremos
- Navegador sem câmera → botão usa galeria (input file), igual à foto de perfil.
- Documento ilegível/sem dados → Gemini devolve campos null; UI avisa e o cliente preenche à mão.
- Gemini fora do ar / timeout → 502/500 com aviso curto; não trava o cadastro.
- Trocar de modo no meio → preserva valores (sem reset).
- Convite animado: não disparar se o cliente já está no Completo ou já viu uma vez.
- CEP onBlur com menos de 8 dígitos → não busca (a guarda já ignora).

## 6. Definição de PRONTO
1. `/foto` intocado.
2. `/cadastro` abre em modo Simples mostrando 5 obrigatórios + IA + Foto; toggle troca para Completo
   revelando Endereço + Adicionais, sem perder o que foi digitado.
3. Convite frosted verde dispara uma vez no penúltimo obrigatório do Simples, bloqueia digitação por
   ~1,2s, entra/amplia/diminui/sai pela direita, e destaca o toggle Completo. Narrativa presente.
4. CEP busca endereço ao sair do campo e ao Enter (além do onChange a 8 dígitos).
5. Botão "Foto do documento" lê RG/CNH via Gemini e preenche Nome/CPF/Nascimento mascarados; erro não
   quebra; imagem do documento não é armazenada.
6. Obrigatórios continuam validados no servidor; submit grava no client (verificável por GET info).
7. typecheck do arquivo tocado limpo (typecheck GLOBAL é pré-quebrado → validar por runtime/screenshot).
8. Architect aprova sem pendência.

## 7. Linhas vermelhas
- NÃO tocar `/foto` nem o fluxo só-foto.
- NÃO criar coluna nova no banco (todos os campos já existem).
- NÃO armazenar a imagem do documento.
- NÃO mudar o motor de submit/obrigatórios além do necessário.
- Marca: PAXTER no topo (não "Padcon Conect"); design 3D Paxter (panel-3d/bevel-3d/field-engraved).
