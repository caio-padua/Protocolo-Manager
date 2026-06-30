import React, { useState } from 'react';
import { ChevronRight, Check, MapPin, Calendar, Clock, CreditCard, Lock, Sparkles, Moon, Sun } from 'lucide-react';
import SYMBOL_GOLD from '../../../assets/paxter-symbol-gold.png';

export default function MinimalLuxo() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [motivo, setMotivo] = useState<string>('');
  const [diaPreferencia, setDiaPreferencia] = useState<string>('');
  const [periodo, setPeriodo] = useState<string>('');
  
  const isDark = theme === 'dark';

  return (
    <div className={`relative min-h-[100dvh] w-full max-w-[430px] mx-auto overflow-x-hidden flex flex-col font-sans transition-colors duration-500 ${isDark ? 'bg-[#060b14] text-stone-300' : 'bg-[#f7f5f0] text-[#16284a]'}`}>
      <style>{`
        .bg-navy-deep { background-color: #060b14; }
        .text-gold {
          background: linear-gradient(135deg, #f4e2a8 0%, #c2a05a 50%, #8a6d2f 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .bg-gold-gradient {
          background: linear-gradient(135deg, #f4e2a8 0%, #c2a05a 50%, #8a6d2f 100%);
        }
        .border-gold-thin {
          border-color: rgba(194, 160, 90, 0.2);
        }
        .border-gold-active {
          border-color: rgba(194, 160, 90, 0.6);
        }
        
        .input-minimal {
          background: transparent;
          border: none;
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(22,40,74,0.1)'};
          border-radius: 0;
          padding: 8px 0;
          font-size: 14px;
          color: inherit;
          width: 100%;
          outline: none;
          transition: border-color 0.3s;
        }
        .input-minimal:focus {
          border-bottom-color: #c2a05a;
        }
        .input-minimal::placeholder {
          color: ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(22,40,74,0.3)'};
          font-weight: 300;
        }

        .chip-minimal {
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(22,40,74,0.1)'};
          background: transparent;
          color: ${isDark ? '#a8a29e' : '#575f6e'};
          border-radius: 2px;
          transition: all 0.2s;
        }
        .chip-minimal[data-active="true"] {
          border-color: #c2a05a;
          color: ${isDark ? '#f4e2a8' : '#8a6d2f'};
          background: ${isDark ? 'rgba(194, 160, 90, 0.05)' : 'rgba(194, 160, 90, 0.08)'};
        }

        .btn-concierge {
          background: linear-gradient(135deg, #111d33 0%, #0b1320 100%);
          border: 1px solid rgba(194, 160, 90, 0.4);
          color: #f4e2a8;
          transition: all 0.3s ease;
          border-radius: 2px;
        }
        .btn-concierge:active {
          transform: scale(0.98);
        }
        
        .btn-common {
          background: transparent;
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(22,40,74,0.2)'};
          color: ${isDark ? '#d6d3d1' : '#16284a'};
          border-radius: 2px;
        }

        .glass-header {
          background: ${isDark ? 'rgba(6, 11, 20, 0.85)' : 'rgba(247, 245, 240, 0.85)'};
          backdrop-filter: blur(8px);
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(22,40,74,0.05)'};
        }
      `}</style>

      {/* HEADER */}
      <header className="sticky top-0 z-50 glass-header px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={SYMBOL_GOLD} alt="" className="w-8 h-8 object-contain" aria-hidden="true" />
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-[0.2em] text-gold uppercase">Paxter</span>
          </div>
        </div>
        <button 
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={`w-8 h-8 flex items-center justify-center border ${isDark ? 'border-white/10 text-stone-400' : 'border-[#16284a]/10 text-[#16284a]'} rounded-sm`}
          aria-label="Alternar tema"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </header>

      <main className="flex flex-col px-6 py-8 gap-12">
        {/* INTRO */}
        <section className="flex flex-col gap-3">
          <h1 className={`text-2xl font-light tracking-wide ${isDark ? 'text-white' : 'text-[#16284a]'}`}>
            Solicitação de <br/>
            <span className="text-gold font-medium">Atendimento</span>
          </h1>
          <p className={`text-xs uppercase tracking-widest ${isDark ? 'text-stone-500' : 'text-[#16284a]/60'} leading-relaxed`}>
            Dr. Caio Pádua — Medicina Estética
          </p>
        </section>

        {/* IDENTIFICAÇÃO */}
        <section className="flex flex-col gap-6">
          <h2 className="text-[10px] font-semibold tracking-[0.15em] text-gold uppercase border-b border-gold-thin pb-2">Identificação</h2>
          <div className="flex flex-col gap-5">
            <div>
              <input type="text" id="nome" className="input-minimal" placeholder="Nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <input type="tel" id="telefone" className="input-minimal" placeholder="WhatsApp" />
              </div>
              <div>
                <input type="text" id="cpf" className="input-minimal" placeholder="CPF" />
              </div>
            </div>
            <div>
              <input type="email" id="email" className="input-minimal" placeholder="E-mail" />
            </div>
          </div>
        </section>

        {/* INTERESSE */}
        <section className="flex flex-col gap-6">
          <h2 className="text-[10px] font-semibold tracking-[0.15em] text-gold uppercase border-b border-gold-thin pb-2">Seu Desejo</h2>
          <div className="flex flex-col gap-3">
            <label className={`text-xs ${isDark ? 'text-stone-400' : 'text-[#16284a]/70'}`}>O que você busca?</label>
            <div className="flex flex-wrap gap-2">
              {['Rejuvenescimento', 'Harmonização', 'Toxina Botulínica', 'Avaliação Completa'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setMotivo(opt)}
                  data-active={motivo === opt}
                  className="chip-minimal px-3 py-1.5 text-[11px] uppercase tracking-wider"
                >
                  {opt}
                </button>
              ))}
            </div>
            <input type="text" className="input-minimal mt-2" placeholder="Outro motivo (opcional)" />
          </div>
        </section>

        {/* DISPONIBILIDADE E AVISO */}
        <section className="flex flex-col gap-6">
          <h2 className="text-[10px] font-semibold tracking-[0.15em] text-gold uppercase border-b border-gold-thin pb-2">Disponibilidade</h2>
          
          <div className={`p-4 border ${isDark ? 'border-white/5 bg-white/5' : 'border-[#16284a]/10 bg-[#16284a]/5'} rounded-sm flex items-start gap-3`}>
            <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${isDark ? 'text-stone-400' : 'text-[#16284a]/60'}`} />
            <div className="flex flex-col gap-1">
              <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-stone-300' : 'text-[#16284a]'}`}>Agenda Concorrida</span>
              <p className={`text-[11px] leading-relaxed ${isDark ? 'text-stone-400' : 'text-[#16284a]/70'}`}>
                Devido à alta demanda, as próximas datas para primeira consulta iniciam a partir de <strong>~3 meses</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <label className={`text-xs ${isDark ? 'text-stone-400' : 'text-[#16284a]/70'}`}>Dia da semana</label>
              <div className="flex flex-col gap-1.5">
                {['Qualquer dia', 'Seg a Qua', 'Qui a Sex'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setDiaPreferencia(opt)}
                    data-active={diaPreferencia === opt}
                    className="chip-minimal text-left px-3 py-2 text-[11px] tracking-wider"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <label className={`text-xs ${isDark ? 'text-stone-400' : 'text-[#16284a]/70'}`}>Período</label>
              <div className="flex flex-col gap-1.5">
                {['Manhã', 'Tarde', 'Noite'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setPeriodo(opt)}
                    data-active={periodo === opt}
                    className="chip-minimal text-left px-3 py-2 text-[11px] tracking-wider"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CAMINHOS */}
        <section className="flex flex-col gap-6 mt-4">
          <h2 className="text-[10px] font-semibold tracking-[0.15em] text-gold uppercase border-b border-gold-thin pb-2">Escolha seu caminho</h2>
          
          <div className="flex flex-col gap-4">
            {/* Caminho A */}
            <div className="btn-concierge p-5 flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gold-gradient opacity-80" />
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#c2a05a] font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Exclusivo
                  </span>
                  <h3 className="text-base font-medium text-white mt-1">Via Concierge</h3>
                  <p className="text-[11px] text-stone-400 mt-1 pr-4">Garanta um encaixe prioritário nas próximas semanas.</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-stone-400 uppercase tracking-widest block mb-0.5">Reserva</span>
                  <span className="text-lg font-light text-[#f4e2a8]">R$ 150</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 text-[10px] text-stone-400 uppercase tracking-wider">
                  <CreditCard className="w-3 h-3" /> Pix · Cartão · Boleto
                </div>
                <div className="flex-1" />
                <button className="flex items-center gap-1 text-[11px] text-gold font-medium uppercase tracking-wider">
                  Antecipar <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[9px] text-stone-500 uppercase tracking-widest text-center mt-1">
                <Lock className="w-2 h-2 inline-block mr-1 -mt-0.5" /> 20% do valor total (R$ 750)
              </p>
            </div>

            {/* Caminho B */}
            <div className="btn-common p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium">Fila Comum</h3>
                  <p className={`text-[11px] pr-4 ${isDark ? 'text-stone-400' : 'text-[#16284a]/70'}`}>Aguarde a abertura de novos horários regulares. Sem custo de reserva.</p>
                </div>
              </div>
              <div className={`pt-3 border-t flex justify-end ${isDark ? 'border-white/10' : 'border-[#16284a]/10'}`}>
                <button className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider ${isDark ? 'text-stone-300' : 'text-[#16284a]'}`}>
                  Entrar na fila <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className={`mt-auto border-t py-8 px-6 flex flex-col gap-2 ${isDark ? 'border-white/10' : 'border-[#16284a]/10'}`}>
        <div className="flex items-start gap-3">
          <MapPin className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-stone-500' : 'text-[#16284a]/50'}`} />
          <div className="flex flex-col gap-0.5">
            <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-stone-300' : 'text-[#16284a]'}`}>Instituto Pádua</span>
            <span className={`text-[10px] ${isDark ? 'text-stone-500' : 'text-[#16284a]/60'}`}>Rua Guaxupé, 327 — Vila Formosa<br/>São Paulo, SP</span>
          </div>
        </div>
        <div className="text-center mt-6">
          <span className={`text-[9px] uppercase tracking-[0.2em] ${isDark ? 'text-stone-600' : 'text-[#16284a]/40'}`}>
            Desenvolvido pela Padcon
          </span>
        </div>
      </footer>
    </div>
  );
}
