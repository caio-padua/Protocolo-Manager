import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, Moon, Sun, Info, Calendar, Clock, Sparkles, CreditCard, ShieldCheck } from 'lucide-react';
import SYMBOL_GOLD from '../../../assets/paxter-symbol-gold.png';

export default function StepperGuiado() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    cpf: '',
    email: '',
    motivo: '',
    dias: [] as string[],
    periodos: [] as string[],
    caminho: ''
  });

  const updateForm = (key: string, value: any) => setFormData(prev => ({ ...prev, [key]: value }));

  const toggleArray = (key: 'dias' | 'periodos', value: string) => {
    setFormData(prev => {
      const arr = prev[key];
      return arr.includes(value) 
        ? { ...prev, [key]: arr.filter(i => i !== value) }
        : { ...prev, [key]: [...arr, value] };
    });
  };

  const nextStep = () => { if (step < totalSteps) setStep(step + 1); };
  const prevStep = () => { if (step > 1) setStep(step - 1); };

  const isDark = theme === 'dark';

  return (
    <div className={`relative min-h-[100dvh] w-full max-w-[430px] mx-auto overflow-x-hidden flex flex-col font-sans transition-colors duration-500 pb-8 ${isDark ? 'bg-[#0f172a] text-slate-200' : 'bg-[#e2e8f0] text-slate-800'}`}>
      <style>{`
        /* --- Tema Navy/Ouro Paxter --- */
        .text-gold {
          background: linear-gradient(180deg, #f4e2a8 0%, #c2a05a 45%, #8a6d2f 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* 3D Panel Base */
        .paxter-panel {
          background: ${isDark ? 'linear-gradient(180deg, #16284a 0%, #0b1426 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)'};
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,1)'};
          box-shadow: ${isDark ? '0 12px 30px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.1)'};
          border-radius: 6px;
        }

        /* Engraved Concave (Inputs, Wells) */
        .paxter-concave {
          background: ${isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.03)'};
          box-shadow: inset 0 2px 6px ${isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.1)'};
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'};
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,1)'};
          border-radius: 6px;
        }

        .paxter-input {
          width: 100%;
          padding: 14px 16px;
          border-radius: 6px;
          outline: none;
          font-size: 16px;
          background: transparent;
          color: ${isDark ? '#fff' : '#0f172a'};
          transition: all 0.2s;
        }
        .paxter-input:focus {
          box-shadow: inset 0 0 0 1px #c2a05a;
        }

        /* 3D Bevel (Buttons, Active Chips) */
        .paxter-bevel {
          background: ${isDark ? 'linear-gradient(180deg, #1e3a6e 0%, #16284a 100%)' : 'linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%)'};
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'};
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.8)'};
          box-shadow: 0 4px 12px ${isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)'};
          border-radius: 6px;
          color: ${isDark ? '#e2e8f0' : '#475569'};
          transition: all 0.2s ease;
        }
        .paxter-bevel[data-active="true"] {
          background: ${isDark ? 'linear-gradient(180deg, #2a4b8d 0%, #16284a 100%)' : 'linear-gradient(180deg, #f8fafc 0%, #cbd5e1 100%)'};
          border-color: #c2a05a;
          box-shadow: 0 0 16px rgba(194, 160, 90, 0.15), inset 0 1px 0 rgba(244, 226, 168, 0.25);
          color: #c2a05a;
        }
        .paxter-bevel:active {
          transform: translateY(2px);
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        }

        /* Premium Gold Button */
        .btn-gold {
          background: linear-gradient(180deg, #e4c87f 0%, #c2a05a 50%, #8a6d2f 100%);
          border: 1px solid #f4e2a8;
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 8px 16px rgba(0,0,0,0.4);
          border-radius: 6px;
          color: #1a0505;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 700;
          font-size: 13px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-gold:active {
          transform: translateY(2px);
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4);
        }

        /* Warning Banner */
        .banner-warning {
          background: ${isDark ? 'linear-gradient(90deg, #1e3a6e 0%, #16284a 100%)' : 'linear-gradient(90deg, #e2e8f0 0%, #cbd5e1 100%)'};
          border-left: 3px solid #c2a05a;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.2);
        }

        /* Transitions */
        .step-enter {
          animation: slideUpFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideUpFade {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        
        .paxter-led {
          width: 8px; height: 8px; border-radius: 50%;
          background: #c2a05a;
          box-shadow: 0 0 8px #c2a05a;
          animation: ledPulse 2s infinite;
        }
        @keyframes ledPulse {
          0%, 100% { opacity: 0.6; box-shadow: 0 0 4px #c2a05a; }
          50% { opacity: 1; box-shadow: 0 0 12px #c2a05a; }
        }
      `}</style>

      {/* Header */}
      <header className="relative z-10 px-6 pt-10 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={SYMBOL_GOLD} alt="" aria-hidden="true" className="w-8 h-8 object-contain" />
          <div className="text-xl font-bold tracking-[0.25em] text-gold mt-1">PAXTER</div>
        </div>
        <button 
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={`paxter-bevel w-9 h-9 flex items-center justify-center`}
          aria-label="Alternar tema"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* Progress */}
      <div className="px-6 mb-8 relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Etapa {step} de {totalSteps}</span>
          <span className="text-[10px] uppercase tracking-widest font-bold text-gold">
            {step === 1 && 'Identificação'}
            {step === 2 && 'Desejo & Foco'}
            {step === 3 && 'Disponibilidade'}
            {step === 4 && 'Modalidade'}
          </span>
        </div>
        <div className="paxter-concave p-1 flex gap-1 h-3">
          {[1, 2, 3, 4].map(i => (
            <div 
              key={i} 
              className={`h-full flex-1 rounded-[2px] transition-all duration-500 ${
                i < step ? 'bg-[#8a6d2f]' : 
                i === step ? 'bg-gradient-to-r from-[#f4e2a8] to-[#c2a05a] shadow-[0_0_8px_rgba(194,160,90,0.5)]' : 
                'bg-transparent'
              }`} 
            />
          ))}
        </div>
      </div>

      <main className="flex-1 px-6 flex flex-col relative z-10">
        
        {/* STEP 1: IDENTIFICAÇÃO */}
        {step === 1 && (
          <div className="step-enter flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-serif text-gold mb-2">Identificação</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'} leading-relaxed`}>
                Inicie informando seus dados básicos para registro seguro.
              </p>
            </div>

            <div className="paxter-panel p-5 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'} ml-1`}>Nome completo</label>
                <div className="paxter-concave">
                  <input type="text" value={formData.nome} onChange={(e) => updateForm('nome', e.target.value)} className="paxter-input" placeholder="Ex: Maria Silva" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'} ml-1`}>WhatsApp / Telefone</label>
                <div className="paxter-concave">
                  <input type="tel" value={formData.telefone} onChange={(e) => updateForm('telefone', e.target.value)} className="paxter-input" placeholder="(11) 90000-0000" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'} ml-1`}>CPF</label>
                <div className="paxter-concave">
                  <input type="text" value={formData.cpf} onChange={(e) => updateForm('cpf', e.target.value)} className="paxter-input" placeholder="000.000.000-00" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'} ml-1`}>E-mail</label>
                <div className="paxter-concave">
                  <input type="email" value={formData.email} onChange={(e) => updateForm('email', e.target.value)} className="paxter-input" placeholder="contato@email.com" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: DESEJO */}
        {step === 2 && (
          <div className="step-enter flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-serif text-gold mb-2">O que você busca?</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'} leading-relaxed`}>
                Direcione o foco da sua consulta.
              </p>
            </div>

            <div className="paxter-panel p-5 flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-3">
                {['Toxina Botulínica', 'Preenchimento', 'Fios de PDO', 'Bioestimuladores', 'Laser', 'Avaliação Global'].map(motivo => {
                  const isSelected = formData.motivo === motivo;
                  return (
                    <button
                      key={motivo}
                      onClick={() => updateForm('motivo', motivo)}
                      data-active={isSelected}
                      className="paxter-bevel px-3 py-3 text-[12px] font-semibold text-center leading-tight flex items-center justify-center min-h-[56px]"
                    >
                      {motivo}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <label className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'} ml-1`}>Ou descreva brevemente (opcional)</label>
                <div className="paxter-concave">
                  <textarea 
                    rows={3}
                    value={['Toxina Botulínica', 'Preenchimento', 'Fios de PDO', 'Bioestimuladores', 'Laser', 'Avaliação Global'].includes(formData.motivo) ? '' : formData.motivo}
                    onChange={(e) => updateForm('motivo', e.target.value)}
                    className="paxter-input resize-none py-3"
                    placeholder="Gostaria de avaliar o terço inferior da face..."
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: DISPONIBILIDADE */}
        {step === 3 && (
          <div className="step-enter flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-serif text-gold mb-2">Preferências</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'} leading-relaxed`}>
                Indique os melhores momentos para seu atendimento.
              </p>
            </div>

            <div className="banner-warning p-4 rounded-[6px] flex gap-4">
              <div className="mt-1 shrink-0"><Info className="w-5 h-5 text-[#c2a05a]" /></div>
              <div className="flex flex-col gap-1.5">
                <h4 className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Aviso de Demanda</h4>
                <p className={`text-[13px] ${isDark ? 'text-slate-300' : 'text-slate-600'} leading-relaxed`}>
                  Nossa agenda opera com alta exclusividade. Na fila comum, as primeiras datas iniciam <strong>a partir de 3 meses</strong>.
                </p>
              </div>
            </div>

            <div className="paxter-panel p-5 flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#c2a05a]" />
                  <label className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dias da semana</label>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map(dia => {
                    const isSelected = formData.dias.includes(dia);
                    return (
                      <button
                        key={dia}
                        onClick={() => toggleArray('dias', dia)}
                        data-active={isSelected}
                        className="paxter-bevel h-12 flex items-center justify-center text-[12px] font-bold"
                      >
                        {dia}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#c2a05a]" />
                  <label className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Períodos</label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {['Manhã', 'Tarde', 'Noite'].map(periodo => {
                    const isSelected = formData.periodos.includes(periodo);
                    return (
                      <button
                        key={periodo}
                        onClick={() => toggleArray('periodos', periodo)}
                        data-active={isSelected}
                        className="paxter-bevel h-12 flex items-center justify-center text-[12px] font-bold"
                      >
                        {periodo}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: MODALIDADE */}
        {step === 4 && (
          <div className="step-enter flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-serif text-gold mb-2">Modalidade</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'} leading-relaxed`}>
                Escolha sua forma de entrada na clínica.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <button 
                onClick={() => updateForm('caminho', 'concierge')}
                data-active={formData.caminho === 'concierge'}
                className="paxter-bevel text-left p-5 relative overflow-hidden group focus-visible:outline-none"
              >
                {formData.caminho === 'concierge' && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#c2a05a] shadow-[0_0_12px_#c2a05a]" />
                )}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {formData.caminho === 'concierge' ? <div className="paxter-led" /> : <Sparkles className="w-4 h-4 text-[#c2a05a]" />}
                    <h3 className="font-serif text-lg text-gold font-bold">Via Concierge</h3>
                  </div>
                  <div className="paxter-concave w-6 h-6 flex items-center justify-center rounded-[4px]">
                    {formData.caminho === 'concierge' && <Check className="w-3.5 h-3.5 text-[#c2a05a]" />}
                  </div>
                </div>
                <p className={`text-[13px] ${isDark ? 'text-slate-300' : 'text-slate-600'} leading-relaxed mb-4`}>
                  Garanta seu encaixe prioritário sem espera prolongada. A antecipação de R$ 150,00 reserva seu horário imediatamente.
                </p>
                <div className={`flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold ${formData.caminho === 'concierge' ? 'text-[#c2a05a]' : isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>PIX · Cartão · Boleto</span>
                </div>
              </button>

              <button 
                onClick={() => updateForm('caminho', 'comum')}
                data-active={formData.caminho === 'comum'}
                className="paxter-bevel text-left p-5 relative focus-visible:outline-none"
              >
                {formData.caminho === 'comum' && (
                  <div className={`absolute top-0 left-0 w-1 h-full ${isDark ? 'bg-slate-400' : 'bg-slate-600'}`} />
                )}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                    <h3 className={`font-serif text-lg font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Fila Comum</h3>
                  </div>
                  <div className="paxter-concave w-6 h-6 flex items-center justify-center rounded-[4px]">
                    {formData.caminho === 'comum' && <Check className={`w-3.5 h-3.5 ${isDark ? 'text-slate-200' : 'text-slate-700'}`} />}
                  </div>
                </div>
                <p className={`text-[13px] ${isDark ? 'text-slate-400' : 'text-slate-500'} leading-relaxed`}>
                  Aguarde por novos horários sem custo antecipado. Inserção na lista de espera convencional.
                </p>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Navigation Footer */}
      <div className="px-6 mt-10 mb-6 relative z-10 flex items-center gap-4">
        {step > 1 ? (
          <button 
            onClick={prevStep}
            className="paxter-bevel w-12 h-12 shrink-0 flex items-center justify-center"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-12 h-12 shrink-0" />
        )}

        <button 
          onClick={step === totalSteps ? undefined : nextStep}
          className={`flex-1 h-12 flex items-center justify-center gap-2 ${step === totalSteps ? 'btn-gold' : 'paxter-bevel text-[12px] uppercase tracking-widest font-bold'}`}
        >
          {step === totalSteps ? 'Concluir' : 'Continuar'}
          {step < totalSteps && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      <footer className="px-6 text-center">
        <p className={`text-[9px] uppercase tracking-[0.2em] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Instituto Pádua · Rua Guaxupé, 327 — SP
        </p>
        <p className={`text-[8px] uppercase tracking-[0.2em] font-bold mt-2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
          Desenvolvido pela Padcon
        </p>
      </footer>
    </div>
  );
}