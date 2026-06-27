# Spec — Cartório Onda 4: Selo de Consentimento + Trava do Ato (nervo)

Data: 26/06/2026. Método: Paxter Loop. Pai: `specs/cartorio-master.md`. Depende de: Onda 1.

## Objetivo (uma frase)
Transformar a assinatura em uma TRAVA: o médico só dá sequência a um ato (ex.: liberar/aplicar um
protocolo) depois que o paciente assinou o documento de consentimento exigido — com um "selo" visível.

## Requisitos exatos
1. Função pública (nervo) de leitura `consentimentoAtivo(pacienteId, escopo)` no backend, retornando
   `{ ativo: boolean, solicitacaoId?, assinadoEm?, documentoTitulo? }`. `escopo` identifica o ato (ex.:
   `PROTOCOLO:<id>` ou um tipo de doc `TCLE`). Considera ativo quando há solicitação CONCLUÍDA cujo
   `tipoDoc`/escopo corresponde e (se aplicável) ainda válida.
2. Endpoint `GET /api/assinaturas/consentimento?pacienteId=&escopo=` expondo essa função
   (requireCollaborator).
3. Componente visual "SELO DE CONSENTIMENTO" (padrão 3D Paxter): VERDE = consentido (mostra documento +
   data), VERMELHO = pendente (mostra botão "Enviar documento para assinatura"). Exibido no Cockpit
   (bloco da Onda 2) e na tela do ato (detalhe do protocolo).
4. Trava real: na ação clínica que o CEO definir como protegida (decisão dele — default sugerido:
   "liberar/confirmar a 1ª aplicação do protocolo"), o backend consulta `consentimentoAtivo`; se não
   ativo, retorna 409 com mensagem "Consentimento pendente" e o front mostra o selo vermelho + atalho.
   A trava deve ser uma checagem ADITIVA (não reescreve o fluxo do ato), e configurável por toggle.
5. Registrar no documento qual ATO ele consente (campo `escopo`/`metadata` na solicitação) para o nervo
   conseguir casar documento ↔ ato.

## Casos extremos
1. Toggle da trava desligado → o ato segue normalmente (a trava é opt-in para não travar o uso hoje).
2. Documento assinado mas de outro escopo → não conta como consentimento daquele ato.
3. Consentimento revogado/expirado (se houver regra futura) → selo volta a vermelho.
4. Médico precisa agir em urgência → registrar override com justificativa (decisão do CEO; default: NÃO
   permitir override silencioso — exige justificativa logada).

## Linhas vermelhas
Herda da spec-mãe. CRÍTICO: a trava é ADITIVA e protegida por toggle; NÃO reescrever o motor do ato nem
o de orçamento. Default do toggle: DESLIGADO até o CEO confirmar onde quer travar.

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| `consentimentoAtivo` responde certo | curl com caso assinado e não-assinado |
| Selo verde/vermelho aparece no Cockpit e no ato | screenshot dos dois estados |
| Trava bloqueia o ato sem consentimento (toggle on) | curl → 409 |
| Toggle off não atrapalha o fluxo atual | teste de regressão do ato |
| architect PASS, zero pendência | revisão requisito por requisito |

## O que só o CEO faz
Definir QUAL ato é travado e se haverá override com justificativa.

RESUMO EM 1 LINHA: um selo de consentimento (verde/vermelho) e um nervo `consentimentoAtivo` que, por
toggle, travam o ato clínico até o paciente assinar o documento exigido — sem reescrever o motor do ato.
