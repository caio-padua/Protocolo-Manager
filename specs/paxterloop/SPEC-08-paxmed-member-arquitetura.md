# SPEC 8 — PAXMED Member: segundo aplicativo web B2C (arquitetura B)

Estado: FILA (NÃO IMPLEMENTADO). Registrada em 16/11/2026. Depende da conclusão da SPEC 7 (TEX), sem interrompê-la. Prioridade acima das campanhas (14 a 17).
Provas: só MOCK e banco descartável com dados sintéticos. Sem publicar, sem domínio novo, sem cobrança real.

## 1. Decisão de arquitetura (confirmada na auditoria de 16/11/2026)
Novo pacote web dentro do mesmo projeto (`artifacts/member`), com caminho próprio de pré-visualização (`/member/`), identidade visual própria, SEM nenhum componente clínico. Reaproveita `api-server`, `api-worker` e bibliotecas compartilhadas, com contratos de API isolados (grupo de rotas com prefixo próprio e autenticação própria). Proibido: clone do Manager, segunda base de pacientes. O Manager ("PM Clínicas") mantém rotas e login da equipe. O Superadmin comercial fica no Manager, em "PAXMED · NEGÓCIOS". Subdomínios distintos só depois de testes e autorização de domínio/publicação (comando de 100%).

## 2. Identidade e segurança (critérios)
| Nº | Critério |
|---|---|
| 2.1 | Entidade pessoa e membership sem `empresa_id` obrigatório; tabelas aditivas; `clients` não é alterada |
| 2.2 | Login com e-mail verificado e senha segura (política global de senhas); passkey quando suportado |
| 2.3 | Recuperação de conta e proteção contra tentativa repetida (limite e bloqueio temporário) |
| 2.4 | Proibido usar só CPF + data de nascimento ou o token de portal atual como login permanente |
| 2.5 | Papéis e direitos de uso (entitlements) separados dos tenants clínicos |
| 2.6 | Vínculo com clínica só com consentimento da pessoa, uma ou mais clínicas, revogável; vincular não expõe o acervo privado |
| 2.7 | Família: convite gera conta independente; nenhum acesso a prontuário ou a outro perfil sem consentimento delegado granular |

## 3. Telas do app Member (cada uma precisa existir de verdade antes de ser marcada pronta)
Landing, cadastro, login, validação de e-mail, recuperação, Meu Painel, Meus Exames, Evolução, TEX · PDF, Minhas Prescrições (externas / enviar / da clínica se houver vínculo), Meus Medicamentos (posologia, alarmes por Telegram com opt-in), Família e vínculos, Minha Assinatura, Indique o PAXMED. Entram por fatias, reaproveitando backend já comprovado. Item sem tela funcional = NÃO IMPLEMENTADO.

## 4. Menu do Superadmin (Manager, "PAXMED · NEGÓCIOS")
Cada módulo entregue aparece no menu lateral esquerdo: Visão Geral, PAXMED Members, Clínicas B2B, Monetização, Convites e Indicações, Auditoria de módulos. Equipe comercial: nenhum acesso a exame, diagnóstico, prescrição ou tratamento. Cockpit nunca mostra categoria Member.

## 5. Fatias
| Fatia | Conteúdo | Estado |
|---|---|---|
| 8.1 | Auditoria detalhada de autenticação e das bibliotecas reutilizáveis | PENDENTE |
| 8.2 | Esquema aditivo (pessoa, membership, vínculo, consentimento, entitlements) em banco descartável | PENDENTE |
| 8.3 | Pacote `artifacts/member` mínimo: landing, cadastro, login, painel; rotas `/api/member/*` | PENDENTE |
| 8.4 | Verificação de e-mail em modo teste, recuperação, limite de tentativas | PENDENTE |
| 8.5 | Vínculo consentido com clínica e testes negativos de cruzamento | PENDENTE |
| 8.6 | Telas de valor (exames, evolução, TEX, prescrições, medicamentos) por reaproveitamento | PENDENTE |
| 8.7 | Menu do Superadmin e matriz de cobertura atualizada | PENDENTE |

## 6. Testes obrigatórios
Clínica não vê dado B2C não vinculado; membro não acessa Cockpit nem rota clínica; comercial não lê exame; vincular não expõe acervo privado; sessão da clínica não autentica no Member e vice-versa; pacote Member sem importação clínica (verificação automática); build dos dois apps; navegação e layout móvel; regressão de TEX, Telegram, exames e prescrições.
Limites declarados: e-mail real e gateway real não serão chamados; o que for simulado é rotulado MOCK.
