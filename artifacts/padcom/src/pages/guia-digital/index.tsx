/**
 * /guia-digital — Manual do Cliente PaxMed (página PÚBLICA, mesma rota de sempre).
 *
 * Ensina: instalar o atalho (PWA), entrar na Área do Cliente, ativar o Telegram pelo link
 * individual gerado na Área (aba COMUNICAÇÃO) e conhecer o que a Área realmente oferece.
 * Identidade: PAXMED = sistema; a clínica entra com o nome próprio (?tenant=).
 * Áudio: Web Speech API nativa (pt-BR), sem custo e sem API externa.
 * Nada aqui envia mensagem: o envio do guia pela equipe continua em /comunicacao/guia-paciente.
 */

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Apple, Smartphone, Monitor, LogIn, MessageCircle, Sparkles, LayoutGrid, ShieldCheck,
  ChevronDown, ChevronUp, Volume2, VolumeX, Copy, CheckCheck, ExternalLink,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { useScreenTheme } from "@/components/theme/useScreenTheme";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  GuiaConfigContext, TELEGRAM_LINKS, detectDevice, registrarEvento, useGuiaConfigLoader,
} from "./config";

import { ExemploTelaBotao, type TipoExemplo } from "./ExemploTela";

type Aparelho = "iphone" | "android" | "desktop";

// ── Hook TTS — Web Speech API nativa (pt-BR, zero custo) ─────────────────────
function useTTS() {
  const [falando, setFalando] = useState(false);

  const falar = useCallback((texto: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(texto);
    utt.lang = "pt-BR";
    utt.rate = 0.85;
    utt.pitch = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const escolhida =
      voices.find((v) => /pt[-_]BR/i.test(v.lang)) ?? voices.find((v) => /^pt/i.test(v.lang));
    if (escolhida) utt.voice = escolhida;
    utt.onstart = () => setFalando(true);
    utt.onend = () => setFalando(false);
    utt.onerror = () => setFalando(false);
    window.speechSynthesis.speak(utt);
  }, []);

  const parar = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setFalando(false);
  }, []);

  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  return { falar, parar, falando };
}

function BotaoAudio({ texto, detalhe }: { texto: string; detalhe?: string }) {
  const { falar, parar, falando } = useTTS();
  const frase = detalhe ? `${texto}. ${detalhe}` : texto;
  return (
    <button
      type="button"
      data-testid="guia-audio"
      onClick={() => (falando ? parar() : falar(frase))}
      className={`bevel-3d shrink-0 w-9 h-9 flex items-center justify-center rounded-[4px] border-none bg-transparent cursor-pointer transition-opacity ${falando ? "opacity-100 bevel-3d-ok" : "opacity-60 hover:opacity-100"}`}
      title={falando ? "Parar áudio" : "Ouvir este trecho"}
      aria-label={falando ? "Parar áudio" : "Ouvir este trecho"}
    >
      {falando ? <VolumeX className="w-4 h-4 text-primary" /> : <Volume2 className="w-4 h-4 text-primary" />}
    </button>
  );
}

// ── Átomos visuais (sistema Paxter 3D) ───────────────────────────────────────
function Divisor() {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border/50" />
      <div className="w-1 h-1 rounded-full bg-accent/40" />
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

function Passo({ n, texto, detalhe, exemplo }: { n: number; texto: string; detalhe?: string; exemplo?: TipoExemplo }) {
  return (
    <div className="flex gap-3 items-start py-3 border-b border-border/25 last:border-0">
      <div className="screen-3d shrink-0 w-9 h-9 flex items-center justify-center text-sm font-black leading-none">{n}</div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="leva-q m-0 text-[1rem] font-semibold text-primary leading-snug">{texto}</p>
        {detalhe && <p className="leva-q m-0 text-[0.9rem] text-muted-foreground leading-relaxed">{detalhe}</p>}
      </div>
      {exemplo && <ExemploTelaBotao tipo={exemplo} />}
      <BotaoAudio texto={texto} detalhe={detalhe} />
    </div>
  );
}

function PlacaGrupo({ texto, primeiro = false }: { texto: string; primeiro?: boolean }) {
  return (
    <>
      {!primeiro && <Divisor />}
      <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest mb-3">{texto}</div>
    </>
  );
}

function Alerta({ tipo, texto, testId }: { tipo: "info" | "ok" | "aviso"; texto: string; testId?: string }) {
  const caixa =
    tipo === "ok" ? "bevel-3d bevel-3d-ok" : tipo === "aviso" ? "paxter-alert paxter-alert-amber" : "bevel-3d";
  const led =
    tipo === "ok" ? "paxter-led paxter-led-green" : tipo === "aviso" ? "paxter-led paxter-led-amber paxter-led-breathe" : "paxter-led paxter-led-breathe";
  return (
    <div data-testid={testId} className={`${caixa} flex gap-3 items-start px-4 py-3 my-3 rounded-[6px]`}>
      <span className={`${led} shrink-0 mt-1`} />
      <p className="leva-q m-0 text-[0.95rem] leading-relaxed flex-1">{texto}</p>
      <BotaoAudio texto={texto} />
    </div>
  );
}

function Secao({
  id, icon: Icon, titulo, subtitulo, aberta, onToggle, children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  subtitulo: string;
  aberta: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div id={id} data-testid={id} className={`panel-3d rounded-[8px] overflow-hidden ${aberta ? "panel-3d-active" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberta}
        className="w-full flex items-center gap-4 px-5 py-4 text-left border-none bg-transparent cursor-pointer min-h-[64px]"
      >
        <div className={`bevel-3d shrink-0 p-2 rounded-[5px] ${aberta ? "bevel-3d-ok" : ""}`}>
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="m-0 font-black uppercase tracking-widest text-primary leading-none" style={{ fontFamily: "'EB Garamond', Georgia, serif", fontWeight: 700, fontSize: "0.95rem" }}>
            {titulo}
          </p>
          <p className="leva-q m-0 mt-1 text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        {aberta ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {aberta && <div className="concave-3d mx-4 mb-4 rounded-[6px] px-5 py-4">{children}</div>}
    </div>
  );
}

// ── Endereço da Área (insert côncavo + copiar). Sem endereço configurado: aviso honesto. ──
function UrlInsert() {
  const { areaUrl } = useContext(GuiaConfigContext);
  const [copiado, setCopiado] = useState(false);
  if (!areaUrl) {
    return (
      <Alerta
        tipo="aviso"
        testId="guia-sem-endereco"
        texto="O endereço da Área do Cliente ainda não foi informado por esta clínica. Peça o link à clínica."
      />
    );
  }
  const copiar = () => {
    navigator.clipboard?.writeText(areaUrl).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  };
  return (
    <div className="flex items-stretch gap-2 mt-2 mb-3">
      <div data-testid="guia-url" className="concave-3d flex-1 px-3 py-2 text-[12px] font-mono text-primary/80 break-all rounded-[6px] cursor-pointer select-all leading-snug" onClick={copiar} title="Toque para copiar">
        {areaUrl}
      </div>
      <button type="button" onClick={copiar} className="btn-3d-soft shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-[5px] min-w-[52px]" title="Copiar endereço">
        {copiado ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        <span className="text-[9px] font-black uppercase tracking-wide">{copiado ? "Copiado" : "Copiar"}</span>
      </button>
    </div>
  );
}

function LinkOficial({ href, rotulo, testId }: { href: string; rotulo: string; testId: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className="btn-3d-soft flex items-center justify-between gap-2 px-4 py-3 rounded-[6px] text-[12px] font-black uppercase tracking-wide no-underline min-h-[48px]"
    >
      <span>{rotulo}</span>
      <ExternalLink className="w-4 h-4 shrink-0" />
    </a>
  );
}

// ── Conteúdo das seções ──────────────────────────────────────────────────────
function SecPaxmed() {
  const { clinicaNome, identidade } = useContext(GuiaConfigContext);
  const dona = identidade === "indisponivel" ? "sua clínica" : clinicaNome;
  return (
    <div>
      <Alerta
        tipo="info"
        texto={`O PaxMed é o sistema que organiza o seu cuidado com ${dona}. Ele é seu também: você acompanha seu tratamento, suas consultas e seus documentos pelo celular ou pelo computador.`}
      />
      <Alerta
        tipo="aviso"
        testId="guia-aviso-urgencia"
        texto="O Telegram e o PaxMed não são canal de emergência nem de consulta imediata. Em urgência, ligue 192 (SAMU) ou procure o pronto atendimento mais próximo."
      />
    </div>
  );
}

/** Icone oficial escolhido do Safari (modelo A), com linha fina de contorno para destacar do fundo claro. */
function SafariIcone() {
  const base = import.meta.env.BASE_URL;
  return (
    <div className="flex items-center justify-center my-3" data-testid="guia-safari-icone">
      <img src={`${base}safari/safari-a.png`} alt="Ícone do Safari: bússola azul com ponteiro vermelho"
        className="w-20 h-20 object-contain rounded-[22.5%]"
        style={{ boxShadow: "0 0 0 1px rgba(22,40,74,0.55)" }} />
    </div>
  );
}

function SecInstalar({ aparelho, onAparelho }: { aparelho: Aparelho; onAparelho: (a: Aparelho) => void }) {
  const { clinicaNome } = useContext(GuiaConfigContext);
  const abas: { k: Aparelho; r: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { k: "iphone", r: "iPhone", Icon: Apple },
    { k: "android", r: "Android", Icon: Smartphone },
    { k: "desktop", r: "Computador", Icon: Monitor },
  ];
  return (
    <div>
      <Alerta
        tipo="info"
        testId="guia-pwa-aviso"
        texto="Instalar aqui cria um atalho na tela inicial (aplicativo instalado pelo navegador, chamado PWA). Não é um aplicativo baixado na App Store ou na Play Store: o PaxMed não tem aplicativo de loja. Você também pode usar apenas o navegador, sem instalar."
      />
      <div role="tablist" className="grid grid-cols-3 gap-2 mb-3">
        {abas.map(({ k, r, Icon }) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={aparelho === k}
            data-testid={`guia-aba-${k}`}
            onClick={() => onAparelho(k)}
            className={`btn-3d-soft flex flex-col items-center gap-1 py-3 rounded-[6px] text-[11px] font-black uppercase tracking-wide min-h-[56px] ${aparelho === k ? "bevel-3d-ok" : ""}`}
          >
            <Icon className="w-4 h-4" />
            {r}
          </button>
        ))}
      </div>

      {aparelho === "iphone" && (
        <div data-testid="guia-painel-iphone">
          <Alerta tipo="aviso" texto="No iPhone, a instalação só funciona pelo Safari (ícone de bússola azul). Se estiver em outro navegador, abra o Safari primeiro." />
          <SafariIcone />
          <Passo n={1} texto="Abra o Safari e acesse o endereço da Área do Cliente:" detalhe="Se a clínica enviou o link, toque nele." />
          <UrlInsert />
          <Passo n={2} texto="Toque no botão Compartilhar, na barra inferior" detalhe="É um quadrado com uma seta para cima." exemplo="iphone-compartilhar" />
          <Passo n={3} texto="Role a lista e toque em Adicionar à Tela de Início" exemplo="iphone-lista" />
          <Passo n={4} texto="Toque em Adicionar, no canto superior direito" exemplo="iphone-adicionar" />
          <Alerta tipo="ok" texto={`Pronto. O atalho do PaxMed (${clinicaNome}) aparece na tela inicial.`} />
        </div>
      )}
      {aparelho === "android" && (
        <div data-testid="guia-painel-android">
          <Passo n={1} texto="Abra o Chrome e acesse o endereço da Área do Cliente:" detalhe="Se a clínica enviou o link, toque nele." />
          <UrlInsert />
          <Passo n={2} texto="Toque nos 3 pontinhos, no canto superior direito" exemplo="android-menu" />
          <Passo n={3} texto="Toque em Instalar aplicativo ou em Adicionar à tela inicial" detalhe="O nome da opção muda conforme o aparelho." exemplo="android-instalar" />
          <Passo n={4} texto="Confirme em Instalar ou Adicionar" exemplo="android-confirma" />
          <Alerta tipo="info" texto="Em outros navegadores (Samsung Internet, Firefox, Edge) o caminho é parecido: menu do navegador e depois Adicionar à tela inicial." />
          <Alerta tipo="ok" texto="Pronto. O atalho do PaxMed aparece na tela inicial." />
        </div>
      )}
      {aparelho === "desktop" && (
        <div data-testid="guia-painel-desktop">
          <Passo n={1} texto="No Chrome ou no Edge, acesse o endereço da Área do Cliente:" />
          <UrlInsert />
          <Passo n={2} texto="Procure o ícone de instalação no fim da barra de endereço" detalhe="Se não aparecer, abra o menu do navegador e procure Instalar ou Salvar e compartilhar." exemplo="desktop-icone" />
          <Passo n={3} texto="Clique em Instalar" />
          <Alerta tipo="info" texto="Em Firefox ou Safari não há instalação: use o endereço normalmente e salve nos Favoritos (Ctrl+D no Windows, Comando+D no Mac)." />
        </div>
      )}
    </div>
  );
}

function SecEntrar() {
  return (
    <div>
      <Passo n={1} texto="Abra a Área do Cliente pelo atalho ou pelo endereço:" />
      <UrlInsert />
      <Passo n={2} texto="Digite seu CPF, só os 11 números" />
      <Passo
        n={3}
        texto="Escolha como entrar"
        detalhe="Com a data de nascimento (dia, mês e ano), ou com senha. Para usar senha, toque em Entrar com senha, na própria tela."
      />
      <Passo n={4} texto="Toque em ENTRAR" />
      <Alerta
        tipo="info"
        texto="Se a clínica criou uma senha provisória para você, o sistema pede que você crie a sua própria na primeira entrada. Guarde-a só para você e não envie senha por mensagem."
      />
      <Alerta tipo="aviso" texto="Se não conseguir entrar, confira o CPF e a data. Persistindo, fale com a clínica." />
    </div>
  );
}

function SecTelegram() {
  const { clinicaNome, botHandle, botLink } = useContext(GuiaConfigContext);
  return (
    <div>
      <Alerta
        tipo="info"
        texto={`O Telegram é um aplicativo gratuito de mensagens. Quando ativado, você recebe os avisos de ${clinicaNome} por lá e pode escrever para a clínica.`}
      />

      <PlacaGrupo primeiro texto="1. Instale o Telegram (lojas oficiais)" />
      <div className="grid gap-2">
        <LinkOficial testId="guia-tg-appstore" href={TELEGRAM_LINKS.appStore} rotulo="iPhone: App Store" />
        <LinkOficial testId="guia-tg-playstore" href={TELEGRAM_LINKS.playStore} rotulo="Android: Google Play" />
        <LinkOficial testId="guia-tg-desktop" href={TELEGRAM_LINKS.desktop} rotulo="Computador: Telegram Desktop" />
        <LinkOficial testId="guia-tg-web" href={TELEGRAM_LINKS.web} rotulo="Sem instalar: Telegram Web" />
        <LinkOficial testId="guia-tg-apps" href={TELEGRAM_LINKS.todosOsApps} rotulo="Todas as versões: telegram.org/apps" />
      </div>
      <Passo n={1} texto="Crie sua conta com o número do seu celular" detalhe="O Telegram envia um código por SMS ou pelo próprio aplicativo." />

      <PlacaGrupo texto="2. Ative pelo seu link individual" />
      <Alerta
        tipo="ok"
        testId="guia-link-individual"
        texto="Seu link é gerado dentro da Área do Cliente, é só seu, vale uma única vez e por 7 dias. Gerar um novo link cancela o anterior. Não compartilhe com ninguém."
      />
      <Passo n={1} texto="Entre na Área do Cliente e abra a aba COMUNICAÇÃO" />
      <Passo n={2} texto="Toque em Gerar meu link para o Telegram" />
      <Passo n={3} texto="Toque em Abrir o Telegram e ativar" detalhe="O Telegram abre na conversa com o robô da clínica." />
      <Passo n={4} texto="No Telegram, toque em INICIAR (Start)" detalhe="Sem esse toque a ativação não acontece: o robô nunca inicia a conversa sozinho." />
      <Passo n={5} texto="Aguarde a mensagem de confirmação do robô" />
      <Alerta tipo="info" texto={`O robô da clínica é ${botHandle} (${botLink}). Procurá-lo pelo nome sem usar o seu link não ativa o vínculo. Se o link não abrir ou tiver vencido, volte à aba COMUNICAÇÃO e gere outro, ou peça ajuda à clínica.`} />

      <PlacaGrupo texto="3. Pelo computador" />
      <Passo n={1} texto="Abra o Telegram Desktop ou web.telegram.org e entre com o mesmo número" />
      <Passo n={2} texto="Na Área do Cliente (no navegador do computador), gere o link e abra" detalhe="O link abre o Telegram do computador na conversa com o robô. Toque em INICIAR." />

      <Alerta
        tipo="aviso"
        testId="guia-tg-urgencia"
        texto="O Telegram não substitui atendimento de urgência. As mensagens são respondidas pela equipe no horário da clínica. Em emergência, ligue 192 (SAMU)."
      />
    </div>
  );
}

function SecModulos() {
  const itens: [string, string][] = [
    ["Protocolos", "acompanhe seus protocolos e o andamento das sessões."],
    ["Agenda", "veja suas próximas consultas e sessões."],
    ["Documentos", "consulte os documentos que a clínica disponibilizou para você."],
    ["Upload de exames", "envie seus exames para a clínica e acompanhe a conferência."],
    ["Evolução", "veja a evolução dos seus exames."],
    ["Minhas fotos", "suas fotos de evolução, vistas só por você e pela equipe autorizada."],
    ["Comunicação", "ative o Telegram para receber os avisos da clínica."],
  ];
  return (
    <div>
      <Alerta tipo="info" texto="Estes são os recursos que existem hoje na Área do Cliente. Alguns itens dependem do que a clínica liberou para você." />
      <ul className="m-0 p-0 list-none space-y-2" data-testid="guia-modulos">
        {itens.map(([t, d]) => (
          <li key={t} className="flex gap-3 items-start">
            <span className="paxter-led paxter-led-green shrink-0 mt-2" />
            <p className="leva-q m-0 text-[0.95rem] leading-relaxed"><strong>{t}:</strong> {d}</p>
          </li>
        ))}
      </ul>
      <Alerta tipo="info" texto="Avisos da clínica chegam pelo canal que você ativou e autorizou." />
    </div>
  );
}

function SecPessoal() {
  return (
    <div data-testid="guia-pessoal">
      <div className="paxter-alert paxter-alert-amber inline-block px-3 py-1 rounded-[4px] text-[11px] font-black uppercase tracking-widest mb-3">
        Em preparação — ainda não disponível
      </div>
      <p className="leva-q m-0 text-[0.95rem] leading-relaxed">
        Estamos preparando um espaço seu, separado do tratamento na clínica. A ideia, para o futuro:
      </p>
      <ul className="leva-q mt-2 mb-3 pl-5 text-[0.95rem] leading-relaxed space-y-1">
        <li>cadastrar os seus medicamentos, inclusive os indicados por outros médicos;</li>
        <li>criar lembretes e uma rotina só sua;</li>
        <li>ter um plano pessoal, independente do tratamento da clínica.</li>
      </ul>
      <Alerta tipo="aviso" texto="Nada disso funciona ainda. Não há cadastro, lembrete pessoal nem plano pessoal disponíveis hoje. Avisaremos quando existir." />
    </div>
  );
}

function SecPrivacidade() {
  const { clinicaNome } = useContext(GuiaConfigContext);
  return (
    <div>
      <Alerta tipo="info" texto="A Área do Cliente só abre com o seu CPF e a sua data de nascimento ou senha. Não compartilhe esse acesso." />
      <Alerta tipo="info" texto="Seu link do Telegram é individual, de uso único e vale 7 dias." />
      <Alerta tipo="aviso" texto={`Não envie senhas, números de cartão nem documentos pelo Telegram. Para qualquer dúvida sobre seus dados, fale com ${clinicaNome}.`} />
    </div>
  );
}

// ── QR da página ─────────────────────────────────────────────────────────────
function MiniQRHeader({ url }: { url: string }) {
  return (
    <div data-testid="guia-qr" className="bevel-3d rounded-[6px] p-1.5 shrink-0" title="Aponte a câmera do celular para abrir este manual no celular">
      <QRCodeSVG value={url} size={34} fgColor="#1a2744" bgColor="#f3ecdd" level="L" />
    </div>
  );
}

const SECOES = [
  { id: "sec-paxmed", key: "paxmed", icon: Sparkles, titulo: "O PaxMed para você", subtitulo: "O que é e o que ele não é" },
  { id: "sec-instalar", key: "instalar", icon: Smartphone, titulo: "Instalar o App PaxMed", subtitulo: "iPhone, Android ou computador" },
  { id: "sec-entrar", key: "entrar", icon: LogIn, titulo: "Entrar na Área", subtitulo: "CPF com data de nascimento ou senha" },
  { id: "sec-telegram", key: "telegram", icon: MessageCircle, titulo: "Ativar o Telegram", subtitulo: "Link individual, de uso único" },
  { id: "sec-modulos", key: "modulos", icon: LayoutGrid, titulo: "O que a Área oferece", subtitulo: "Recursos que existem hoje" },
  { id: "sec-pessoal", key: "pessoal", icon: Sparkles, titulo: "Meu PaxMed Pessoal", subtitulo: "Em preparação — ainda não disponível" },
  { id: "sec-privacidade", key: "privacidade", icon: ShieldCheck, titulo: "Privacidade e segurança", subtitulo: "Cuidados simples" },
] as const;

type SecKey = (typeof SECOES)[number]["key"];

// A API só registra estes eventos; as demais seções não geram evento.
const EVENTO_POR_SECAO: Partial<Record<SecKey, string>> = { entrar: "login", telegram: "telegram" };

export default function GuiaDigital() {
  const detectado = detectDevice();
  const config = useGuiaConfigLoader();
  const { theme, toggle: toggleTheme } = useScreenTheme();
  const themeClass = theme === "dark" ? "dark" : "";
  const [aparelho, setAparelho] = useState<Aparelho>(detectado);
  const resumoTTS = useTTS();
  const iniciou = useRef(false);

  const [aberta, setAberta] = useState<Record<SecKey, boolean>>({
    paxmed: true, instalar: true, entrar: false, telegram: true, modulos: false, pessoal: false, privacidade: false,
  });

  const escolherAparelho = (a: Aparelho) => {
    setAparelho(a);
    registrarEvento(a, a === "desktop" ? "computador" : a);
  };

  const toggle = (key: SecKey) => {
    const ev = EVENTO_POR_SECAO[key];
    if (!aberta[key] && ev) registrarEvento(detectado, ev);
    setAberta((p) => ({ ...p, [key]: !p[key] }));
  };

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    registrarEvento(detectado, detectado === "desktop" ? "computador" : detectado);
    registrarEvento(detectado, "telegram");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navegar = (id: string, key: SecKey) => {
    setAberta((p) => ({ ...p, [key]: true }));
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const conteudo: Record<SecKey, React.ReactNode> = {
    paxmed: <SecPaxmed />,
    instalar: <SecInstalar aparelho={aparelho} onAparelho={escolherAparelho} />,
    entrar: <SecEntrar />,
    telegram: <SecTelegram />,
    modulos: <SecModulos />,
    pessoal: <SecPessoal />,
    privacidade: <SecPrivacidade />,
  };

  const guiaUrl = window.location.href;
  const nomeClinica = config.identidade === "ok" ? config.clinicaNome : "";
  const resumo =
    "Manual do Cliente PaxMed. Aqui você aprende a instalar o App PaxMed, entrar na Área do Cliente e ativar o Telegram pelo seu link individual. O Telegram não é canal de emergência. Em urgência, ligue 192.";

  return (
    <GuiaConfigContext.Provider value={config}>
      <div
        data-testid="guia-raiz"
        className={`${themeClass} guia-digital relative`}
        style={{
          minHeight: "100vh",
          background: theme === "dark" ? "linear-gradient(160deg,#0b1e3a 0%,#0e2244 55%,#122a50 100%)" : "#f3ecdd",
        }}
      >
        <div className="leva-fabric" aria-hidden="true" />
        <div className="relative z-[1] flex flex-col min-h-screen">
          {/* Cabeçalho: marca PAXMED em destaque */}
          <header className="panel-3d sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div className="flex items-center gap-3 min-w-0">
              <PaxterSymbolGlass size={44} tone={theme === "dark" ? "dark" : "light"} sharp />
              <div className="min-w-0">
                <p data-testid="guia-marca" className="m-0 text-[26px] font-bold tracking-[0.16em] uppercase leading-none text-primary" style={{ fontFamily: "'EB Garamond', Georgia, serif" }}>
                  PaxMed
                </p>
                <p className="m-0 mt-1 text-accent truncate" style={{ fontFamily: "'EB Garamond', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.1em" }}>
                  Manual do Cliente{nomeClinica ? ` · ${nomeClinica}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <MiniQRHeader url={guiaUrl} />
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </header>

          {/* Navegação rápida */}
          <nav className="px-3 py-2.5 border-b border-border/40 bg-card/80" aria-label="Seções do manual">
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 max-w-3xl mx-auto">
              {SECOES.map(({ id, key, icon: Icon, titulo }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => navegar(id, key)}
                  className="btn-3d-soft flex flex-col items-center justify-center gap-1 py-2 px-1 text-[10px] font-black uppercase tracking-wide rounded-[5px] min-h-[48px]"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate w-full text-center leading-none">{titulo.split(" ").slice(-1)[0]}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="max-w-xl mx-auto px-4 py-5 space-y-4 w-full">
            {config.identidade === "indisponivel" && (
              <Alerta tipo="aviso" testId="guia-tenant-indisponivel" texto="Não encontramos a clínica deste link. Peça um novo link à sua clínica. As orientações gerais abaixo continuam valendo." />
            )}

            <div className="panel-3d rounded-[8px] px-5 py-4 space-y-2">
              <p className="m-0 text-[11px] font-black uppercase tracking-widest text-primary">Comece por aqui</p>
              <p className="leva-q m-0 text-[1rem] leading-relaxed">
                Este manual explica, passo a passo, como usar o PaxMed{nomeClinica ? ` com ${nomeClinica}` : ""}. Toque em
                {" "}<Volume2 className="inline w-4 h-4 mx-0.5 opacity-70" /> para ouvir qualquer trecho em voz alta.
              </p>
              <button
                type="button"
                data-testid="guia-ouvir-resumo"
                onClick={() => (resumoTTS.falando ? resumoTTS.parar() : resumoTTS.falar(resumo))}
                className="btn-3d-soft flex items-center gap-2 px-4 py-3 rounded-[6px] text-[12px] font-black uppercase tracking-wide min-h-[48px]"
              >
                {resumoTTS.falando ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {resumoTTS.falando ? "Parar" : "Ouvir o resumo"}
              </button>
            </div>

            {SECOES.map(({ id, key, icon, titulo, subtitulo }) => (
              <Secao key={key} id={id} icon={icon} titulo={titulo} subtitulo={subtitulo} aberta={aberta[key]} onToggle={() => toggle(key)}>
                {conteudo[key]}
              </Secao>
            ))}

            <div className="panel-3d rounded-[8px] overflow-hidden">
              <div className="login-card-topbar px-5 py-2.5 flex items-center justify-center border-b border-border/60">
                <p className="m-0 text-accent font-black uppercase tracking-widest text-center" style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "0.9rem" }}>
                  Ficou com dúvida?
                </p>
              </div>
              <div className="login-card-body px-5 py-5 text-center space-y-3">
                <p className="m-0 text-[0.95rem] leading-relaxed text-foreground/80">
                  {nomeClinica ? `Fale com ${nomeClinica}` : "Fale com a sua clínica"} pelo canal que ela informou a você.
                </p>
                <div className="h-px bg-border/40" />
                <p className="m-0 text-accent/60 text-[0.7rem] uppercase tracking-widest">PaxMed — o sistema do cliente</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GuiaConfigContext.Provider>
  );
}
