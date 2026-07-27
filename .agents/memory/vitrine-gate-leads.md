---
name: Portao-captacao das vitrines
description: Regras do gate de leads das vitrines publicas e armadilha do push GitHub sem credencial
---

- O "login" da vitrine E a captacao (decisao CEO 27/07/2026): paciente CPF+nascimento+telefone; clinica CNPJ+CPF+nascimento+telefone. Contrato POST /api/vitrine-leads so ADICIONA campo opcional, nunca renomeia.
- UPSERT por UNIQUE (tipo,cpf) soma acessos; painel admin "Leads da Vitrine" no padcom (Estrutura & Governanca).
- **Push GitHub**: `git push origin` falha ("Invalid username or token") — nao ha credencial git no shell; `gh auth status` = deslogado; `listConnections('github')` retorna 0 mesmo com integracao "instalada". Push tem de ser feito pelo CEO no painel Git do Replit (botao de push), ou reconectar a integracao GitHub.
- Repo do Lovable: caio-padua/parxis-core-protocol (publico; Vite+TanStack+Supabase+.lovable; sem backend de leads). Repo do Manager: caio-padua/Protocolo-Manager (origin).
