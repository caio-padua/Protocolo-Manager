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

export default function BordoLinho() {
  const [motivo, setMotivo] = useState('toxina');
  const [prof, setProf] = useState('caio');
  const [dia, setDia] = useState('24');
  const [hora, setHora] = useState('14:00');
  const [mounted, setMounted] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => setMounted(true), []);

  // Toca apenas o vídeo em foco (economia de bateria/CPU em mobile)
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

  // Pausa global imediata quando o usuário desliga o movimento
  useEffect(() => {
    if (!motionPaused) return;
    (videoRefs.current.filter(Boolean) as HTMLVideoElement[]).forEach((v) => v.pause());
  }, [motionPaused]);

  return (
    <div className="relative min-h-[100dvh] w-full max-w-[430px] mx-auto bg-[#36151b] text-[#f2e1d0] overflow-x-hidden flex flex-col font-sans selection:bg-[#d4af37]/30 pb-12 texture-linen">
      {/* Custom Styles */}
      <style>{`
        /* LINEN TEXTURE (Base) */
        .texture-linen {
          background-color: #4a1f26;
          background-image: 
            repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px),
            repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px),
            repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 2px, transparent 2px, transparent 8px),
            repeating-linear-gradient(180deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 2px, transparent 2px, transparent 8px),
            radial-gradient(ellipse at 50% 0%, #5d2b33 0%, #3a151b 70%, #290f13 100%);
        }

        /* LEATHER TEXTURE (Granular) */
        .texture-leather {
          background-color: #3b1920;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E");
          background-blend-mode: overlay;
        }
        
        .text-gold { background: linear-gradient(180deg, #f7e6a1 0%, #d4af37 45%, #9e7f22 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .bg-gold { background: linear-gradient(180deg, #f7e6a1 0%, #d4af37 45%, #9e7f22 100%); }
        .border-gold { border-color: #d4af37; }
        
        /* 3D Premium Button */
        .btn-premium {
          background: linear-gradient(180deg, #2b1216 0%, #17080a 100%);
          box-shadow: inset 0 2px 1px rgba(247, 230, 161, 0.25), inset 0 -4px 8px rgba(0,0,0,0.8), 0 12px 24px rgba(0,0,0,0.6), 0 0 20px rgba(212, 175, 55, 0.15);
          border: 1px solid rgba(212, 175, 55, 0.6);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-premium:active { transform: translateY(2px); box-shadow: inset 0 4px 10px rgba(0,0,0,0.9), 0 4px 8px rgba(0,0,0,0.4); }
        
        /* 3D Skeuomorphic Panels */
        .panel-3d {
          border: 1px solid rgba(255,255,255,0.06);
          border-top: 1px solid rgba(255,255,255,0.15);
          box-shadow: 0 16px 36px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08);
          border-radius: 16px;
        }
        
        /* Concave Wells */
        .concave-3d {
          background: rgba(0,0,0,0.4);
          box-shadow: inset 0 3px 14px rgba(0,0,0,0.8);
          border: 1px solid rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
        }
        
        /* 3D Chips */
        .chip-3d {
          background: linear-gradient(180deg, #441d24 0%, #2f1216 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-top: 1px solid rgba(255,255,255,0.15);
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          border-radius: 10px;
          transition: all 0.2s ease;
        }
        .chip-3d[data-active="true"] {
          background: linear-gradient(180deg, #51252d 0%, #3b1920 100%);
          border-color: #d4af37;
          box-shadow: 0 0 16px rgba(212, 175, 55, 0.25), inset 0 1px 0 rgba(247, 230, 161, 0.35);
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
          0%, 100% { opacity: 0.2; transform: scale(0.9); }
          50% { opacity: 0.5; transform: scale(1.15); }
        }
        .aura-pulse { animation: auraPulse 3s ease-in-out infinite; }

        /* ===== Moldura Neoclássica Dourada (gilt frame) ===== */
        .gilt-frame {
          position: relative;
          padding: 12px;
          border-radius: 4px;
          background:
            linear-gradient(135deg, #785c29 0%, #faebae 16%, #d9b152 36%, #9e7f22 54%, #fae6a2 74%, #9e7f22 100%);
          box-shadow:
            inset 0 0 0 1px rgba(250,235,174,0.5),
            inset 0 2px 3px rgba(250,235,174,0.6),
            inset 0 -3px 7px rgba(50,30,10,0.8),
            0 14px 28px rgba(0,0,0,0.6),
            0 0 24px rgba(212,175,55,0.25);
        }
        /* sulco esculpido interno da moldura */
        .gilt-frame::before {
          content: '';
          position: absolute;
          inset: 5px;
          border-radius: 3px;
          box-shadow:
            inset 0 0 0 1px rgba(50,30,10,0.9),
            inset 0 0 0 3px rgba(247,230,161,0.35),
            inset 0 1px 3px rgba(0,0,0,0.8);
          pointer-events: none;
          z-index: 1;
        }
        /* paspatur escuro (veludo vinho) + filete dourado */
        .gilt-mat {
          position: relative;
          z-index: 0;
          padding: 4px;
          background: #1f0b0f;
          border: 1px solid rgba(247,230,161,0.55);
          box-shadow: inset 0 2px 10px rgba(0,0,0,0.9);
          overflow: hidden;
          border-radius: 2px;
        }
        /* rosetas de canto (toque rococó/neoclássico) */
        .gilt-corner {
          position: absolute;
          width: 20px; height: 20px;
          z-index: 3;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 42%, #faebae 0%, #d4af37 34%, #9e7f22 68%, #664d14 100%);
          box-shadow: 0 2px 4px rgba(0,0,0,0.7), inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -2px 3px rgba(50,30,10,0.8);
        }
        .gilt-corner::after {
          content: '';
          position: absolute;
          inset: 5px;
          border-radius: 50%;
          background: radial-gradient(circle, #664d14 0%, #9e7f22 60%, transparent 100%);
        }
        .gilt-corner-tl { top: -6px; left: -6px; }
        .gilt-corner-tr { top: -6px; right: -6px; }
        .gilt-corner-bl { bottom: -6px; left: -6px; }
        .gilt-corner-br { bottom: -6px; right: -6px; }
        /* cartela / nameplate de museu */
        .nameplate {
          background: linear-gradient(180deg, #faebae 0%, #d9b152 52%, #9e7f22 100%);
          border: 1px solid rgba(50,30,10,0.6);
          border-radius: 3px;
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -2px 3px rgba(50,30,10,0.7), 0 5px 12px rgba(0,0,0,0.6);
        }
      `}</style>

      {/* 1. Header & Tagline */}
      <header className="relative z-10 pt-14 pb-8 px-6 flex flex-col items-center">
        <div className="relative w-16 h-16 mb-4">
          <div
            className="aura-pulse absolute inset-0"
            style={{ background: 'radial-gradient(circle, rgba(247,230,161,0.5) 0%, transparent 65%)', filter: 'blur(8px)' }}
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
            className="absolute inset-0 w-full h-full object-contain ray-sweep filter brightness-150 drop-shadow-[0_0_8px_rgba(247,230,161,0.8)]" 
            aria-hidden="true" 
          />
        </div>
        <h1 className="text-2xl font-bold tracking-[0.25em] text-gold mb-1">PAXTER</h1>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#d4af37] font-medium tagline-anim">
          Clinical Intelligence System
        </p>
      </header>

      <main className="relative z-10 flex flex-col gap-8">
        
        {/* 2. Hero Button */}
        <div className="px-6 anim-enter">
          <button className="btn-premium w-full py-5 px-6 flex items-center justify-between group outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/50 rounded-xl">
            <span className="text-base font-bold tracking-widest text-gold uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              Marcar Consulta
            </span>
            <span className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center border border-[#d4af37]/30 group-active:scale-95 transition-transform">
              <ChevronRight className="w-5 h-5 text-[#faebae]" />
            </span>
          </button>
        </div>

        {/* 3. Galeria de Vídeos */}
        <div className="anim-enter anim-delay-1 flex flex-col gap-4">
          <div className="px-6 flex flex-col items-center gap-2">
            <h2 className="font-serif italic text-lg text-gold tracking-wide">Galeria da Experiência</h2>
            <div className="w-16 h-px bg-gradient-to-r from-transparent via-[#d4af37] to-transparent" />
            <button
              type="button"
              onClick={() => setMotionPaused((p) => !p)}
              aria-pressed={motionPaused}
              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] uppercase tracking-wider text-[#dcb1af] border border-[#d4af37]/20 bg-[#2b1216]/60 outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/60 active:scale-95 transition-transform backdrop-blur-sm"
            >
              {motionPaused ? <Play className="w-3 h-3 text-[#d4af37]" /> : <Pause className="w-3 h-3 text-[#d4af37]" />}
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
                  <span className="font-serif text-sm font-bold tracking-wide text-[#3a2a0e]">{vid.title}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        {/* 4. Booking Steps */}
        <div className="px-6 flex flex-col gap-6 anim-enter anim-delay-2">
          <div className="panel-3d texture-leather p-5 flex flex-col gap-8">
            
            {/* Step A: Motivo */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-[#dcb1af] uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#441d24] border border-[#7a3944] flex items-center justify-center text-[10px] text-[#f2e1d0]">1</div>
                Motivo da Consulta
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'toxina', label: 'Toxina Botulínica' },
                  { id: 'preenchimento', label: 'Preenchimento' },
                  { id: 'avaliacao', label: 'Avaliação Global' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMotivo(m.id)}
                    data-active={motivo === m.id}
                    className="chip-3d px-3 py-2.5 text-[13px] font-medium text-[#f2e1d0] data-[active=true]:text-gold flex items-center gap-2"
                  >
                    {motivo === m.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step B: Profissional */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-[#dcb1af] uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#441d24] border border-[#7a3944] flex items-center justify-center text-[10px] text-[#f2e1d0]">2</div>
                Profissional
              </h3>
              <div className="grid grid-cols-1 gap-2">
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
                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center border-2 ${p.active ? 'border-[#d4af37] bg-[#1a0a0c]' : 'border-[#7a3944] bg-[#2b1216]'}`}>
                      <User className={`w-5 h-5 ${p.active ? 'text-[#faebae]' : 'text-[#dcb1af]'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold truncate ${p.active ? 'text-gold' : 'text-[#f2e1d0]'}`}>{p.name}</div>
                      <div className="text-xs text-[#b88c94] truncate">{p.role}</div>
                    </div>
                    {p.active && <div className="w-4 h-4 shrink-0 rounded-full bg-gold/20 flex items-center justify-center border border-[#d4af37]"><div className="w-2 h-2 rounded-full bg-[#faebae]" /></div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Step C: Dia */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-[#dcb1af] uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#441d24] border border-[#7a3944] flex items-center justify-center text-[10px] text-[#f2e1d0]">3</div>
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
                      <span className={`text-[10px] uppercase font-medium ${dia === d.id ? 'text-gold' : 'text-[#dcb1af]'}`}>{d.day}</span>
                      <span className={`text-lg font-bold ${dia === d.id ? 'text-[#f2e1d0]' : 'text-[#dcb1af]'}`}>{d.date}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step D: Horário */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wider text-[#dcb1af] uppercase flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#441d24] border border-[#7a3944] flex items-center justify-center text-[10px] text-[#f2e1d0]">4</div>
                Horário
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {['09:00', '10:00', '11:30', '14:00', '15:30', '17:00'].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHora(h)}
                    data-active={hora === h}
                    className="chip-3d py-2.5 text-sm font-medium text-[#f2e1d0] data-[active=true]:text-gold text-center"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Step E: Confirm Button */}
            <div className="pt-2">
              <button className="btn-premium w-full py-4 rounded-xl flex items-center justify-center gap-3">
                <Check className="w-5 h-5 text-[#faebae]" />
                <span className="text-sm font-bold tracking-widest text-gold uppercase">Confirmar Agendamento</span>
              </button>
            </div>

          </div>
        </div>

        {/* 5. Address */}
        <div className="px-6 anim-enter anim-delay-3">
          <a
            href="https://www.google.com/maps/search/?api=1&query=Rua%20Guaxup%C3%A9%2C%20327%20-%20Vila%20Formosa%2C%20S%C3%A3o%20Paulo%2C%20SP"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir endereço Rua Guaxupé, 327, Vila Formosa, São Paulo no mapa"
            className="panel-3d texture-leather p-4 flex items-start gap-4 active:scale-[0.98] transition-transform outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/60 rounded-2xl"
          >
            <div className="w-10 h-10 rounded-full bg-[#1a0a0c] border border-[#d4af37]/40 flex items-center justify-center shrink-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]">
              <MapPin className="w-5 h-5 text-[#d4af37]" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <h4 className="text-sm font-semibold text-[#f2e1d0] truncate">Instituto Pádua</h4>
              <p className="text-xs text-[#dcb1af] leading-relaxed truncate">
                Rua Guaxupé, 327 — Vila Formosa<br />
                São Paulo, SP
              </p>
              <p className="text-[10px] text-[#d4af37] font-medium uppercase tracking-wider mt-1 flex items-center gap-1">
                Abrir no Mapa <ChevronRight className="w-3 h-3" />
              </p>
            </div>
          </a>
        </div>

        {/* 6. Footer */}
        <footer className="px-6 pb-6 pt-4 text-center anim-enter anim-delay-3">
          <p className="text-[10px] uppercase tracking-widest text-[#b88c94] font-medium">
            Instituto Pádua · Paxter
          </p>
          <p className="text-[9px] uppercase tracking-wider text-[#7a3944] mt-1">
            Desenvolvido pela Padcon
          </p>
        </footer>

      </main>
    </div>
  );
}
