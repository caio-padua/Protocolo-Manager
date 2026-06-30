import React, { useState } from 'react';
import { ChevronRight, Check, MapPin, User, Phone, CreditCard, Mail, AlertTriangle, CalendarDays, Moon, Sun } from 'lucide-react';
import SYMBOL_GOLD from '../../../assets/paxter-symbol-gold.png';

export default function PainelSkeuomorfico() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [motivo, setMotivo] = useState('');
  const [diaPreferencia, setDiaPreferencia] = useState('qualquer');
  const [periodo, setPeriodo] = useState('qualquer');
  
  const isDark = theme === 'dark';

  return (
    <div className={`relative min-h-[100dvh] w-full max-w-[430px] mx-auto overflow-x-hidden flex flex-col font-sans transition-colors duration-300 ${isDark ? 'bg-[#0f1b33] text-stone-200' : 'bg-[#e5e9f0] text-[#16284a]'} paxter-theme-${theme}`}>
      <style>{`
        /* Paxter Navy & Gold Skeuomorphic System */
        .paxter-theme-dark {
          --bg-base: #0f1b33;
          --panel-base: linear-gradient(180deg, #1d335c 0%, #16284a 100%);
          --panel-sub: linear-gradient(180deg, #182c50 0%, #122240 100%);
          --panel-border: rgba(255, 255, 255, 0.08);
          --panel-border-top: rgba(255, 255, 255, 0.15);
          --panel-shadow: 0 12px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          
          --concave-bg: rgba(0, 0, 0, 0.3);
          --concave-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.6);
          --concave-border: rgba(255, 255, 255, 0.03);
          --concave-border-bottom: rgba(255, 255, 255, 0.08);
          
          --btn-bg: linear-gradient(180deg, #244073 0%, #16284a 100%);
          --btn-shadow: inset 0 2px 1px rgba(255, 255, 255, 0.15), inset 0 -2px 6px rgba(0,0,0,0.4), 0 6px 12px rgba(0,0,0,0.4);
          --btn-active-shadow: inset 0 4px 10px rgba(0,0,0,0.7), 0 2px 4px rgba(0,0,0,0.2);
          
          --text-muted: #8ba3c7;
        }
        
        .paxter-theme-light {
          --bg-base: #e5e9f0;
          --panel-base: linear-gradient(180deg, #ffffff 0%, #f0f3f7 100%);
          --panel-sub: linear-gradient(180deg, #f8fafd 0%, #e9edf5 100%);
          --panel-border: rgba(22, 40, 74, 0.1);
          --panel-border-top: rgba(255, 255, 255, 0.8);
          --panel-shadow: 0 12px 30px rgba(22, 40, 74, 0.1), inset 0 1px 0 rgba(255, 255, 255, 1);
          
          --concave-bg: rgba(22, 40, 74, 0.04);
          --concave-shadow: inset 0 2px 6px rgba(22, 40, 74, 0.15);
          --concave-border: rgba(22, 40, 74, 0.05);
          --concave-border-bottom: rgba(255, 255, 255, 0.6);
          
          --btn-bg: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
          --btn-shadow: inset 0 2px 1px rgba(255, 255, 255, 1), inset 0 -2px 6px rgba(22,40,74,0.1), 0 6px 12px rgba(22,40,74,0.15);
          --btn-active-shadow: inset 0 3px 8px rgba(22,40,74,0.2), 0 2px 4px rgba(22,40,74,0.05);
          
          --text-muted: #647b9e;
        }

        .text-gold {
          background: linear-gradient(180deg, #f4e2a8 0%, #c2a05a 45%, #8a6d2f 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .panel-3d {
          background: var(--panel-base);
          border: 1px solid var(--panel-border);
          border-top: 1px solid var(--panel-border-top);
          box-shadow: var(--panel-shadow);
          border-radius: 8px;
        }
        
        .panel-3d-sub {
          background: var(--panel-sub);
          border: 1px solid var(--panel-border);
          border-top: 1px solid var(--panel-border-top);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 var(--panel-border-top);
          border-radius: 6px;
        }
        
        .concave-3d {
          background: var(--concave-bg);
          box-shadow: var(--concave-shadow);
          border: 1px solid var(--concave-border);
          border-bottom: 1px solid var(--concave-border-bottom);
          border-radius: 6px;
        }
        
        .field-engraved {
          width: 100%;
          background: transparent;
          outline: none;
          color: inherit;
          font-size: 14px;
        }
        .field-engraved::placeholder {
          color: var(--text-muted);
          opacity: 0.7;
        }
        
        .btn-3d {
          background: var(--btn-bg);
          box-shadow: var(--btn-shadow);
          border: 1px solid var(--panel-border);
          border-radius: 6px;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-3d:active {
          transform: translateY(2px);
          box-shadow: var(--btn-active-shadow);
        }
        
        .btn-premium {
          background: linear-gradient(180deg, #f8ecb8 0%, #d9b85e 34%, #8a6d2f 100%);
          box-shadow: inset 0 2px 1px rgba(255, 255, 255, 0.6), inset 0 -4px 8px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.4), 0 0 15px rgba(194, 160, 90, 0.3);
          border: 1px solid #5a451d;
          border-radius: 6px;
          color: #1a0505;
          text-shadow: 0 1px 0 rgba(255,255,255,0.4);
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-premium:active {
          transform: translateY(2px);
          box-shadow: inset 0 4px 10px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.2);
        }

        .bevel-3d {
          background: var(--panel-sub);
          box-shadow: inset 0 1px 1px var(--panel-border-top), 0 2px 4px rgba(0,0,0,0.3);
          border: 1px solid var(--panel-border);
          border-radius: 4px;
        }
        
        .paxter-alert-amber {
          background: linear-gradient(180deg, rgba(217, 119, 6, 0.15) 0%, rgba(217, 119, 6, 0.05) 100%);
          border: 1px solid rgba(217, 119, 6, 0.3);
          box-shadow: 0 4px 12px rgba(217, 119, 6, 0.1), inset 0 1px 0 rgba(255,255,255,0.05);
        }
      `}</style>

      {/* Header */}
      <header className="relative z-10 pt-10 pb-6 px-5 flex flex-col items-center">
        <button 
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="absolute top-6 right-5 btn-3d p-2 text-[var(--text-muted)] hover:text-gold"
          aria-label="Alternar tema"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="relative w-14 h-14 mb-3">
          <img 
            src={SYMBOL_GOLD} 
            alt="" 
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-contain filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.4)]" 
          />
        </div>
        <h1 className="text-xl font-bold tracking-[0.25em] text-gold mb-1">PAXTER</h1>
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#c2a05a] font-medium opacity-80">
          Clínica de Medicina Estética
        </p>
      </header>

      <main className="relative z-10 flex flex-col gap-6 px-5 pb-10">
        
        {/* Intro */}
        <div className="text-center mb-2">
          <h2 className="text-lg font-semibold tracking-wide mb-2">Solicitação de Consulta</h2>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed px-4">
            Inicie sua jornada conosco. Preencha seus dados para avaliarmos sua necessidade e organizarmos seu agendamento.
          </p>
        </div>

        {/* Panel 1: Dados do Cliente */}
        <div className="panel-3d p-5 flex flex-col gap-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="bevel-3d p-1.5 text-gold">
              <User className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold tracking-widest uppercase opacity-90">Identificação</h3>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold opacity-70 ml-1">Nome Completo</label>
              <div className="concave-3d px-3 py-2.5 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <input type="text" className="field-engraved" placeholder="Como prefere ser chamado" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-semibold opacity-70 ml-1">Telefone / WhatsApp</label>
                <div className="concave-3d px-3 py-2.5 flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <input type="tel" className="field-engraved" placeholder="(11) 90000-0000" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-semibold opacity-70 ml-1">CPF</label>
                <div className="concave-3d px-3 py-2.5 flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <input type="text" className="field-engraved" placeholder="000.000.000-00" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold opacity-70 ml-1">E-mail</label>
              <div className="concave-3d px-3 py-2.5 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <input type="email" className="field-engraved" placeholder="seu@email.com" />
              </div>
            </div>
          </div>
        </div>

        {/* Panel 2: Desejo e Preferencia */}
        <div className="panel-3d p-5 flex flex-col gap-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="bevel-3d p-1.5 text-gold">
              <CalendarDays className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold tracking-widest uppercase opacity-90">Sua Busca</h3>
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold opacity-70 ml-1">O que você busca?</label>
            <div className="grid grid-cols-2 gap-2">
              {['Toxina Botulínica', 'Preenchimento', 'Bioestimulador', 'Avaliação Geral'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMotivo(m)}
                  className={`btn-3d py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider text-center ${motivo === m ? 'border-[#c2a05a] text-[#c2a05a]' : 'text-[var(--text-muted)]'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="concave-3d px-3 py-2.5 mt-1">
              <textarea 
                className="field-engraved min-h-[60px] resize-none" 
                placeholder="Se preferir, descreva em detalhes o que deseja tratar..."
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold opacity-70 ml-1">Preferência de Dia</label>
            <div className="concave-3d p-1 flex gap-1">
              {['Seg a Sex', 'Sábados', 'Qualquer'].map((d) => (
                <button
                  key={d}
                  onClick={() => setDiaPreferencia(d.toLowerCase())}
                  className={`flex-1 py-2 text-[11px] font-medium uppercase tracking-wider rounded ${diaPreferencia === d.toLowerCase() ? 'bg-[var(--bg-base)] text-gold shadow-sm border border-[var(--panel-border-top)]' : 'text-[var(--text-muted)] hover:text-inherit'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold opacity-70 ml-1">Preferência de Período</label>
            <div className="concave-3d p-1 flex gap-1">
              {['Manhã', 'Tarde', 'Noite', 'Qualquer'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p.toLowerCase())}
                  className={`flex-1 py-2 text-[11px] font-medium uppercase tracking-wider rounded ${periodo === p.toLowerCase() ? 'bg-[var(--bg-base)] text-gold shadow-sm border border-[var(--panel-border-top)]' : 'text-[var(--text-muted)] hover:text-inherit'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Aviso Honest */}
        <div className="panel-3d paxter-alert-amber rounded-lg p-4 flex gap-3 items-start">
          <div className="mt-0.5 w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest">Agenda Concorrida</h4>
            <p className="text-xs text-amber-500/80 leading-relaxed font-medium">
              Devido à alta procura, nossos próximos horários comuns iniciam a partir de <strong>~3 meses</strong>.
            </p>
          </div>
        </div>

        {/* Panel 3: Escolha de Caminho */}
        <div className="panel-3d p-5 flex flex-col gap-5 mt-2">
          <div className="flex items-center justify-center mb-2">
            <h3 className="text-sm font-bold tracking-widest uppercase opacity-90 text-center">Como deseja prosseguir?</h3>
          </div>

          {/* Caminho A */}
          <div className="panel-3d-sub border-[#c2a05a]/30 relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f]" />
            <div className="p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start gap-2">
                <h4 className="text-sm font-bold text-gold uppercase tracking-wider">Via Concierge</h4>
                <div className="px-2 py-0.5 text-[9px] uppercase font-bold tracking-widest text-[#1a0505] bg-gold rounded">Prioridade</div>
              </div>
              <p className="text-[11px] leading-relaxed opacity-80">
                Antecipe R$ 150,00 (20% do valor total da consulta de R$ 750,00) para garantir um encaixe prioritário nas próximas semanas.
              </p>
              <div className="flex items-center gap-2 mt-1 opacity-60">
                <CreditCard className="w-3 h-3" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Pix, Cartão ou Boleto</span>
              </div>
              <button className="btn-premium w-full py-3 mt-2 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                Garantir Encaixe <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 py-1">
            <div className="flex-1 h-px bg-[var(--panel-border-top)]" />
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">OU</span>
            <div className="flex-1 h-px bg-[var(--panel-border-top)]" />
          </div>

          {/* Caminho B */}
          <div className="panel-3d-sub p-4 flex flex-col gap-3">
            <div className="flex justify-between items-start gap-2">
              <h4 className="text-sm font-bold uppercase tracking-wider opacity-90">Fila Comum</h4>
              <div className="px-2 py-0.5 text-[9px] uppercase font-bold tracking-widest text-stone-300 bg-[var(--bg-base)] border border-[var(--panel-border)] rounded">Sem custo</div>
            </div>
            <p className="text-[11px] leading-relaxed opacity-60">
              Entre na lista de espera comum e aguarde o contato de nossa equipe assim que abrirem novos horários.
            </p>
            <button className="btn-3d w-full py-3 mt-2 font-bold text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-inherit flex items-center justify-center gap-2">
              Entrar na Fila
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center flex flex-col gap-1.5 opacity-50 pb-8">
          <p className="text-[9px] uppercase tracking-widest font-medium">
            Instituto Pádua · Rua Guaxupé, 327 — Vila Formosa<br/>São Paulo, SP
          </p>
          <p className="text-[8px] uppercase tracking-widest">
            Desenvolvido pela Padcon
          </p>
        </footer>

      </main>
    </div>
  );
}
