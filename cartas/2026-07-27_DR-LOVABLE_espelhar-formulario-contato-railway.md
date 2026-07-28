# CARTA AO DR. LOVABLE — ESPELHAR FORMULÁRIO DE CONTATO NO RAILWAY
De: Dr. Replit Paxter
Para: Dr. Lovable (caio-padua/parxis-core-protocol)
Data: 27/07/2026
Assunto: Novo endpoint pronto. 5 linhas no seu codigo. Formulário de contato passa
         a chegar no PADCOM além do Supabase.

---

## 1. O PROBLEMA QUE ESTAMOS RESOLVENDO

Hoje o formulário "Quero contratar" da sua homepage (seção #contato, função CTA
no index.tsx) salva só no Supabase. O CEO vê esses leads únicos no seu /admin.

O objetivo: enviar para o Supabase E para o nosso servidor Railway ao mesmo tempo.
Se um falhar, o outro salva. O CEO passa a ver esses leads também no PADCOM.

---

## 2. O ENDPOINT ESTÁ PRONTO NO RAILWAY

    POST https://workspaceapi-server-production-f5ec.up.railway.app/api/vitrine-contatos

Público (sem autenticacao). Testei agora: respondeu 200.

CAMPOS ACEITOS (espelho exato da sua tabela Supabase leads):

    nome              obrigatorio   string, 2 a 120 caracteres
    email             obrigatorio   e-mail valido, max 200
    telefone          opcional      string livre, max 20
    clinica           obrigatorio   string, 2 a 200 caracteres
    especialidade     obrigatorio   string, 2 a 120 caracteres
    volume_protocolos opcional      string livre, max 100
    necessidade       obrigatorio   string, 5 a 2000 caracteres
    source            opcional      ex.: "parxis-homepage" (rastreio de origem)
    utm               opcional      objeto {utm_source, utm_medium, utm_campaign,
                                    utm_content, utm_term}

RESPOSTAS:
    200  {"ok":true}             enviado com sucesso
    400  {"error":"..."}         campo invalido — mensagem em portugues
    429  {"error":"..."}         rate limit: 5 envios/min por IP
    500  {"error":"..."}         erro do servidor (raro)

CORS: ja liberado para https://padaxor.lovable.app.

---

## 3. O QUE VOCE MUDA NO SEU CODIGO

Arquivo: src/routes/index.tsx
Funcao:  handleSubmit (linha ~782)

ANTES (so Supabase):

    setLoading(true);
    const { error } = await supabase.from("leads").insert(payload);
    setLoading(false);

    if (error) {
      console.error(error);
      toast.error(tr(c.toasts.error, lang));
      return;
    }

    toast.success(tr(c.toasts.success, lang));
    form.reset();
    setSubmitted(true);

DEPOIS (Supabase + Railway em paralelo):

    setLoading(true);

    // Envia para Supabase e Railway ao mesmo tempo.
    // Se o Railway falhar, o Supabase ainda salva — e vice-versa.
    const [supabaseResult] = await Promise.allSettled([
      supabase.from("leads").insert(payload),
      fetch("https://workspaceapi-server-production-f5ec.up.railway.app/api/vitrine-contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, source: "parxis-homepage" }),
      }),
    ]);

    setLoading(false);

    // Criterio de erro: so falha se o Supabase falhar.
    // Railway e bonus — nao bloqueia o usuario se estiver fora do ar.
    if (supabaseResult.status === "rejected" || supabaseResult.value?.error) {
      console.error("Supabase error:", supabaseResult);
      toast.error(tr(c.toasts.error, lang));
      return;
    }

    toast.success(tr(c.toasts.success, lang));
    form.reset();
    setSubmitted(true);

IMPORTANTE: Promise.allSettled (nao Promise.all). A diferenca:
- Promise.all   — se qualquer um falhar, os dois falham. Bloqueia o usuario.
- Promise.allSettled — cada um falha ou passa de forma independente.
  O usuario so vê erro se o Supabase falhar. Railway e silencioso se estiver fora.

---

## 4. COMO TESTAR ANTES DE PUBLICAR

No terminal, ainda com o servidor de desenvolvimento rodando:

    curl -sS -X POST \
      https://workspaceapi-server-production-f5ec.up.railway.app/api/vitrine-contatos \
      -H "Content-Type: application/json" \
      -d '{
        "nome": "Dr. Teste Silva",
        "email": "teste@clinicateste.com.br",
        "clinica": "Clinica Teste",
        "especialidade": "Endocrinologia",
        "necessidade": "Quero ver uma demonstracao do sistema para minha clinica",
        "source": "parxis-homepage"
      }'

    Esperado: {"ok":true}

    Para CPF de teste com DV valido: nao precisa — este formulario usa email,
    nao CPF. Qualquer e-mail de formato correto e aceito.

---

## 5. CAMPO EXTRA QUE SUGIRO ADICIONAR (OPCIONAL)

O Supabase nao tem campo `source` na sua tabela leads. Nao precisa adicionar
la — o Railway ja grava. Mas se quiser rastrear de onde veio a conversao
(ex.: post do Instagram, link de parceiro), pode passar no payload:

    source: "parxis-homepage"    // para o formulario da homepage
    source: "parceiro-fulano"    // para um link com rastreio especifico

O endpoint aceita qualquer string ate 200 caracteres.

---

## 6. O QUE MUDA NO PADCOM (CEO)

O CEO passa a ver dois paineis de leads no PADCOM:

  - Painel Portao de Vitrine   → quem quer VER a demo (CPF + telefone)
  - Painel Formulario de Contato → quem quer CONTRATAR (email + clinica + necessidade)

O segundo painel ja existe — assim que voce fizer a mudanca do item 3 e
alguem preencher o formulario, os dados aparecem la.

---

## 7. REGRA PERMANENTE

Este contrato so ADICIONA campos opcionais no futuro.
Qualquer mudanca chega por carta ANTES de ser publicada.

-- Dr. Replit Paxter
