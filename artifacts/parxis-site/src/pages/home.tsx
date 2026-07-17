import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Activity, Calendar, ShieldCheck, HardDrive, MessageSquare, UserCircle, XCircle } from "lucide-react";
import { ParxisWordmark } from "@/components/brand/ParxisWordmark";

export default function Home() {
  const WHATSAPP_URL = "https://wa.me/5511999999999?text=Quero%20conhecer%20o%20Parxis";

  return (
    <div className="min-h-screen bg-background text-foreground bg-gradient-mesh selection:bg-primary selection:text-primary-foreground font-sans overflow-x-hidden">
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-panel border-b border-white/5">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center">
            <ParxisWordmark width={110} />
          </div>
          <a 
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-2 px-6 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded text-sm font-medium transition-colors"
          >
            Falar com Especialista
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 md:pt-52 md:pb-32 px-6 relative">
        <div className="container mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="lg:w-1/2 flex flex-col items-start text-left"
            >
              <ParxisWordmark width={340} className="mb-4" />
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 mb-6">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
                <span className="text-secondary text-xs font-semibold tracking-wider uppercase">Motor Clínico para Protocolos Injetáveis</span>
              </div>
              <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
                A espinha dorsal da sua <span className="text-gradient-cyan">clínica de alta performance.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed">
                Automatize desde a prescrição até a assinatura digital do RAS. O Parxis é o instrumento definitivo para clínicas que administram vitaminas, hormônios e protocolos de longevidade.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <a 
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-base font-semibold transition-all shadow-[0_0_30px_hsla(190,90%,50%,0.3)] hover:shadow-[0_0_40px_hsla(190,90%,50%,0.5)]"
                >
                  Agendar Demonstração
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="lg:w-1/2 relative w-full"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent blur-3xl -z-10 rounded-full"></div>
              <img 
                src={`${import.meta.env.BASE_URL}hero-dashboard.png`} 
                alt="Interface do Parxis Dashboard" 
                className="w-full rounded border border-white/10 shadow-2xl shadow-black/50"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-24 bg-card/50 border-y border-white/5 relative">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-6">A gestão clínica amadora custa caro.</h2>
            <p className="text-muted-foreground text-lg">O crescimento da sua clínica de injetáveis está sendo estrangulado por processos manuais que geram risco legal e perda de faturamento.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Controle em Papel", desc: "Protocolos registrados em cadernos e planilhas desconexas, sem rastreabilidade de substâncias." },
              { title: "Risco Legal (Sem RAS)", desc: "Administração de injetáveis sem o Registro de Assistência Sistêmica com validade jurídica." },
              { title: "Sem Prontuário Digital", desc: "Histórico do paciente espalhado entre WhatsApp, pastas físicas e sistemas genéricos." },
              { title: "Comunicação Quebrada", desc: "Pacientes esquecem sessões ou não recebem as orientações pós-aplicação." },
              { title: "Desorganização de Exames", desc: "Laudos perdidos no WhatsApp e dificuldade de comparar evolução clínica." },
              { title: "Caos na Agenda", desc: "Salas de aplicação ociosas por falta de gestão do ciclo completo do protocolo." }
            ].map((point, i) => (
              <div key={i} className="glass-panel p-8 rounded border border-red-500/10 hover:border-red-500/30 transition-colors">
                <XCircle className="w-8 h-8 text-red-500 mb-4 opacity-70" />
                <h3 className="text-xl font-semibold mb-3 text-white">{point.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{point.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-32 relative">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6">Engenharia Clínica <span className="text-gradient-gold">Definitiva</span></h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Um ecossistema completo desenhado especificamente para as necessidades operacionais e legais de clínicas de terapias injetáveis.</p>
          </div>

          <div className="space-y-32">
            {/* Feature 1 */}
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
              <div className="lg:w-1/2">
                <img src={`${import.meta.env.BASE_URL}protocol-builder.png`} alt="Construtor de Protocolos" className="rounded border border-white/10 shadow-xl" />
              </div>
              <div className="lg:w-1/2">
                <div className="w-12 h-12 rounded flex items-center justify-center bg-primary/10 mb-6">
                  <Activity className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-serif text-3xl font-bold mb-4">Protocolo Digital</h3>
                <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                  Construa protocolos complexos em segundos. Adicione até 10 substâncias por protocolo, com cálculo automático de dosagem, vias de administração e diluição. Salve templates de performance, longevidade e estética para uso rápido.
                </p>
                <ul className="space-y-3">
                  {['Biblioteca de substâncias pré-cadastrada', 'Cálculo inteligente de osmolaridade', 'Precificação vinculada ao protocolo'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-white/80">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-20">
              <div className="lg:w-1/2">
                <img src={`${import.meta.env.BASE_URL}schedule-ui.png`} alt="Agenda Semanal" className="rounded border border-white/10 shadow-xl" />
              </div>
              <div className="lg:w-1/2">
                <div className="w-12 h-12 rounded flex items-center justify-center bg-secondary/10 mb-6">
                  <Calendar className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="font-serif text-3xl font-bold mb-4">Agenda Semanal Inteligente</h3>
                <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                  Uma visão orquestrada da sua operação. Cards com codificação de cores para identificar rapidamente o status de cada sessão, ocupação de salas de aplicação (boxes) e alocação da equipe de enfermagem.
                </p>
                <ul className="space-y-3">
                  {['Gestão de poltronas/boxes de aplicação', 'Controle de tempo estimado por via', 'Status em tempo real da infusão'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-white/80">
                      <CheckCircle2 className="w-5 h-5 text-secondary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
              <div className="lg:w-1/2">
                <img src={`${import.meta.env.BASE_URL}document-signing.png`} alt="Assinatura RAS" className="rounded border border-white/10 shadow-xl" />
              </div>
              <div className="lg:w-1/2">
                <div className="w-12 h-12 rounded flex items-center justify-center bg-primary/10 mb-6">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-serif text-3xl font-bold mb-4">RAS com Assinatura ICP-Brasil</h3>
                <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                  Segurança jurídica inquestionável. Geração automática do Registro de Assistência Sistêmica com assinatura digital qualificada ICP-Brasil. Cada administração de injetável perfeitamente documentada e legalmente blindada.
                </p>
                <ul className="space-y-3">
                  {['Carimbo de tempo oficial', 'Conformidade com Anvisa e CFM', 'Rastreabilidade de lote e validade'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-white/80">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          
          {/* Minor Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mt-32">
            <div className="glass-panel p-8 rounded border-t-2 border-t-primary">
              <HardDrive className="w-8 h-8 text-primary mb-4" />
              <h4 className="text-xl font-bold mb-3 text-white">Integração Google Drive</h4>
              <p className="text-muted-foreground">O sistema cria e organiza automaticamente pastas para cada paciente no Drive da clínica, arquivando exames, contratos e termos assinados.</p>
            </div>
            <div className="glass-panel p-8 rounded border-t-2 border-t-secondary">
              <MessageSquare className="w-8 h-8 text-secondary mb-4" />
              <h4 className="text-xl font-bold mb-3 text-white">Comunicação Automatizada</h4>
              <p className="text-muted-foreground">Disparos por WhatsApp e Email com lembretes de sessão, orientações pré/pós-infusão e envio de códigos de validação de acesso.</p>
            </div>
            <div className="glass-panel p-8 rounded border-t-2 border-t-primary">
              <UserCircle className="w-8 h-8 text-primary mb-4" />
              <h4 className="text-xl font-bold mb-3 text-white">Área do Paciente</h4>
              <p className="text-muted-foreground">Portal exclusivo para o paciente acompanhar a evolução do seu protocolo, visualizar sessões agendadas e fazer o upload de exames laboratoriais.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-card/80 border-y border-white/5">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">Mecânica Operacional</h2>
            <p className="text-muted-foreground text-lg">Um fluxo perfeitamente orquestrado, sem atritos.</p>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between relative">
            <div className="hidden md:block absolute top-12 left-0 w-full h-px bg-white/10 z-0"></div>
            
            {[
              { step: "01", title: "Setup", desc: "Clínica contrata e o sistema é configurado em 24h." },
              { step: "02", title: "Prescrição", desc: "Protocolo criado e precificado em minutos." },
              { step: "03", title: "Portal", desc: "Paciente recebe acesso automaticamente." },
              { step: "04", title: "Infusão", desc: "RAS gerado e assinado digitalmente." },
              { step: "05", title: "Arquivo", desc: "Drive organizado automaticamente." }
            ].map((s, i) => (
              <div key={i} className="relative z-10 flex flex-col items-center text-center px-4 mb-10 md:mb-0 w-full md:w-1/5">
                <div className="w-24 h-24 rounded-full bg-card border border-white/10 flex items-center justify-center mb-6 shadow-xl shadow-black/50">
                  <span className="font-serif text-2xl font-bold text-white/50">{s.step}</span>
                </div>
                <h4 className="text-lg font-bold text-white mb-2">{s.title}</h4>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="py-32 relative">
        <div className="container mx-auto px-6">
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-center mb-20">Para quem é o Parxis?</h2>
          
          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            <div className="glass-panel p-10 rounded border-t-4 border-t-primary">
              <h3 className="text-2xl font-bold mb-6 text-white flex items-center gap-3">
                <CheckCircle2 className="text-primary w-6 h-6" />
                Ideal Para
              </h3>
              <ul className="space-y-4">
                {[
                  "Clínicas de Medicina Estética avançada",
                  "Centros de Longevidade e Anti-aging",
                  "Clínicas de Performance Esportiva",
                  "Médicos que prescrevem reposição hormonal",
                  "Clínicas com volume alto de terapias intravenosas"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0"></div>
                    <span className="text-lg">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="glass-panel p-10 rounded border-t-4 border-t-muted">
              <h3 className="text-2xl font-bold mb-6 text-white/50 flex items-center gap-3">
                <XCircle className="text-muted-foreground w-6 h-6" />
                Não Recomendado Para
              </h3>
              <ul className="space-y-4">
                {[
                  "Clínicas gerais sem foco em injetáveis",
                  "Consultórios que não realizam procedimentos in-house",
                  "Operações 100% analógicas e resistentes ao digital",
                  "Clínicas populares focadas apenas em volume/preço baixo"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-muted-foreground/60">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted mt-2 shrink-0"></div>
                    <span className="text-lg">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 blur-[120px] rounded-full mix-blend-screen pointer-events-none"></div>
        
        <div className="container mx-auto px-6 relative z-10 text-center">
          <h2 className="font-serif text-5xl md:text-6xl font-bold mb-8 text-white">Eleve o padrão da sua operação.</h2>
          <p className="text-xl text-primary/80 mb-12 max-w-2xl mx-auto">Agende uma demonstração executiva e descubra como o Parxis transforma a complexidade clínica em precisão sistêmica.</p>
          
          <a 
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-3 px-10 py-5 bg-white text-background hover:bg-white/90 rounded text-lg font-bold transition-all shadow-2xl"
          >
            Falar com Especialista
            <ChevronRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 bg-background">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center opacity-50">
            <ParxisWordmark width={80} />
          </div>
          
          <div className="text-muted-foreground/60 text-sm flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <span>Parxis by PADCOM</span>
            <span className="hidden md:inline">•</span>
            <span>parxis.com.br</span>
            <span className="hidden md:inline">•</span>
            <a href="mailto:contato@parxis.com.br" className="hover:text-primary transition-colors">contato@parxis.com.br</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
