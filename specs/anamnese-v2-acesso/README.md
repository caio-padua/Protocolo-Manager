# Multi-spec — Acesso e Revisao da Anamnese V2 (A + B)

Decisao do CEO Dr. Caio (21/06/2026): construir AS DUAS opcoes pelo Paxter Loop,
sem perguntar; dúvida crítica resolve-se pelas diretrizes/Biblia, pensando como o CEO.

| Spec | Apelido | Objetivo em 1 frase |
|---|---|---|
| `A-identificacao-link-paciente.md` | Opcao A | Paciente se identifica (CPF + nascimento) ao abrir a anamnese; a sessao passa a ficar AMARRADA ao cliente; a equipe envia o link por WhatsApp. |
| `B-revisao-colaborador.md` | Opcao B | Tela e endpoints (protegidos pelo Portao do Colaborador) para a equipe REVISAR os achados de qualquer anamnese concluida. |

Linha vermelha comum (nao cruzar):
1. Nunca confiar em `clientId` cru vindo do navegador do paciente (risco de IDOR — acessar dado de outro pela troca do numero). A amarracao ao cliente SO vale via token HMAC verificado no servidor.
2. Dados clinicos (achados, recusas, observacoes) sao PII: todo endpoint de leitura do colaborador exige login de colaborador (`requireCollaborator`).
3. Preservar a LINHA VERMELHA da anamnese (pergunta de alarme nunca recusavel) — nao mexer nessa logica.
4. Design: seguir a skill `skill-layout-paxter` (paineis 3D, Grade Imaginaria, cores da marca). So apresentacao muda; motor de achados (`buildFindings`) nao muda por estetica.

RESUMO EM 1 LINHA: A amarra a anamnese ao cliente com identificacao segura + envio por WhatsApp; B da a equipe uma tela protegida para revisar os achados — ambos reusando o que ja existe.
