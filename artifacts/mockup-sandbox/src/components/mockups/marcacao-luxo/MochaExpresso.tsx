import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Check, User, ChevronRight, Play, Pause } from 'lucide-react';
import SYMBOL_GOLD from '../../../assets/paxter-symbol-gold.png';
import VID1 from '../../../assets/videos/v1.mp4';
import VID2 from '../../../assets/videos/v2.mp4';
import VID3 from '../../../assets/videos/v3.mp4';
import POSTER1 from '../../../assets/videos/v1.jpg';
import POSTER2 from '../../../assets/videos/v2.jpg';
import POSTER3 from '../../../assets/videos/v3.jpg';

const VIDEOS = [
  { id: 1, title: 'Como Funciona', src: VID1, poster: POSTER1 },
  { id: 2, title: 'Nossa Clínica', src: VID2, poster: POSTER2 },
  { id: 3, title: 'Depoimentos', src: VID3, poster: POSTER3 },
];

export default function MochaExpresso() {
  const [motivo, setMotivo] = useState('toxina');
  const [prof, setProf] = useState('caio');
  const [dia, setDia] = useState('24');
  const [hora, setHora] = useState('14:00');
  const [mounted, setMounted] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const vids = videoRefs.current.filter(Boolean) as HTMLVideoElement[];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting && e.intersectionRatio >= 0.6 && !motionPaused) {
            v.play().catch(() => {});
          } else {
            v.pause();
          }
        });
      },
      { threshold: [0, 0.6, 1] }
    );
    vids.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, [motionPaused]);

  useEffect(() => {
    if (!motionPaused) return;
    (videoRefs.current.filter(Boolean) as HTMLVideoElement[]).forEach((v) => v.pause());
  }, [motionPaused]);

  return (
    <div className="relative min-h-[100dvh] w-full max-w-[430px] mx-auto bg-[#1a0f0a] text-[#f4e2a8] overflow-x-hidden flex flex-col font-sans selection:bg-[#c2a05a]/30 pb-12">
      <style>{`
        /* Textura de LINHO no fundo BASE da tela */
        .linen-bg {
          background-color: #1a0f0a;
          background-image: 
            repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px),
            linear-gradient(180deg, #24140d 0%, #110906 100%);
          background-size: 100% 100%, 100% 100%, 100% 100%;
        }

        /* Ouro sólido / champanhe */
        .text-gold { 
          background: linear-gradient(180deg, #fcebaf 0%, #d8ae57 45%, #967022 100%); 
          -webkit-background-clip: text; 
          -webkit-text-fill-color: transparent; 
        }
        .bg-gold { 
          background: linear-gradient(180deg, #fcebaf 0%, #d8ae57 45%, #967022 100%); 
        }

        /* 3D Premium Button */
        .btn-premium {
          background: linear-gradient(180deg, #3d1b11 0%, #1f0b06 100%);
          box-shadow: 
            inset 0 2px 1px rgba(244, 226, 168, 0.15), 
            inset 0 -4px 8px rgba(0,0,0,0.8), 
            0 12px 24px rgba(0,0,0,0.6), 
            0 0 20px rgba(194, 160, 90, 0.15),
            inset 0 0 0 1px rgba(194, 160, 90, 0.5);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-premium:active { 
          transform: translateY(2px); 
          box-shadow: 
            inset 0 4px 10px rgba(0,0,0,0.9), 
            0 4px 8px rgba(0,0,0,0.4),
            inset 0 0 0 1px rgba(194, 160, 90, 0.3); 
        }

        /* Textura GRANULAR (grão de couro) nos painéis superiores */
        .leather-panel {
          background-color: #2c160c;
          background-image: 
            url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E"),
            linear-gradient(180deg, rgba(68,36,20,0.6) 0%, rgba(31,14,7,0.8) 100%);
          border: 1px solid rgba(194, 160, 90, 0.15);
          border-top: 1px solid rgba(194, 160, 90, 0.3);
          box-shadow: 
            0 12px 30px rgba(0,0,0,0.7), 
            inset 0 1px 0 rgba(255,255,255,0.05),
            inset 0 0 20px rgba(0,0,0,0.4);
          border-radius: 16px;
        }

        /* Concave Wells */
        .concave-3d {
          background: rgba(14, 6, 3, 0.6);
          box-shadow: inset 0 2px 12px rgba(0,0,0,0.8);
          border: 1px solid rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
        }

        /* 3D Chips Cognac / Bordeaux */
        .chip-3d {
          background: linear-gradient(180deg, #381e13 0%, #210f08 100%);
          border: 1px solid rgba(194, 160, 90, 0.1);
          border-top: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          border-radius: 10px;
          transition: all 0.2s ease;
        }
        .chip-3d[data-active="true"] {
          background: linear-gradient(180deg, #4d2315 0%, #2f1309 100%);
          border-color: #d8ae57;
          box-shadow: 0 0 16px rgba(216, 174, 87, 0.25), inset 0 1px 0 rgba(252, 235, 175, 0.3);
        }

        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        
        @keyframes slideUpFade {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .anim-enter { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-delay-1 { animation-delay: 0.1s; }
        .anim-delay-2 { animation-delay: 0.2s; }
        .anim-delay-3 { animation-delay: 0.3s; }
        
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
        
        @keyframes taglineEnter {
          0% { opacity: 0; transform: translateX(-20px) scale(0.95); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        .tagline-anim { animation: taglineEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; animation-delay: 0.4s; }

        @keyframes auraPulse {
          0%, 100% { opacity: 0.25; transform: scale(0.9); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
        .aura-pulse { animation: auraPulse 3s ease-in-out infinite; }

        /* Gilt Frame Neoclássica */
        .gilt-frame {
          position: relative;
          padding: 13px;
          border-radius: 3px;
          background: linear-gradient(135deg, #6f5421 0%, #f6e6a8 16%, #c9a24e 36%, #8a6d2f 54%, #f1dd9a 74%, #927235 100%);
          box-shadow:
            inset 0 0 0 1px rgba(255,243,205,0.55),
            inset 0 2px 3px rgba(255,247,214,0.6),
            inset 0 -3px 7px rgba(54,36,8,0.75),
            0 12px 26px rgba(0,0,0,0.55),
            0 0 22px rgba(194,160,90,0.22);
        }
        .gilt-frame::before {
          content: '';
          position: absolute;
          inset: 6px;
          border-radius: 2px;
          box-shadow:
            inset 0 0 0 1px rgba(54,36,8,0.85),
            inset 0 0 0 3px rgba(244,226,168,0.30),
            inset 0 1px 3px rgba(0,0,0,0.7);
          pointer-events: none;
          z-index: 1;
        }
        .gilt-mat {
          position: relative;
          z-index: 0;
          padding: 4px;
          background: #120703;
          border: 1px solid rgba(244,226,168,0.4);
          box-shadow: inset 0 2px 9px rgba(0,0,0,0.9);
          overflow: hidden;
          border-radius: 1px;
        }
        .gilt-corner {
          position: absolute;
          width: 22px; height: 22px;
          z-index: 3;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 42%, #f8ecb8 0%, #d9b85e 34%, #8a6d2f 68%, #5a451d 100%);
          box-shadow: 0 1px 2px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,250,228,0.85), inset 0 -2px 3px rgba(54,36,8,0.7);
        }
        .gilt-corner::after {
          content: '';
          position: absolute;
          inset: 6px;
          border-radius: 50%;
          background: radial-gradient(circle, #5a451d 0%, #8a6d2f 60%, transparent 100%);
        }
        .gilt-corner-tl { top: -7px; left: -7px; }
        .gilt-corner-tr { top: -7px; right: -7px; }
        .gilt-corner-bl { bottom: -7px; left: -7px; }
        .gilt-corner-br { bottom: -7px; right: -7px; }
        
        .nameplate {
          background: linear-gradient(180deg, #f8ecb8 0%, #c9a24e 52%, #8a6d2f 100%);
          border: 1px solid rgba(54,36,8,0.5);
          border-radius: 3px;
          box-shadow: inset 0 1px 1px rgba(255,250,228,0.85), inset 0 -2px 3px rgba(54,36,8,0.6), 0 4px 10px rgba(0,0,0,0.5);
        }
      `}</style>

      <div className="linen-bg absolute inset-0 z-0 pointer-events-none" />

      {/* 1 & 2. Header & Tagline */}
      <header className="relative z-10 pt-14 pb-8 px-6 flex flex-col items-center">
        <div className="relative w-16 h-16 mb-4">
          <div
            className="aura-pulse absolute inset-0"
            style={{ background: 'radial-gradient(circle, rgba(216,174,87,0.4) 0%, transparent 65%)', filter: 'blur(6px)' }}
            aria-hidden="true"
          />
          <img 
            src={SYMBOL_GOLD} 
            alt="Paxter" 
            className="absolute inset-0 w-full h-full object-contain filter brightness-90" 
          />
          <img 
            src={SYMBOL_GOLD} 
            alt="" 
            className="absolute inset-0 w-full h-full object-contain ray-sweep filter brightness-150 drop-shadow-[0_0_8px_rgba(216,174,87,0.8)]" 
            aria-hidden="true" 
          />
        </div>
        <h1 className="text-2xl font-bold tracking-[0.25em] text-gold mb-1">PAXTER</h1>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#d8ae57] font-medium tagline-anim opacity-80">
          Clinical Intelligence System
        </p>
      </header>

      <main className="relative z-10 flex flex-col gap-8">
        
        {/* 3. Hero Button */}
        <div className="px-6 anim-enter">
          <button className="btn-premium w-full py-5 px-6 flex items-center justify-between group outline-none rounded-xl">
            <span className="text-base font-bold tracking-widest text-gold uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              Marcar Consulta
            </span>
            <span className="w-8 h-8 rounded-full bg-[#d8ae57]/10 flex items-center justify-center border border-[#d8ae57]/30 group-active:scale-95 transition-transform">
              <ChevronRight className="w-5 h-5 text-[#fcebaf]" />
            </span>
          </button>
        </div>

        {/* 4. Galeria de Vídeos */}
        <div className="anim-enter anim-delay-1 flex flex-col gap-4">
          <div className="px-6 flex flex-col items-center gap-2">
            <h2 className="font-serif italic text-lg text-gold tracking-wide">Galeria da Experiência</h2>
            <div className="w-16 h-px bg-gradient-to-r from-transparent via-[#d8ae57] to-transparent" />
            <button
              type="button"
              onClick={() => setMotionPaused((p) => !p)}
              aria-pressed={motionPaused}
              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] uppercase tracking-wider text-[#d8ae57]/70 border border-[#d8ae57]/20 bg-black/40 outline-none active:scale-95 transition-transform"
            >
              {motionPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {motionPaused ? 'Reproduzir' : 'Pausar'} animações
            </button>
          </div>
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-6 px-6 pb-5 pt-2 hide-scroll">
            {VIDEOS.map((vid, idx) => (
              <figure key={vid.id} className="snap-center shrink-0 w-[280px] flex flex-col items-center gap-3">
                <div className="gilt-frame w-full">
                  <span className="gilt-corner gilt-corner-tl" aria-hidden="true" />
                  <span className="gilt-corner gilt-corner-tr" aria-hidden="true" />
                  <span className="gilt-corner gilt-corner-bl" aria-hidden="true" />
                  <span className="gilt-corner gilt-corner-br" aria-hidden="true" />
                  <div className="gilt-mat">
                    <video
                      ref={(el) => { videoRefs.current[idx] = el; }}
                      className="w-full aspect-[16/9] object-cover block"
                      src={vid.src}
                      poster={vid.poster}
                      aria-label={`Vídeo de demonstração: ${vid.title}`}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  </div>
                </div>
                <figcaption className="nameplate px-5 py-1.5">
                  <span className="font-serif text-sm tracking-wide text-[#3a2a0e]">{vid.title}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        {/* 5. Booking Steps */}
        <div className="px-6 flex flex-col gap-6 anim-enter anim-delay-2">
          <div className="leather-panel p-5 flex flex-col gap-8">
            
            {/* Step A: Motivo */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-[#c1964d] uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#381e13] border border-[#593220] flex items-center justify-center text-[10px] text-[#e8cc96]">1</div>
                Motivo da Consulta
              </h3>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'toxina', label: 'Toxina Botulínica' },
                    { id: 'preenchimento', label: 'Preenchimento' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMotivo(m.id)}
                      data-active={motivo === m.id}
                      className="chip-3d px-3 py-2.5 text-xs font-medium text-[#e8cc96] data-[active=true]:text-gold flex items-center gap-2 justify-center"
                    >
                      <div className="flex-1 truncate">{m.label}</div>
                      {motivo === m.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setMotivo('avaliacao')}
                  data-active={motivo === 'avaliacao'}
                  className="chip-3d px-3 py-2.5 text-xs font-medium text-[#e8cc96] data-[active=true]:text-gold flex items-center gap-2 justify-center"
                >
                  <div className="truncate">Avaliação Global</div>
                  {motivo === 'avaliacao' && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              </div>
            </div>

            {/* Step B: Profissional */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-[#c1964d] uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#381e13] border border-[#593220] flex items-center justify-center text-[10px] text-[#e8cc96]">2</div>
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
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${p.active ? 'border-[#d8ae57] bg-black' : 'border-[#593220] bg-[#1a0f0a]'}`}>
                      <User className={`w-5 h-5 ${p.active ? 'text-[#fcebaf]' : 'text-[#c1964d]'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold truncate ${p.active ? 'text-gold' : 'text-[#e8cc96]'}`}>{p.name}</div>
                      <div className="text-xs text-[#a37e40] truncate">{p.role}</div>
                    </div>
                    {p.active && <div className="w-4 h-4 rounded-full bg-[#d8ae57]/20 flex items-center justify-center border border-[#d8ae57] shrink-0"><div className="w-2 h-2 rounded-full bg-[#fcebaf]" /></div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Step C: Dia */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-[#c1964d] uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#381e13] border border-[#593220] flex items-center justify-center text-[10px] text-[#e8cc96]">3</div>
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
                      <span className={`text-[10px] uppercase font-medium ${dia === d.id ? 'text-gold' : 'text-[#a37e40]'}`}>{d.day}</span>
                      <span className={`text-lg font-bold ${dia === d.id ? 'text-[#fcebaf]' : 'text-[#e8cc96]'}`}>{d.date}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step D: Horário */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-[#c1964d] uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#381e13] border border-[#593220] flex items-center justify-center text-[10px] text-[#e8cc96]">4</div>
                Horário
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {['09:00', '10:00', '11:30', '14:00', '15:30', '17:00'].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHora(h)}
                    data-active={hora === h}
                    className="chip-3d py-2.5 text-sm font-medium text-[#e8cc96] data-[active=true]:text-gold text-center"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Step E: Confirm Button */}
            <div className="pt-2">
              <button className="btn-premium w-full py-4 rounded-xl flex items-center justify-center gap-3">
                <Check className="w-5 h-5 text-[#fcebaf]" />
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
            className="leather-panel p-4 flex items-start gap-4 active:scale-[0.98] transition-transform outline-none"
          >
            <div className="w-10 h-10 rounded-full bg-black/40 border border-[#593220] flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#c1964d]" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <h4 className="text-sm font-semibold text-[#fcebaf] truncate">Instituto Pádua</h4>
              <p className="text-xs text-[#a37e40] leading-relaxed truncate">
                Rua Guaxupé, 327 — Vila Formosa<br />
                São Paulo, SP
              </p>
              <p className="text-[10px] text-[#c1964d] font-medium uppercase tracking-wider mt-1 flex items-center gap-1">
                Abrir no Mapa <ChevronRight className="w-3 h-3" />
              </p>
            </div>
          </a>
        </div>

        {/* 7. Footer */}
        <footer className="px-6 pb-6 pt-4 text-center anim-enter anim-delay-3">
          <p className="text-[10px] uppercase tracking-widest text-[#a37e40] font-medium">
            Instituto Pádua · Paxter
          </p>
          <p className="text-[9px] uppercase tracking-wider text-[#82612a] mt-1">
            Desenvolvido pela Padcon
          </p>
        </footer>

      </main>
    </div>
  );
}
