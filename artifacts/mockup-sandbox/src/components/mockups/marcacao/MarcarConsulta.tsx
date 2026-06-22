import React, { useState, useEffect } from 'react';
import { MapPin, Play, Check, User, ChevronRight } from 'lucide-react';
import SYMBOL_GOLD from '../../../assets/paxter-symbol-gold.png';

export default function MarcarConsulta() {
  const [motivo, setMotivo] = useState('toxina');
  const [prof, setProf] = useState('caio');
  const [dia, setDia] = useState('24');
  const [hora, setHora] = useState('14:00');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className="relative min-h-[100dvh] w-full max-w-[430px] mx-auto bg-[#0d1830] text-slate-200 overflow-x-hidden flex flex-col font-sans selection:bg-[#c2a05a]/30 pb-12">
      {/* Custom Styles */}
      <style>{`
        .paxter-bg { background: radial-gradient(150% 100% at 50% 0%, #16284a 0%, #0d1830 50%, #070e1c 100%); }
        .text-gold { background: linear-gradient(180deg, #f4e2a8 0%, #c2a05a 45%, #8a6d2f 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .bg-gold { background: linear-gradient(180deg, #f4e2a8 0%, #c2a05a 45%, #8a6d2f 100%); }
        .border-gold { border-color: #c2a05a; }
        
        /* 3D Premium Button */
        .btn-premium {
          background: linear-gradient(180deg, #1a1a1a 0%, #000000 100%);
          box-shadow: inset 0 2px 1px rgba(244, 226, 168, 0.3), inset 0 -4px 8px rgba(0,0,0,0.8), 0 12px 24px rgba(0,0,0,0.6), 0 0 20px rgba(194, 160, 90, 0.15);
          border: 1px solid rgba(194, 160, 90, 0.8);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-premium:active { transform: translateY(2px); box-shadow: inset 0 4px 10px rgba(0,0,0,0.9), 0 4px 8px rgba(0,0,0,0.4); }
        
        /* 3D Skeuomorphic Panels */
        .panel-3d {
          background: linear-gradient(180deg, #182a4d 0%, #0f1c36 100%);
          border: 1px solid rgba(255,255,255,0.04);
          border-top: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 12px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
          border-radius: 16px;
        }
        
        /* Concave Wells */
        .concave-3d {
          background: rgba(0,0,0,0.3);
          box-shadow: inset 0 2px 12px rgba(0,0,0,0.6);
          border: 1px solid rgba(255,255,255,0.03);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
        }
        
        /* 3D Chips */
        .chip-3d {
          background: linear-gradient(180deg, #1c3057 0%, #12213d 100%);
          border: 1px solid rgba(255,255,255,0.05);
          border-top: 1px solid rgba(255,255,255,0.15);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          border-radius: 10px;
          transition: all 0.2s ease;
        }
        .chip-3d[data-active="true"] {
          background: linear-gradient(180deg, #243e6e 0%, #182b4d 100%);
          border-color: #c2a05a;
          box-shadow: 0 0 16px rgba(194, 160, 90, 0.2), inset 0 1px 0 rgba(244, 226, 168, 0.3);
        }
        
        /* Scroll hiding */
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        
        /* Animations */
        @keyframes slideUpFade {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .anim-enter { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-delay-1 { animation-delay: 0.1s; }
        .anim-delay-2 { animation-delay: 0.2s; }
        .anim-delay-3 { animation-delay: 0.3s; }
        
        /* Golden Shimmer Ray Sweep */
        @keyframes shimmerEffect {
          0% { mask-position: 200% center; -webkit-mask-position: 200% center; }
          100% { mask-position: -200% center; -webkit-mask-position: -200% center; }
        }
        .ray-sweep {
          mask-image: linear-gradient(-60deg, transparent 40%, rgba(0,0,0,1) 50%, transparent 60%);
          mask-size: 300% 100%;
          animation: shimmerEffect 4s infinite linear;
          mix-blend-mode: screen;
        }
        
        /* Tagline Slide In */
        @keyframes taglineEnter {
          0% { opacity: 0; transform: translateX(-20px) scale(0.95); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        .tagline-anim { animation: taglineEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; animation-delay: 0.4s; }

        /* Pulsing golden energy aura behind the symbol */
        @keyframes auraPulse {
          0%, 100% { opacity: 0.25; transform: scale(0.9); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
        .aura-pulse { animation: auraPulse 3s ease-in-out infinite; }
      `}</style>

      <div className="paxter-bg absolute inset-0 z-0 pointer-events-none" />

      {/* 1 & 2. Header & Tagline */}
      <header className="relative z-10 pt-14 pb-8 px-6 flex flex-col items-center">
        <div className="relative w-16 h-16 mb-4">
          {/* Pulsing golden energy aura */}
          <div
            className="aura-pulse absolute inset-0"
            style={{ background: 'radial-gradient(circle, rgba(244,226,168,0.45) 0%, transparent 65%)', filter: 'blur(6px)' }}
            aria-hidden="true"
          />
          {/* Base symbol, slightly dimmed to let the ray pop */}
          <img 
            src={SYMBOL_GOLD} 
            alt="Paxter" 
            className="absolute inset-0 w-full h-full object-contain filter brightness-75" 
          />
          {/* Animated energy ray/shimmer on top */}
          <img 
            src={SYMBOL_GOLD} 
            alt="" 
            className="absolute inset-0 w-full h-full object-contain ray-sweep filter brightness-150 drop-shadow-[0_0_8px_rgba(244,226,168,0.8)]" 
            aria-hidden="true" 
          />
        </div>
        <h1 className="text-2xl font-bold tracking-[0.25em] text-gold mb-1">PAXTER</h1>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#45B8CC] font-medium tagline-anim">
          Clinical Intelligence System
        </p>
      </header>

      <main className="relative z-10 flex flex-col gap-8">
        
        {/* 3. Hero Button */}
        <div className="px-6 anim-enter">
          <button className="btn-premium w-full py-5 px-6 flex items-center justify-between group outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/50 rounded-xl">
            <span className="text-base font-bold tracking-widest text-gold uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              Marcar Consulta
            </span>
            <span className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center border border-[#c2a05a]/30 group-active:scale-95 transition-transform">
              <ChevronRight className="w-5 h-5 text-[#f4e2a8]" />
            </span>
          </button>
        </div>

        {/* 4. Video Strip */}
        <div className="anim-enter anim-delay-1 flex flex-col gap-3">
          <div className="px-6 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Conheça a Experiência</h2>
          </div>
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 px-6 pb-4 hide-scroll">
            {[
              { id: 1, title: 'Como funciona', dur: '01:20' },
              { id: 2, title: 'Conheça a clínica', dur: '02:15' },
              { id: 3, title: 'Depoimentos', dur: '03:40' }
            ].map((vid) => (
              <button
                key={vid.id}
                type="button"
                aria-label={`Assistir vídeo: ${vid.title}, duração ${vid.dur}`}
                className="snap-start shrink-0 w-[260px] aspect-[16/9] panel-3d relative overflow-hidden group cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1830]"
              >
                {/* Placeholder gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#111d33] to-[#070d1a]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.05)_0%,_transparent_70%)]" />
                
                {/* Play Button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-[#c2a05a]/40 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-[0_0_15px_rgba(194,160,90,0.2)]">
                    <Play className="w-5 h-5 text-[#f4e2a8] ml-1 fill-[#f4e2a8]" />
                  </div>
                </div>
                
                {/* Captions */}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-sm font-medium text-slate-100">{vid.title}</p>
                  <p className="text-[10px] text-gold">{vid.dur}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 5. Booking Steps */}
        <div className="px-6 flex flex-col gap-6 anim-enter anim-delay-2">
          <div className="panel-3d p-5 flex flex-col gap-8">
            
            {/* Step A: Motivo */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#1c3057] border border-slate-600 flex items-center justify-center text-[10px] text-slate-300">1</div>
                Motivo da Consulta
              </h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'toxina', label: 'Toxina Botulínica' },
                  { id: 'preenchimento', label: 'Preenchimento' },
                  { id: 'avaliacao', label: 'Avaliação Global' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMotivo(m.id)}
                    data-active={motivo === m.id}
                    className="chip-3d px-4 py-2.5 text-sm font-medium text-slate-300 data-[active=true]:text-gold flex items-center gap-2"
                  >
                    {motivo === m.id && <Check className="w-3.5 h-3.5" />}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step B: Profissional */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#1c3057] border border-slate-600 flex items-center justify-center text-[10px] text-slate-300">2</div>
                Profissional
              </h3>
              <div className="flex flex-col gap-2">
                {[
                  { id: 'caio', name: 'Dr. Caio Pádua', role: 'Diretor Clínico', active: prof === 'caio' },
                  { id: 'ana', name: 'Dra. Ana Silva', role: 'Dermatologista', active: prof === 'ana' }
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProf(p.id)}
                    data-active={p.active}
                    className="chip-3d w-full p-3 flex items-center gap-4 text-left"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${p.active ? 'border-[#c2a05a] bg-black' : 'border-slate-600 bg-[#0d1830]'}`}>
                      <User className={`w-5 h-5 ${p.active ? 'text-[#f4e2a8]' : 'text-slate-400'}`} />
                    </div>
                    <div className="flex-1">
                      <div className={`font-semibold ${p.active ? 'text-gold' : 'text-slate-200'}`}>{p.name}</div>
                      <div className="text-xs text-slate-400">{p.role}</div>
                    </div>
                    {p.active && <div className="w-4 h-4 rounded-full bg-gold/20 flex items-center justify-center border border-[#c2a05a]"><div className="w-2 h-2 rounded-full bg-[#f4e2a8]" /></div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Step C: Dia */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#1c3057] border border-slate-600 flex items-center justify-center text-[10px] text-slate-300">3</div>
                Data
              </h3>
              <div className="concave-3d p-2">
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { day: 'Seg', date: '23', id: '23' },
                    { day: 'Ter', date: '24', id: '24' },
                    { day: 'Qua', date: '25', id: '25' },
                    { day: 'Qui', date: '26', id: '26' },
                    { day: 'Sex', date: '27', id: '27' }
                  ].map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDia(d.id)}
                      data-active={dia === d.id}
                      className="chip-3d py-3 flex flex-col items-center justify-center"
                    >
                      <span className={`text-[10px] uppercase font-medium ${dia === d.id ? 'text-gold' : 'text-slate-400'}`}>{d.day}</span>
                      <span className={`text-lg font-bold ${dia === d.id ? 'text-slate-100' : 'text-slate-300'}`}>{d.date}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step D: Horário */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#1c3057] border border-slate-600 flex items-center justify-center text-[10px] text-slate-300">4</div>
                Horário
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {['09:00', '10:00', '11:30', '14:00', '15:30', '17:00'].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHora(h)}
                    data-active={hora === h}
                    className="chip-3d py-2.5 text-sm font-medium text-slate-300 data-[active=true]:text-gold text-center"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Step E: Confirm Button */}
            <div className="pt-2">
              <button className="btn-premium w-full py-4 rounded-xl flex items-center justify-center gap-3">
                <Check className="w-5 h-5 text-[#f4e2a8]" />
                <span className="text-sm font-bold tracking-widest text-gold uppercase">Confirmar Agendamento</span>
              </button>
            </div>

          </div>
        </div>

        {/* 6. Address */}
        <div className="px-6 anim-enter anim-delay-3">
          <a
            href="https://www.google.com/maps/search/?api=1&query=Rua%20Guaxup%C3%A9%2C%20327%20-%20Vila%20Formosa%2C%20S%C3%A3o%20Paulo%2C%20SP"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir endereço Rua Guaxupé, 327, Vila Formosa, São Paulo no mapa"
            className="panel-3d p-4 flex items-start gap-4 active:scale-[0.98] transition-transform outline-none focus-visible:ring-2 focus-visible:ring-[#45B8CC]/60 rounded-2xl"
          >
            <div className="w-10 h-10 rounded-full bg-black/30 border border-slate-600 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#45B8CC]" />
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold text-slate-200">Instituto Pádua</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rua Guaxupé, 327 — Vila Formosa<br />
                São Paulo, SP
              </p>
              <p className="text-[10px] text-[#45B8CC] font-medium uppercase tracking-wider mt-1 flex items-center gap-1">
                Abrir no Mapa <ChevronRight className="w-3 h-3" />
              </p>
            </div>
          </a>
        </div>

        {/* 7. Footer */}
        <footer className="px-6 pb-6 pt-4 text-center anim-enter anim-delay-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            Instituto Pádua · Paxter
          </p>
          <p className="text-[9px] uppercase tracking-wider text-slate-600 mt-1">
            Desenvolvido pela Padcon
          </p>
        </footer>

      </main>
    </div>
  );
}
