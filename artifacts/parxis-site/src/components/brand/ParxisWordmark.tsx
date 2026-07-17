import { useId } from "react";
import parxisFace from "@/assets/brand/parxis-wordmark.png";
import parxisClean from "@/assets/brand/parxis-wordmark-clean.png";

const CYCLE_MS = 12000;
const BREATH_MS = 6200;

type Props = {
  width?: number;
  cycleDelay?: number;
  className?: string;
};

export function ParxisWordmark({ width = 320, cycleDelay = 0, className }: Props) {
  const uid = useId().replace(/:/g, "");
  const sweep = `prg-sweep-${uid}`;
  const spark = `prg-spark-${uid}`;
  const breath = `prg-breath-${uid}`;
  const maskUrl = `url(${parxisClean})`;

  const css = `
    .${sweep}, .${spark}, .${breath} {
      position: absolute; inset: 0; pointer-events: none; overflow: hidden;
      mix-blend-mode: screen;
      -webkit-mask-image: ${maskUrl}; mask-image: ${maskUrl};
      -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
      -webkit-mask-size: contain; mask-size: contain;
      -webkit-mask-position: center; mask-position: center;
      -webkit-mask-mode: luminance; mask-mode: luminance;
    }
    .${breath}::before {
      content: ""; position: absolute; inset: 0;
      background: radial-gradient(78% 135% at 50% 42%,
        rgba(255,240,200,0.62) 0%, rgba(255,236,190,0.22) 38%, transparent 70%);
      opacity: 0;
      animation: ${breath} ${BREATH_MS}ms ease-in-out ${cycleDelay}ms infinite;
    }
    @keyframes ${breath} {
      0%, 100% { opacity: 0.02; }
      50%      { opacity: 0.18; }
    }
    .${sweep}::before {
      content: ""; position: absolute; top: -30%; bottom: -30%; left: 0; width: 56%;
      background: linear-gradient(100deg,
        transparent 0%,
        rgba(255,231,150,0.32) 38%,
        rgba(255,247,214,0.92) 50%,
        rgba(255,231,150,0.32) 62%,
        transparent 100%);
      transform: translateX(-180%) skewX(-14deg); opacity: 0;
      animation: ${sweep} ${CYCLE_MS}ms cubic-bezier(.45,0,.55,1) ${cycleDelay}ms infinite backwards;
    }
    @keyframes ${sweep} {
      0%   { transform: translateX(-180%) skewX(-14deg); opacity: 0; }
      26%  { transform: translateX(-180%) skewX(-14deg); opacity: 0; }
      30%  { opacity: 1; }
      45%  { transform: translateX(320%) skewX(-14deg); opacity: 1; }
      48%  { transform: translateX(320%) skewX(-14deg); opacity: 0; }
      100% { transform: translateX(320%) skewX(-14deg); opacity: 0; }
    }
    .${spark}::before {
      content: ""; position: absolute; top: -30%; bottom: -30%; left: 0; width: 13%;
      background: linear-gradient(100deg, transparent 0%, rgba(255,253,235,0.95) 50%, transparent 100%);
      transform: translateX(-220%) skewX(-14deg); opacity: 0;
      animation: ${spark} ${CYCLE_MS}ms linear ${cycleDelay}ms infinite backwards;
    }
    @keyframes ${spark} {
      0%   { transform: translateX(-220%) skewX(-14deg); opacity: 0; }
      2%   { transform: translateX(-220%) skewX(-14deg); opacity: 0; }
      5%   { opacity: 1; }
      21%  { transform: translateX(360%) skewX(-14deg); opacity: 1; }
      24%  { transform: translateX(360%) skewX(-14deg); opacity: 0; }
      100% { transform: translateX(360%) skewX(-14deg); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .${sweep}::before, .${spark}::before, .${breath}::before { animation: none; opacity: 0; }
    }
  `;

  return (
    <div
      className={className}
      style={{ position: "relative", width, lineHeight: 0, flexShrink: 0 }}
    >
      <style>{css}</style>
      <img
        src={parxisFace}
        alt="PARXIS"
        draggable={false}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          mixBlendMode: "screen",
        }}
      />
      <div className={breath} aria-hidden="true" />
      <div className={spark} aria-hidden="true" />
      <div className={sweep} aria-hidden="true" />
    </div>
  );
}

export default ParxisWordmark;
