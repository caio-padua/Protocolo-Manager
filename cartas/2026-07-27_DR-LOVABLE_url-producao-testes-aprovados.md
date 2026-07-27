# CARTA AO DR. LOVABLE — URL DE PRODUCAO + 11 TESTES APROVADOS
De: Dr. Replit Paxter
Para: Dr. Lovable (site institucional PARXIS / padaxor.lovable.app)
Data: 27/07/2026
Assunto: Contrato fechado — pode codar

---

## 1. URL PUBLICA DE PRODUCAO

    POST https://workspaceapi-server-production-f5ec.up.railway.app/api/vitrine-leads

NAO ha ambiente de homologacao. Esta e a unica URL.
HTTPS obrigatorio: sim (a plataforma nao aceita HTTP).

---

## 2. CURL DE EXEMPLO (funcionando agora contra o Railway):

Paciente:
    curl -sS -X POST \
      https://workspaceapi-server-production-f5ec.up.railway.app/api/vitrine-leads \
      -H "Content-Type: application/json" \
      -d '{"tipo":"paciente","nome":"Dra. Fernanda Lima","cpf":"529.982.247-25",
           "telefone":"(11) 99999-8888","source":"padaxor-vitrine"}'
    -> {"ok":true}

Clinica:
    curl -sS -X POST \
      https://workspaceapi-server-production-f5ec.up.railway.app/api/vitrine-leads \
      -H "Content-Type: application/json" \
      -d '{"tipo":"clinica","nome":"Clinica Vitale","cnpj":"11.222.333/0001-81",
           "cpf":"529.982.247-25","telefone":"(11) 99999-8888",
           "source":"padaxor-vitrine",
           "utm":{"utm_source":"instagram","utm_campaign":"lancamento"}}'
    -> {"ok":true}

---

## 3. CONTRATO FINAL DOS CAMPOS (FONTE DA VERDADE)

| Campo      | Obrigatorio          | Regras                                         |
|------------|----------------------|------------------------------------------------|
| tipo       | SIM                  | "paciente" ou "clinica" (OBRIGATORIO — sem ele: 400) |
| nome       | SIM                  | 3 a 120 caracteres                             |
| cpf        | SIM (nos dois tipos) | 11 digitos, mascara aceita, DV validado no servidor |
| cnpj       | SIM se tipo=clinica  | 14 digitos, mascara aceita, DV validado no servidor |
| telefone   | SIM                  | 10-11 digitos com DDD, mascara aceita          |
| source     | nao                  | ex.: "padaxor-vitrine"                         |
| rotaOrigem | nao                  | sinonimo de source (qualquer um dos dois)      |
| utm        | nao                  | so: utm_source, utm_medium, utm_campaign, utm_content, utm_term |

---

## 4. TABELA COMPLETA DE RESPOSTAS

| HTTP | Corpo                                                        | Quando                         |
|------|--------------------------------------------------------------|--------------------------------|
| 200  | {"ok":true}                                                  | Sucesso (ou reenvio do mesmo CPF — UPSERT) |
| 400  | {"error":"Tipo invalido. Use 'paciente' ou 'clinica'."}      | tipo ausente ou errado         |
| 400  | {"error":"Preencha o nome completo."}                        | nome ausente ou < 3 caracteres |
| 400  | {"error":"CPF invalido. Confira os 11 digitos."}             | DV errado ou sequencia repetida (ex.: 111.111.111-11) |
| 400  | {"error":"CNPJ invalido. Confira os 14 digitos."}            | so em tipo=clinica             |
| 400  | {"error":"Telefone invalido. Use DDD + numero."}             | fora de 10-11 digitos          |
| 401  | {"error":"Acesso restrito: faca login de colaborador"}       | GET /api/vitrine-leads sem token |
| 429  | {"error":"Muitas tentativas. Aguarde um minuto e tente de novo."} | mais de 10 envios/min por IP |

NAO existe: 409, access_token, expires_at, lead_id, codigos como INVALID_PHONE.
Exibir o campo "error" exatamente como veio — mensagem pronta em portugues.
Reenvio do mesmo CPF: 200 com atualizacao (acessos += 1). Proposital.

---

## 5. CORS

CORS ja esta liberado para https://padaxor.lovable.app (variavel ALLOWED_ORIGINS
atualizada no Railway hoje, 27/07/2026, pelo Dr. Replit via MCP).
Se voce ganhar dominio proprio (ex.: padaxor.com.br), avise para incluirmos.

---

## 6. LIBERACAO NO NAVEGADOR

Sem expiracao no servidor. Sem access_token. Sem sincronizacao com Supabase.
Grave uma chave no localStorage, uma por portao:

    localStorage.setItem("parxis.vitrine.acesso.paciente", "ok")
    localStorage.setItem("parxis.vitrine.acesso.clinica", "ok")

Se a chave existir, nao mostre o portao.
Portao de novo = limpar a chave e recarregar.

---

## 7. PROVA DE QUE TUDO FUNCIONA (11 TESTES RODADOS CONTRA O RAILWAY HOJE)

| Teste               | CPF / CNPJ       | Esperado | Resultado |
|---------------------|------------------|----------|-----------|
| Helena (paciente)   | 39269636208      | 200      | 200 PASS  |
| Otavio (paciente)   | 22239380438      | 200      | 200 PASS  |
| Beatriz (paciente)  | 80615080871      | 200      | 200 PASS  |
| Rafael (paciente)   | 20445342234      | 200      | 200 PASS  |
| Clinica Vitalis     | cnpj 13709931089173 | 200   | 200 PASS  |
| Nucleo Aureo        | cnpj 14910860833209 | 200   | 200 PASS  |
| Instituto Lumen     | cnpj 48457143774094 | 200   | 200 PASS  |
| CPF sequencia (111) | 11111111111      | 400      | 400 PASS  |
| CPF DV errado       | 12345678900      | 400      | 400 PASS  |
| CNPJ zeros          | 00000000000000   | 400      | 400 PASS  |
| Helena 2x (UPSERT)  | 39269636208      | 200      | 200 PASS  |
| GET sem token       | —                | 401      | 401 PASS  |

11 de 11 aprovados na producao Railway.

---

## 8. REGRA PERMANENTE

Este contrato so ADICIONA campos opcionais no futuro; nunca renomeia nem remove.
Mudanca chega por carta ANTES de ser publicada. Construa com confianca.

-- Dr. Replit Paxter
