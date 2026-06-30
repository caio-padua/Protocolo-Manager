import React, { useState, useEffect } from 'react';
import { Sun, Moon, ArrowRight, Check, MapPin, Info, Star } from 'lucide-react';
import SYMBOL_GOLD from '../../../assets/paxter-symbol-gold.png';

export default function EditorialConcierge() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [motivo, setMotivo] = useState('');
  const [dia, setDia] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = theme === 'dark';

  return (
    <div className={`relative min-h-[100dvh] w-full max-w-[430px] mx-auto overflow-x-hidden flex flex-col font-sans transition-colors duration-700 ease-in-out ${isDark ? 'bg-[#16284a] text-stone-300' : 'bg-[#f4f2ee] text-[#16284a]'}`}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Inter:wght@300;400;500;600&display=swap');
        
        .font-serif-luxury { font-family: 'Playfair Display', serif; }
        .font-sans-luxury { font-family: 'Inter', sans-serif; }

        .text-gold {
          background: linear-gradient(135deg, #f4e2a8 0%, #c2a05a 50%, #8a6d2f 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .bg-gold {
          background: linear-gradient(135deg, #f4e2a8 0%, #c2a05a 50%, #8a6d2f 100%);
        }

        .border-gold { border-color: #c2a05a; }
        .border-gold-soft { border-color: rgba(194, 160, 90, 0.3); }

        .editorial-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(22,40,74,0.2)'};
          padding: 14px 0;
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          color: ${isDark ? '#e2e8f0' : '#16284a'};
          outline: none;
          transition: border-color 0.3s ease;
          border-radius: 0;
        }
        .editorial-input:focus {
          border-bottom-color: #c2a05a;
        }
        .editorial-input::placeholder {
          color: ${isDark ? 'rgba(255,255,255,0.3)' : 'rgba(22,40,74,0.4)'};
          font-family: 'Playfair Display', serif;
          font-style: italic;
        }

        .chip-editorial {
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(22,40,74,0.2)'};
          background: transparent;
          color: ${isDark ? 'rgba(255,255,255,0.7)' : 'rgba(22,40,74,0.7)'};
          transition: all 0.3s ease;
          border-radius: 6px;
        }
        .chip-editorial[data-active="true"] {
          border-color: #c2a05a;
          color: ${isDark ? '#f4e2a8' : '#8a6d2f'};
          background: ${isDark ? 'rgba(194,160,90,0.1)' : 'rgba(194,160,90,0.1)'};
        }

        .concierge-card {
          background: ${isDark ? 'linear-gradient(180deg, #1d335c 0%, #16284a 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f4f2ee 100%)'};
          border: 1px solid ${isDark ? 'rgba(194,160,90,0.3)' : 'rgba(194,160,90,0.4)'};
          box-shadow: ${isDark ? '0 10px 30px -10px rgba(0,0,0,0.5)' : '0 10px 30px -10px rgba(22,40,74,0.1)'};
          border-radius: 6px;
        }

        .fade-in-up {
          animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
          transform: translateY(20px);
        }

        @keyframes fadeInUp {
          to { opacity: 1; transform: translateY(0); }
        }
        
        .select-icon {
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${isDark ? '%23c2a05a' : '%238a6d2f'}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 0 center;
          background-size: 1em;
          padding-right: 24px;
        }
      `}</style>

      {/* Theme Toggle */}
      <div className="absolute top-6 right-6 z-50">
        <button 
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="p-2 rounded-full border border-current opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Alternar tema"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="px-8 pt-20 pb-12 flex flex-col items-center text-center fade-in-up" style={{animationDelay: '0.1s'}}>
        <img src={SYMBOL_GOLD} alt="" aria-hidden="true" className="w-14 h-14 object-contain mb-8 opacity-90 filter drop-shadow-md" />
        <h1 className="text-sm tracking-[0.3em] uppercase text-gold font-sans-luxury font-semibold mb-8">Paxter</h1>
        
        <div className="border-t border-gold-soft w-12 mb-8" />
        
        <h2 className="font-serif-luxury text-3xl leading-snug mb-5">
          A excelência em<br />
          medicina estética
        </h2>
        <p className={`font-sans-luxury text-sm leading-relaxed max-w-[280px] ${isDark ? 'text-stone-400' : 'text-stone-600'}`}>
          Permita-nos conhecer seus desejos para prepararmos uma experiência sob medida.
        </p>
      </div>

      <div className="px-8 flex flex-col gap-14 fade-in-up" style={{animationDelay: '0.3s'}}>
        
        {/* Act I: The Client */}
        <section>
          <h3 className="font-serif-luxury italic text-gold text-xl mb-6">I. Suas Credenciais</h3>
          <div className="flex flex-col gap-1">
            <input type="text" placeholder="Nome completo" className="editorial-input" />
            <input type="tel" placeholder="Telefone / WhatsApp" className="editorial-input" />
            <input type="email" placeholder="E-mail" className="editorial-input" />
            <input type="text" placeholder="CPF" className="editorial-input" />
          </div>
        </section>

        {/* Act II: The Desire */}
        <section>
          <h3 className="font-serif-luxury italic text-gold text-xl mb-6">II. O Desejo</h3>
          <p className={`text-[11px] uppercase tracking-widest mb-5 font-semibold ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>O que você busca?</p>
          <div className="flex flex-wrap gap-2.5 mb-5">
            {['Harmonização', 'Rejuvenescimento', 'Toxina Botulínica', 'Protocolos Corporais', 'Avaliação Exclusiva'].map(m => (
              <button 
                key={m}
                onClick={() => setMotivo(m)}
                data-active={motivo === m}
                className="chip-editorial px-4 py-2.5 text-sm font-sans-luxury"
              >
                {m}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Ou descreva em suas próprias palavras..." className="editorial-input mt-2" />
        </section>

        {/* Act III: Time & Exclusivity */}
        <section>
          <h3 className="font-serif-luxury italic text-gold text-xl mb-6">III. O Tempo</h3>
          
          <div className={`p-5 mb-8 rounded-[6px] flex items-start gap-4 ${isDark ? 'bg-[#0d182b]' : 'bg-white'} border ${isDark ? 'border-[#233f75]' : 'border-stone-200'}`}>
            <Info className="w-5 h-5 text-[#c2a05a] shrink-0 mt-0.5" />
            <p className="text-sm font-sans-luxury leading-relaxed">
              Devido à alta exclusividade de nossos atendimentos, informamos com transparência que 
              nossas primeiras datas regulares estão disponíveis a partir de <strong className="text-gold font-normal">~3 meses</strong>.
            </p>
          </div>

          <p className={`text-[11px] uppercase tracking-widest mb-5 font-semibold ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>Sua preferência de agenda</p>
          
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="flex flex-col gap-1">
              <span className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>Dia da semana</span>
              <select 
                className={`editorial-input select-icon ${!dia && 'italic font-serif-luxury'}`}
                value={dia}
                onChange={(e) => setDia(e.target.value)}
              >
                <option value="" disabled>Qualquer dia</option>
                <option value="seg">Segunda-feira</option>
                <option value="ter">Terça-feira</option>
                <option value="qua">Quarta-feira</option>
                <option value="qui">Quinta-feira</option>
                <option value="sex">Sexta-feira</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>Período</span>
              <select 
                className={`editorial-input select-icon ${!periodo && 'italic font-serif-luxury'}`}
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
              >
                <option value="" disabled>Indiferente</option>
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
              </select>
            </div>
          </div>
        </section>

        {/* Act IV: The Paths */}
        <section className="mb-14">
          <h3 className="font-serif-luxury italic text-gold text-xl mb-6">IV. A Jornada</h3>
          
          <div className="flex flex-col gap-6">
            
            {/* Concierge Path */}
            <div className="concierge-card p-7 relative overflow-hidden group cursor-pointer">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Star className="w-32 h-32 text-[#c2a05a]" />
              </div>
              <div className="relative z-10 flex flex-col gap-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-[6px] bg-gold flex items-center justify-center shadow-lg">
                    <Check className="w-5 h-5 text-[#16284a]" />
                  </div>
                  <h4 className="font-serif-luxury text-2xl text-gold">Via Concierge</h4>
                </div>
                <p className={`text-[15px] font-sans-luxury leading-relaxed ${isDark ? 'text-stone-300' : 'text-[#16284a]'}`}>
                  Garanta seu encaixe prioritário. O cliente antecipa <strong className="font-semibold text-gold">R$ 150,00</strong> (20% do valor da consulta, total R$ 750,00) para reservar seu horário de forma exclusiva e ágil.
                </p>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-[#c2a05a] font-semibold mt-2">
                  <span>PIX</span> <span className="opacity-30">•</span>
                  <span>Cartão</span> <span className="opacity-30">•</span>
                  <span>Boleto</span>
                </div>
                <button className="mt-4 w-full py-4 bg-gold text-[#16284a] font-bold text-xs tracking-[0.2em] uppercase rounded-[6px] flex items-center justify-center gap-3 transition-transform active:scale-[0.98] shadow-[0_4px_14px_rgba(194,160,90,0.3)]">
                  Garantir Prioridade <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-5 my-2">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-stone-500/30 to-transparent" />
              <span className="font-serif-luxury italic text-base text-stone-500">ou</span>
              <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-stone-500/30 to-transparent" />
            </div>

            {/* Standard Path */}
            <button className={`w-full p-6 border rounded-[6px] flex flex-col items-center gap-3 text-center transition-all ${isDark ? 'border-[#233f75] hover:border-[#325291] hover:bg-[#1d335c]' : 'border-stone-300 hover:border-stone-400 hover:bg-stone-100'}`}>
              <span className={`font-serif-luxury text-xl ${isDark ? 'text-stone-300' : 'text-[#16284a]'}`}>Fila comum</span>
              <span className="text-sm font-sans-luxury text-stone-500">Sem custo. Entre na lista e aguarde novos horários.</span>
            </button>

          </div>
        </section>

      </div>

      <footer className="px-8 pb-12 pt-10 text-center border-t border-gold-soft mx-8 mt-auto fade-in-up" style={{animationDelay: '0.4s'}}>
        <div className="flex items-center justify-center gap-2 mb-5">
          <MapPin className="w-3.5 h-3.5 text-[#c2a05a]" />
          <span className={`text-[11px] uppercase tracking-[0.2em] font-medium ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
            Instituto Pádua
          </span>
        </div>
        <p className={`text-[11px] leading-relaxed mb-6 ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>
          Rua Guaxupé, 327 — Vila Formosa<br />
          São Paulo, SP
        </p>
        <p className="text-[9px] uppercase tracking-[0.2em] font-semibold text-stone-600">
          Desenvolvido pela Padcon
        </p>
      </footer>

    </div>
  );
}
