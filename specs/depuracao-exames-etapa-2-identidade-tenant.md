# Especificação — Depuração de Exames, Etapa 1 do SaaS: identidade e isolamento por clínica

Estado de engenharia (Art. 77): EM ESPECIFICAÇÃO -> EM CONSTRUÇÃO. Nada aqui está HOMOLOGADO.
Autorização do responsável: desenvolvimento e testes sintéticos. Sem publicação, sem envio de mensagens,
sem alterar pacientes reais, sem acionar provedores pagos.

## 1. Objetivo

Garantir que um laudo só entre no prontuário de um cliente quando a identidade impressa no laudo for
compatível com o cadastro, e que toda leitura ou escrita de exame seja derivada de uma sessão
(colaborador ou cliente) amarrada à clínica (empresa), nunca de um número vindo do navegador.

## 2. Fatos verificados no código (13/11/2026 a 16/11/2026)

| Fato | Onde | Risco |
|---|---|---|
| `POST /exames-lab/ingest` sem sessão; `clientId` vem do corpo; empresa cai em 5 quando não autenticado | `routes/exames-lab.ts`, `middleware/tenantContext.ts` | Escrita em cliente de outra clínica; documento gravado na empresa 5 |
| `GET /exames-lab/evolucao/:clientId`, `/resultados`, `/documentos/:id`, `/documento/:docId/arquivo`, `/monitor`, `POST /recovery` sem filtro de empresa e sem sessão própria | idem | Vazamento entre clínicas; em produção o perímetro (Basic Auth ou Bearer de colaborador) é a única barreira |
| Token do portal do cliente não é aceito pelo perímetro de `/api/exames-lab/*` (Bearer inválido de colaborador responde 401) | `middleware/basicAuth.ts` | `/area > Evolução` só funciona em desenvolvimento; em produção não há caminho legítimo para o cliente |
| `demo-conversao` grava `empresaId: 5` fixo e usa cliente 3747 por padrão | `routes/exames-lab.ts` | Dado de demonstração em cliente real e empresa fixa |
| Nenhuma comparação entre identidade impressa no laudo e cadastro | `lib/exam-extraction/persist.ts` | Laudo de homônimo ou de outra pessoa entra no prontuário |

Hipóteses ainda não provadas por execução: nenhuma rota foi chamada; a leitura é do código. "Preciso verificar"
em produção real (não será tocada).

## 3. Requisitos

### 3.1 Motor de identidade (função pura, sem banco)

1. CPF: normalizar para 11 dígitos; validar dígitos verificadores; rejeitar sequências repetidas.
2. Nome: normalizar (acento, caixa, pontuação, espaços, partículas "de/da/do/das/dos/e"); comparar por
   palavras tolerando abreviatura de inicial e erro de grafia (distância de edição 1 em palavras de 4 a 8 letras, 2 a partir de 9).
3. Nascimento: aceitar `DD/MM/AAAA`, `DD-MM-AAAA`, `AAAA-MM-DD`; validar data real.
4. Resultado por campo: `igual`, `variante` (só nome), `diferente`, `ausente`, `invalido`.
5. Veredito:
   - `confirmada`: CPF válido dos dois lados e igual; OU nome igual/variante E nascimento igual (ambos presentes).
   - `contradicao`: CPF válido dos dois lados e diferente; OU nascimento válido dos dois lados e diferente com nome não igual;
     OU nome `diferente` (nenhuma palavra em comum além de partículas) com outro dado presente.
   - `revisao`: qualquer outro caso (dado ausente, inválido, nome só parcial, nascimento diferente com CPF igual).
6. Dado ausente jamais produz `confirmada` sozinho. Nome sozinho nunca confirma.

### 3.2 Quarentena

7. Veredito diferente de `confirmada`: documento fica `status = 'quarentena'`; nenhuma linha em `exam_results`;
   `raw_json` não é gravado; o conteúdo extraído fica somente em `exam_identity_checks` (acesso restrito a colaborador da mesma empresa).
8. Quarentena não envia o arquivo ao Drive da pasta do cliente, não espelha no cofre R2 e não envia aviso "exame recebido".
   A cópia interna do original (cofre do sistema) é mantida, pois a restrição é de acesso, não de existência.
9. Liberação humana: `POST /exames-lab/documentos/:id/identidade/liberar` e `/rejeitar`.
   - Exige sessão de colaborador ativo; empresa da sessão = empresa do cliente do documento.
   - `contradicao` só pode ser liberada por médico ativo (mesma regra da conferência clínica) e com justificativa de pelo menos 15 caracteres.
   - `revisao` pode ser liberada por colaborador ativo da empresa, com justificativa de pelo menos 10 caracteres.
   - Liberar incorpora a partir do JSON guardado (sem nova chamada de modelo); rejeitar fixa `status = 'identidade_rejeitada'`.
   - Concorrência: a transição `quarentena -> recebido/identidade_rejeitada` é uma única atualização condicional; segunda tentativa recebe 409.
10. Registro de eventos append-only (`verificacao`, `liberacao_humana`, `rejeicao_humana`); nunca DELETE.

### 3.3 Isolamento por clínica e sessão

11. Novo conjunto de rotas do cliente em prefixo já público com token próprio: `/api/area-paciente/exames/*`.
    O `clientId` é SEMPRE o do token do portal; qualquer `clientId` na URL, corpo ou consulta é ignorado ou recusado.
    Rotas: `GET evolucao`, `POST enviar` (PDF), `GET status/:documentoId` (só documento do próprio cliente).
12. Rotas administrativas de `/exames-lab` que tocam dado de cliente passam a exigir sessão de colaborador
    (`requireCollaborator`) E verificar que o cliente/documento pertence à empresa da sessão (`tenantContext`).
    Falha de vínculo responde 404 (não revela existência) para leitura e 403 para escrita.
13. `startExamIngestion` passa a exigir `empresaId`; deriva da empresa do cliente quando vier do portal. Sem empresa = erro (nunca 5 por padrão).
14. `demo-conversao`: exige proprietário da plataforma; `clientId` explícito; empresa = a do cliente; remove `empresaId: 5` e o cliente 3747 padrão.
15. `/monitor` e `/recovery` exigem sessão; `/monitor` filtra por empresa.
16. A interface administrativa passa a enviar o token do colaborador nas chamadas de exames. A tela `/area` passa a usar as rotas do cliente com o token do portal.

### 3.4 Migração

17. Aditiva e idempotente (`CREATE TABLE IF NOT EXISTS`); sem ALTER em tabelas existentes; sem drizzle push.
18. Script de desfazer separado em `scripts/migrations/rollback/`. Aviso: desfazer apaga o histórico de verificações.
19. Testada duas vezes seguidas em PostgreSQL descartável e com o desfazer.

## 4. Falhas previstas e barreiras (Art. 75)

| Falha | Barreira | Prova exigida |
|---|---|---|
| Laudo de homônimo com CPF diferente | CPF divergente = contradição | Teste do motor + teste de banco: zero linhas em `exam_results` |
| Laudo sem CPF e sem nascimento | Nome sozinho = revisão | idem |
| CPF OCR com dígito errado | CPF inválido = ausente + revisão, não contradição | Teste do motor |
| Cadastro sem CPF | Ausente do lado do cadastro = não confirma | Teste do motor |
| Nome com grafia diferente ("Jose"/"José", inicial do meio) | Variante tolerada só com 2º dado igual | Teste do motor |
| Duas liberações simultâneas | Atualização condicional | Teste de concorrência em banco descartável |
| Colaborador de outra clínica | 404/403 antes de ler/gravar | Testes cruzados |
| Cliente tenta ler outro `clientId` | Token fixa o cliente | Teste: URL com outro id é ignorada |
| Token expirado, adulterado, de colaborador | 401 | Teste |
| Processo cai entre extração e quarentena | Documento permanece `processando`; recuperação existente não reprocessa automaticamente (bloqueio herdado) | Já coberto na etapa anterior |
| Quarentena exposta pela listagem | Listagem mostra só status e identificador; JSON extraído nunca é devolvido ao cliente | Teste |
| Documento antigo sem verificação | Mantido como está (legado); marcado como não verificado no relatório; não retroverificado nesta etapa | Registro em evidências |

## 5. Fora do escopo desta etapa

Linha do tempo, redesenho da Evolução, orquestração dos três modelos, versionamento imutável de extrações, benchmark.
Exames de imagem (`persist-image.ts`) e importação em massa do Drive passam pelo mesmo `processExamDocument`? — a conferir; o que não passar fica registrado como lacuna.
Rotas de curadoria global do catálogo (sem dado de cliente) não mudam.

## 6. Definição de pronto

1. Testes puros do motor de identidade verdes (todas as linhas da seção 3.1).
2. Testes em PostgreSQL descartável: migração repetível e reversível; quarentena sem resultados; liberação com concorrência.
3. Testes de rota com a cadeia real de autenticação: sem token, token de outro tipo, outra clínica, cliente errado.
4. Teste que antes esperava 200 e recebia 401 em `exam-workspace.test.ts` explicado e corrigido sem afrouxar segurança.
5. Suíte anterior (45 testes) continua verde.
6. Revisão independente sequencial sem impeditivo aberto.
7. Relatório honesto: o que é simulado, o que é real.
