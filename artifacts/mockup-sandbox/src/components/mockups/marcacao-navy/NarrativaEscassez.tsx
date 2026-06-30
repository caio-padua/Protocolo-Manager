import React, { useState, useEffect } from 'react';
import { Sun, Moon, CalendarClock, ChevronRight, Check, Shield, Star, Info, MapPin, Search, User } from 'lucide-react';
import SYMBOL_GOLD from '../../../assets/paxter-symbol-gold.png';

export default function NarrativaEscassez() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [motivo, setMotivo] = useState('');
  const [dia, setDia] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [caminho, setCaminho] = useState<'concierge' | 'fila' | null>(null);

  // Smooth scroll to the bottom when a path is selected (simulate advancing)
  const handleCaminhoSelect = (val: 'concierge' | 'fila') => {
    setCaminho(val);
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  return (
    <div className={`theme-${theme} font-sans selection:bg-[#c2a05a]/30 relative min-h-[100dvh] w-full max-w-[430px] mx-auto overflow-x-hidden flex flex-col transition-colors duration-500`}
         style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-main)' }}>
      
      {/* Custom Styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap');
        
        .theme-dark {
          --bg-base: #060b14;
          --bg-panel: #0d1629;
          --bg-input: #040810;
          --text-main: #e2e8f0;
          --text-muted: #8ba1bd;
          --border-subtle: rgba(255, 255, 255, 0.06);
          --border-focus: #c2a05a;
        }
        
        .theme-light {
          --bg-base: #f4f6f8;
          --bg-panel: #ffffff;
          --bg-input: #e9ecef;
          --text-main: #16284a;
          --text-muted: #5e7394;
          --border-subtle: rgba(22, 40, 74, 0.12);
          --border-focus: #c2a05a;
        }

        .font-lora { font-family: 'Lora', serif; }
        
        .text-gold {
          background: linear-gradient(180deg, #f4e2a8 0%, #c2a05a 45%, #8a6d2f 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .bg-gold {
          background: linear-gradient(180deg, #f4e2a8 0%, #c2a05a 45%, #8a6d2f 100%);
        }
        .border-gold { border-color: #c2a05a; }
        
        .panel {
          background-color: var(--bg-panel);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }

        .input-field {
          background-color: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          color: var(--text-main);
          width: 100%;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          transition: all 0.2s ease;
        }
        .input-field:focus {
          outline: none;
          border-color: var(--border-focus);
          box-shadow: 0 0 0 1px var(--border-focus);
        }
        .input-field::placeholder {
          color: var(--text-muted);
          opacity: 0.7;
        }

        .label-text {
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 0.375rem;
          display: block;
          font-weight: 600;
        }

        .chip {
          background-color: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 0.625rem 1rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-muted);
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .chip[data-active="true"] {
          border-color: #c2a05a;
          color: #c2a05a;
          background-color: rgba(194, 160, 90, 0.05);
        }

        .btn-gold {
          background: linear-gradient(180deg, #d4b26a 0%, #c2a05a 45%, #9a7a35 100%);
          color: #101828;
          font-weight: 700;
          border-radius: 6px;
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.3);
          border: none;
          transition: transform 0.1s, box-shadow 0.1s;
        }
        .btn-gold:active {
          transform: translateY(1px);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.2);
        }

        /* Subtle animated entrance */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fadeUp 0.6s ease-out forwards;
        }
        
        .delay-1 { animation-delay: 0.1s; opacity: 0; }
        .delay-2 { animation-delay: 0.2s; opacity: 0; }
        .delay-3 { animation-delay: 0.3s; opacity: 0; }
        .delay-4 { animation-delay: 0.4s; opacity: 0; }
      `}</style>

      {/* 1. Header */}
      <header className="px-6 py-8 flex justify-between items-start animate-fade-up">
        <div className="flex items-center gap-3">
          <img src={SYMBOL_GOLD} alt="" aria-hidden="true" className="w-8 h-8 object-contain" />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-[0.2em] text-gold leading-none">PAXTER</span>
            <span className="text-[0.6rem] uppercase tracking-widest text-[#c2a05a]/80 mt-1">Instituto Pádua</span>
          </div>
        </div>
        <button 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-[6px] border border-solid border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-gold transition-colors"
          aria-label={`Mudar para tema ${theme === 'dark' ? 'claro' : 'escuro'}`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* 2. Narrativa de Escassez (Storytelling) */}
      <section className="px-6 pb-8 animate-fade-up delay-1">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-px bg-gold" />
          <span className="text-[0.65rem] uppercase tracking-[0.2em] text-gold font-semibold">Exclusividade & Tempo</span>
        </div>
        <h1 className="font-lora text-2xl leading-snug mb-4">
          A arte da <span className="italic text-gold">precisão</span> exige paciência.
        </h1>
        <p className="text-sm leading-relaxed text-[var(--text-muted)] mb-4">
          O Instituto Pádua prioriza a excelência e o rigor clínico em cada atendimento. Devido à alta procura por nossos protocolos exclusivos com o Dr. Caio, nossa agenda opera atualmente com uma <strong className="text-[var(--text-main)] font-medium">carência média de 3 meses</strong>.
        </p>
        <div className="panel p-4 flex gap-3 items-start border-l-2 !border-l-[#c2a05a]">
          <Info className="w-5 h-5 text-[#c2a05a] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Para melhor atendê-lo e respeitar sua urgência, estruturamos duas vias oficiais de admissão. Preencha seus dados abaixo para iniciar.
          </p>
        </div>
      </section>

      {/* 3. Formulário de Captura */}
      <section className="px-6 flex flex-col gap-6 animate-fade-up delay-2">
        <div className="panel p-5 flex flex-col gap-5">
          <h2 className="text-xs uppercase tracking-widest text-[var(--text-main)] font-semibold border-b border-[var(--border-subtle)] pb-3 flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-[#c2a05a]" /> Seus Dados
          </h2>
          
          <div className="flex flex-col gap-4">
            <div>
              <label className="label-text" htmlFor="nome">Nome Completo</label>
              <input id="nome" type="text" className="input-field" placeholder="Ex: Marina Silva" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-text" htmlFor="whats">WhatsApp</label>
                <input id="whats" type="tel" className="input-field" placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label className="label-text" htmlFor="cpf">CPF</label>
                <input id="cpf" type="text" className="input-field" placeholder="000.000.000-00" />
              </div>
            </div>

            <div>
              <label className="label-text" htmlFor="email">E-mail</label>
              <input id="email" type="email" className="input-field" placeholder="marina@email.com" />
            </div>
          </div>
        </div>

        {/* Desejo e Disponibilidade */}
        <div className="panel p-5 flex flex-col gap-6">
          <div>
            <label className="label-text flex items-center gap-1.5 mb-3">
              <Search className="w-3 h-3 text-[#c2a05a]" /> O que você busca hoje?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'avaliacao', label: 'Avaliação Global' },
                { id: 'toxina', label: 'Toxina Botulínica' },
                { id: 'preenchimento', label: 'Preenchimentos' },
                { id: 'fios', label: 'Fios de PDO' },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setMotivo(m.id)}
                  data-active={motivo === m.id}
                  className="chip col-span-1 last:col-span-2"
                >
                  <span className="truncate">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-5">
            <label className="label-text flex items-center gap-1.5 mb-3">
              <CalendarClock className="w-3 h-3 text-[#c2a05a]" /> Preferência de Agenda
            </label>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2">
                {['Seg a Qua', 'Qui e Sex', 'Qualquer'].map(d => (
                  <button
                    key={d}
                    onClick={() => setDia(d)}
                    data-active={dia === d}
                    className="chip !px-2 !text-[0.65rem]"
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['Manhã', 'Tarde', 'Noite'].map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriodo(p)}
                    data-active={periodo === p}
                    className="chip !px-2 !text-[0.65rem]"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. A Escolha (O Clímax) */}
      <section className="px-6 py-8 animate-fade-up delay-3">
        <h2 className="font-lora text-xl text-center mb-6">Como deseja ingressar?</h2>
        
        <div className="flex flex-col gap-4">
          
          {/* Card A: Concierge (Destaque) */}
          <button 
            onClick={() => handleCaminhoSelect('concierge')}
            className={`relative p-5 rounded-[8px] border text-left transition-all duration-300 overflow-hidden ${
              caminho === 'concierge' 
                ? 'border-[#c2a05a] bg-[#16284a] shadow-[0_0_20px_rgba(194,160,90,0.15)]' 
                : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:border-[#c2a05a]/50'
            }`}
          >
            {caminho === 'concierge' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-gold" />
            )}
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <Star className={`w-4 h-4 ${caminho === 'concierge' ? 'text-[#f4e2a8]' : 'text-[#c2a05a]'}`} />
                <span className={`text-sm uppercase tracking-widest font-bold ${caminho === 'concierge' ? 'text-[#f4e2a8]' : 'text-gold'}`}>
                  Via Concierge
                </span>
              </div>
              {caminho === 'concierge' && <Check className="w-4 h-4 text-[#c2a05a]" />}
            </div>
            
            <h3 className={`font-lora text-lg mb-1 ${caminho === 'concierge' ? 'text-white' : 'text-[var(--text-main)]'}`}>
              Garanta seu encaixe prioritário
            </h3>
            <p className={`text-xs leading-relaxed mb-4 ${caminho === 'concierge' ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
              Nossa equipe mapeia desistências e cria horários extras dedicados a você em até 15 dias.
            </p>
            
            <div className={`p-3 rounded-[6px] border mb-3 flex justify-between items-center ${
              caminho === 'concierge' ? 'bg-[#0d1629] border-white/10' : 'bg-[var(--bg-input)] border-[var(--border-subtle)]'
            }`}>
              <div className="flex flex-col">
                <span className={`text-[0.6rem] uppercase tracking-wider ${caminho === 'concierge' ? 'text-[#c2a05a]' : 'text-[var(--text-muted)]'}`}>Antecipação de Reserva</span>
                <span className={`text-base font-bold ${caminho === 'concierge' ? 'text-white' : 'text-[var(--text-main)]'}`}>R$ 150,00</span>
              </div>
              <div className="flex flex-col items-end text-right">
                <span className={`text-[0.6rem] ${caminho === 'concierge' ? 'text-white/50' : 'text-[var(--text-muted)]'}`}>20% do valor total</span>
                <span className={`text-[0.6rem] ${caminho === 'concierge' ? 'text-white/50' : 'text-[var(--text-muted)]'}`}>(Consulta: R$ 750,00)</span>
              </div>
            </div>
            
            <div className={`flex items-center gap-2 text-[0.65rem] ${caminho === 'concierge' ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
              <Shield className="w-3 h-3" /> PIX, Cartão ou Boleto.
            </div>
          </button>

          {/* Card B: Fila Comum */}
          <button 
            onClick={() => handleCaminhoSelect('fila')}
            className={`relative p-5 rounded-[8px] border text-left transition-all duration-300 ${
              caminho === 'fila' 
                ? 'border-[var(--text-muted)] bg-[var(--bg-input)]' 
                : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] opacity-80 hover:opacity-100'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs uppercase tracking-widest font-semibold text-[var(--text-main)]">
                Fila Comum
              </span>
              {caminho === 'fila' && <Check className="w-4 h-4 text-[var(--text-main)]" />}
            </div>
            <h3 className="font-lora text-base mb-1 text-[var(--text-main)]">
              Aguardar novos horários
            </h3>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Você entra na nossa lista de espera padrão (previsão ~3 meses). Sem custo de reserva antecipada.
            </p>
          </button>

        </div>
        
        {/* Call to action (Aparece apos selecionar) */}
        <div className={`mt-6 transition-all duration-500 overflow-hidden ${caminho ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
          <button className="btn-gold w-full py-4 uppercase tracking-widest text-sm flex items-center justify-center gap-2">
            Continuar <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* 5. Footer */}
      <footer className="mt-auto px-6 py-8 border-t border-[var(--border-subtle)] flex flex-col items-center gap-4 animate-fade-up delay-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          <MapPin className="w-4 h-4 text-[var(--text-muted)]" />
        </div>
        <div className="text-center">
          <h4 className="text-xs font-bold text-[var(--text-main)] tracking-wider uppercase mb-1">Instituto Pádua</h4>
          <p className="text-[0.65rem] text-[var(--text-muted)] leading-relaxed">
            Rua Guaxupé, 327 — Vila Formosa<br />
            São Paulo, SP
          </p>
        </div>
        <div className="w-12 h-px bg-[var(--border-subtle)] my-2" />
        <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">
          Desenvolvido pela Padcon
        </p>
      </footer>

    </div>
  );
}
