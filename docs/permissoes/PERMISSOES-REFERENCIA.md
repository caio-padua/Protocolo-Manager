# Permissões por papel e por clínica — Referência

Atualizado em 26/11/2026. Fonte da verdade do comportamento: o CÓDIGO (seção 8). Este texto descreve; se divergir do código, o código vale e este texto deve ser corrigido.

## 1. Índice
1. Índice
2. Finalidade
3. Fluxo de uma requisição
4. Os sete papéis e a matriz
5. Regras
6. Exemplos práticos
7. Simulação visual x autorização real
8. Referências de implementação e testes
9. Confirmado x planejado
10. Como atualizar este documento

## 2. Finalidade
Garantir que cada profissional veja e faça somente o que o papel dele permite, dentro de cada clínica, com a recusa feita pelo servidor (não pela tela).

## 3. Fluxo de uma requisição
1. O navegador envia o login (token) da pessoa.
2. O servidor descobre quem é a pessoa e qual clínica está ativa (a clínica pedida só vale se a pessoa tem vínculo com ela).
3. O servidor busca os papéis da pessoa NAQUELA clínica na tabela de papéis por empresa.
4. A rota pedida é comparada com a matriz do domínio (prescrição, prontuário, custos de fornecedor, financeiro, equipe).
5. Resultado: liberado, 401 (sem login) ou 403 (papel não permite).

## 4. Papéis e matriz
Papéis (podem se combinar na mesma clínica): administrador, médico, enfermagem, recepção, financeiro. O CEO (dono da plataforma) é separado e tem acesso total.

| Domínio | Ler | Escrever |
|---|---|---|
| Prescrição e receituário | médico | médico |
| Prontuário, exames e laudos | médico, enfermagem | médico, enfermagem |
| Custos de fornecedor | administrador, financeiro | administrador, financeiro |
| Financeiro e notas fiscais | administrador, financeiro, recepção | administrador, financeiro |
| Gestão de equipe | administrador | administrador |

## 5. Regras
1. Papéis da mesma clínica se somam (união).
2. Papéis de outra clínica nunca valem.
3. Sem papel cadastrado na clínica = negado.
4. Falha ao ler papéis = negado.
5. Sem login em rota protegida = 401.
6. Duas exceções públicas por desenho: webhook do Asaas e arquivo de exame aberto por link com código.
7. Algumas rotas têm trava própria mais estrita (ex.: fornecedores só do proprietário); o guarda nunca afrouxa essas travas.

## 6. Exemplos práticos
- Dr. Kleber: médico e administrador no Instituto Lemos, só médico no Instituto Pádua. No Lemos vê o financeiro; no Pádua recebe 403.
- Recepção lê o financeiro, mas editar pagamento dá 403.
- Gerente financeiro emite nota fiscal, mas abrir laudo dá 403.
- Enfermagem registra aplicação, mas abrir prescrição dá 403.

## 7. Simulação visual x autorização real
- Simulação visual (planejada, Fatia 3): seletor de transmutação do CEO e menu com cadeado. Serve para ver a tela como outro perfil. NÃO concede nem retira acesso real.
- Autorização real: sempre do servidor. Esconder um botão não protege nada; o 403 do servidor protege.

## 8. Referências de implementação e testes
- Regra pura e matriz: `artifacts/api-server/src/lib/papeis-acesso.ts`
- Middleware (lê papéis no banco): `artifacts/api-server/src/middleware/papeisEmpresa.ts`
- Montagem no servidor: `artifacts/api-server/src/app.ts` (depois do contexto de clínica)
- Tabela de papéis: `lib/db/src/schema/professional-papeis-empresa.ts`
- Testes da matriz: `artifacts/api-server/src/tests/papeis-acesso.test.ts`
- Testes de API com o middleware real: `artifacts/api-server/src/tests/papeis-empresa-api.test.ts`
- Prova HTTP no servidor de desenvolvimento: `artifacts/api-server/scripts/prova-papeis-http.ts`
- Especificação da fatia: `specs/permissoes-fatia-2-servidor.md`
- Organograma na tela: `/ceo/cabine`, aba Organograma (calculado pela regra real).

## 9. Confirmado x planejado
| Item | Estado |
|---|---|
| Tabela de papéis por clínica | CONFIRMADO |
| Bloqueio 401/403 no servidor para os cinco domínios | CONFIRMADO (testes e prova HTTP) |
| Combinação de papéis e isolamento entre clínicas | CONFIRMADO |
| Administrador não médico sem prontuário | CONFIRMADO no código; decisão do CEO pendente |
| Profissionais sem papel cadastrado ficam bloqueados | CONFIRMADO |
| Domínios fora da matriz (agenda, estoque, comunicação, catálogos de orçamento) | NÃO COBERTOS ainda |
| Seletor de transmutação do CEO | PLANEJADO (Fatia 3) |
| Modo visual com cadeado e texto riscado | PLANEJADO (Fatia 3) |
| Bateria final e checklist de republicação | PLANEJADO (Fatia 4) |

## 10. Como atualizar
1. Mude a regra em `papeis-acesso.ts` e rode os testes.
2. O organograma da tela se atualiza sozinho (é calculado da regra).
3. Atualize as tabelas das seções 4 e 9 deste arquivo.
4. Confirme o comportamento real no código antes de afirmar algo aqui.
