import { useState } from "react";

type Variante = { id: string; nome: string; ideia: string; cor: string; fundo: string; borda: string; sombra: string; brilho: string };

const variantes: Variante[] = [
  { id: "acetinado", nome: "01 · Vidro acetinado", ideia: "Cor suave, superfície fosca e toque de profundidade.", cor: "#54847b", fundo: "linear-gradient(180deg, rgba(121,174,158,.66), rgba(76,133,119,.76))", borda: "rgba(62,111,99,.48)", sombra: "inset 0 1px 0 rgba(255,255,255,.8), inset 0 -2px 3px rgba(34,79,70,.16)", brilho: "rgba(227,241,231,.7)" },
  { id: "perola", nome: "02 · Vidro pérola", ideia: "Um véu de cor claro, discreto e elegante.", cor: "#9a7950", fundo: "linear-gradient(180deg, rgba(217,195,145,.7), rgba(190,158,103,.78))", borda: "rgba(146,112,59,.48)", sombra: "inset 0 1px 0 rgba(255,255,255,.86), inset 0 -2px 3px rgba(111,79,34,.15)", brilho: "rgba(255,248,225,.76)" },
  { id: "opalino", nome: "03 · Vidro opalino", ideia: "Leitoso e colorido, sem brilho artificial.", cor: "#72869b", fundo: "linear-gradient(180deg, rgba(163,186,199,.68), rgba(116,147,165,.78))", borda: "rgba(79,111,130,.5)", sombra: "inset 0 1px 0 rgba(255,255,255,.82), inset 0 -2px 3px rgba(56,86,106,.16)", brilho: "rgba(239,246,244,.72)" },
  { id: "rosa", nome: "04 · Vidro rosé", ideia: "Rosa queimado suave, com borda fina.", cor: "#a06f70", fundo: "linear-gradient(180deg, rgba(206,157,149,.68), rgba(171,112,110,.78))", borda: "rgba(137,81,81,.48)", sombra: "inset 0 1px 0 rgba(255,255,255,.8), inset 0 -2px 3px rgba(105,56,57,.16)", brilho: "rgba(248,231,220,.72)" },
  { id: "fumee", nome: "05 · Vidro fumê", ideia: "Azul-petróleo profundo, ainda fosco e sóbrio.", cor: "#486d70", fundo: "linear-gradient(180deg, rgba(117,151,148,.72), rgba(67,108,108,.84))", borda: "rgba(48,85,88,.54)", sombra: "inset 0 1px 0 rgba(255,255,255,.72), inset 0 -2px 3px rgba(25,58,62,.2)", brilho: "rgba(221,237,228,.66)" },
];

const agendas = [
  { equipe: "Agenda médico", nome: "Consultório 02 · Sede", profissional: "Dra. Helena Duarte", lotacao: "4/6", cor: "#658a83" },
  { equipe: "Agenda enfermagem", nome: "Sala de procedimentos", profissional: "Enf. Paula Nunes", lotacao: "5/8", cor: "#9b7477" },
  { equipe: "Agenda biomédico", nome: "Coleta · Laboratório", profissional: "Biom. Rafael Costa", lotacao: "2/5", cor: "#7587a0" },
];

export function AgendaPerfisVidro() {
  const [ativa, setAtiva] = useState("acetinado");
  const atual = variantes.find((v) => v.id === ativa) ?? variantes[0];
  const [agendaAtual, setAgendaAtual] = useState(0);
  const [hover, setHover] = useState<string | null>(null);

  return (
    <main className="av-page">
      <style>{`
        *{box-sizing:border-box}button{font:inherit}.av-page{min-height:100dvh;background:#e5e8e6;color:#26394a;font-family:'DM Sans','Segoe UI',sans-serif;padding:0 0 32px}
        .av-header{height:60px;padding:0 34px;display:flex;align-items:center;justify-content:space-between;background:#172e43;color:#e8e5d9;box-shadow:0 3px 10px rgba(20,42,60,.14)}
        .av-brand{display:flex;align-items:center;gap:10px}.av-mark{width:28px;height:28px;display:grid;place-items:center;border:1px solid #b8a56e;color:#e4d7b5;font:18px Georgia,serif}.av-brand b{display:block;font:700 11px Georgia,serif;letter-spacing:.2em}.av-brand small{display:block;margin-top:3px;color:#abb7bc;font-size:7px;letter-spacing:.15em}.av-date{color:#b7c0c3;font-size:8px;font-weight:800;letter-spacing:.13em}
        .av-shell{max-width:1380px;margin:0 auto;padding:33px 42px}.av-eyebrow{color:#768690;font-size:9px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.av-title{margin:9px 0 0;color:#20374a;font:500 clamp(29px,3.3vw,43px)/1.06 Georgia,serif;letter-spacing:-.03em}.av-lede{max-width:730px;margin:10px 0 0;color:#75858e;font-size:12px;line-height:1.65}.av-rule{height:1px;margin:24px 0 19px;background:linear-gradient(90deg,#b8c3c3,transparent)}
        .av-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:13px}.av-section-label{color:#617785;font-size:9px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.av-section-note{color:#87949a;font-size:9px}.av-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px;align-items:stretch}
        .av-sample{min-width:0;padding:10px;border:1px solid #c7cecf;border-radius:6px;background:linear-gradient(145deg,#eff1ed,#dfe3e2);box-shadow:inset 1px 1px 2px #fff,inset -1px -1px 2px #c9d0d0,0 2px 5px rgba(27,48,64,.08);cursor:pointer;text-align:left;color:inherit;transition:transform .16s,opacity .16s}
        .av-sample:hover{transform:translateY(-2px)}.av-sample:focus-visible{outline:2px solid #a8905b;outline-offset:2px}.av-sample[aria-pressed="true"]{border-color:#a89461;box-shadow:inset 1px 1px 2px #fff,inset -1px -1px 2px #c9d0d0,0 0 0 2px rgba(168,148,97,.22),0 3px 7px rgba(27,48,64,.1)}
        .av-sample-num{display:block;color:#77888f;font-size:8px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.av-sample-title{display:block;margin-top:5px;color:#293e50;font:700 15px Georgia,serif}.av-sample-copy{display:block;min-height:30px;margin-top:5px;color:#7c898f;font-size:9px;line-height:1.5}
        .av-demo{margin-top:11px;padding:12px 11px 9px;border:1px solid #c5cdce;border-top-color:#fff;border-radius:5px;background:linear-gradient(145deg,#f4f5f1,#e2e6e4);box-shadow:inset 1px 1px 2px #fff,inset -2px -2px 4px #c9d0d0,0 3px 6px rgba(28,48,64,.09)}
        .av-demo-team{display:block;color:#798890;font-size:7px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.av-demo-name{display:block;overflow:hidden;margin-top:4px;color:#283e50;font:700 13px/1.15 Georgia,serif;text-overflow:ellipsis;white-space:nowrap}.av-demo-prof{display:block;overflow:hidden;margin-top:4px;color:#879399;font-size:8px;text-overflow:ellipsis;white-space:nowrap}
        .av-profile{position:relative;display:flex;align-items:center;justify-content:space-between;gap:6px;height:13px;margin-top:9px;padding:0 6px;overflow:hidden;border:1px solid var(--stroke);border-radius:2px;background:var(--glass);box-shadow:var(--inset);color:#294252;font-size:6px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
        .av-profile::before{content:"";position:absolute;left:2px;right:2px;top:1px;height:1px;background:var(--shine);opacity:.8}.av-profile span{position:relative;z-index:1}.av-profile b{font:700 9px Georgia,serif;letter-spacing:0}.av-profile-track{height:3px;flex:1;min-width:10px;overflow:hidden;border-radius:2px;background:rgba(30,52,65,.12);box-shadow:inset 0 1px 1px rgba(30,52,65,.16)}.av-profile-track i{display:block;height:100%;width:67%;background:var(--ink);opacity:.8;border-radius:2px}
        .av-footlabel{display:flex;justify-content:space-between;gap:5px;margin-top:6px;color:#89969a;font-size:6px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.av-footlabel span:last-child{color:#788b89}
        .av-focus{display:grid;grid-template-columns:minmax(0,1fr) 290px;align-items:center;gap:25px;margin-top:24px;padding:17px 19px;border:1px solid #c4cccd;border-radius:6px;background:linear-gradient(145deg,#e0e4e3,#edf0ed);box-shadow:inset 2px 2px 4px #bdc7c8,inset -2px -2px 4px #fff}
        .av-focus-kicker{display:block;color:#849196;font-size:8px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.av-focus-title{display:block;margin-top:5px;color:#263b4d;font:700 19px Georgia,serif}.av-focus-desc{margin:5px 0 0;color:#78878d;font-size:10px;line-height:1.5}.av-preview{padding:11px 13px 10px;border:1px solid #c5cdce;border-radius:5px;background:linear-gradient(145deg,#eff1ed,#dfe4e2);box-shadow:inset 1px 1px 2px #fff,inset -2px -2px 3px #c3cccc,0 3px 6px rgba(20,43,60,.09)}.av-preview-top{display:flex;justify-content:space-between;color:#78878d;font-size:7px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.av-preview-name{display:block;margin-top:5px;color:#293f51;font:700 14px Georgia,serif}.av-preview-prof{display:block;margin-top:3px;color:#829096;font-size:8px}
        .av-bottom{display:flex;justify-content:space-between;gap:15px;margin-top:16px;color:#89969a;font-size:7px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
        @media(max-width:1050px){.av-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.av-shell{padding-left:26px;padding-right:26px}}
        @media(max-width:700px){.av-header{height:54px;padding:0 15px}.av-date{font-size:7px}.av-shell{padding:24px 16px}.av-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.av-sample{padding:9px}.av-focus{grid-template-columns:1fr;gap:14px}.av-section-head{align-items:flex-start;flex-direction:column;gap:5px}.av-title{font-size:32px}}
        @media(max-width:420px){.av-grid{grid-template-columns:1fr}.av-sample{display:grid;grid-template-columns:1fr 1fr;column-gap:9px}.av-sample-num,.av-sample-title,.av-sample-copy{grid-column:1}.av-demo{grid-column:2;grid-row:1 / span 4;margin-top:0;align-self:center}.av-footlabel{grid-column:1}.av-bottom{flex-direction:column}}
        @media(prefers-reduced-motion:reduce){.av-sample{transition:none}}
      `}</style>
      <header className="av-header"><div className="av-brand"><div className="av-mark">P</div><div><b>PAXTER</b><small>INSTITUTO PÁDUA · OPERAÇÃO</small></div></div><span className="av-date">ESTUDO VISUAL · PERFIL DE AGENDA</span></header>
      <section className="av-shell">
        <div className="av-eyebrow">AGENDA / EXPLORAÇÃO DE MATERIAL</div>
        <h1 className="av-title">Vidro de cor, sem luzinha.</h1>
        <p className="av-lede">Cinco opções para a barrinha retangular no rodapé do botão de agenda. A cor fica dentro do perfil inferior — não na lateral. São vidros foscos e pigmentados, com relevo suave, sem neon e sem brilho chamativo.</p>
        <div className="av-rule" />
        <div className="av-section-head"><span className="av-section-label">Cinco acabamentos para comparar</span><span className="av-section-note">Selecione uma opção para ver o detalhe ampliado abaixo.</span></div>
        <div className="av-grid" role="group" aria-label="Cinco opções de perfil de vidro">
          {variantes.map((v, i) => {
            const agenda = agendas[i % agendas.length];
            return (
              <button key={v.id} type="button" className="av-sample" aria-pressed={ativa === v.id} onClick={() => { setAtiva(v.id); setAgendaAtual(i % agendas.length); }} onMouseEnter={() => setHover(v.id)} onMouseLeave={() => setHover(null)}>
                <span className="av-sample-num">Variação {String(i + 1).padStart(2, "0")}</span>
                <span className="av-sample-title">{v.nome.split("· ")[1]}</span>
                <span className="av-sample-copy">{v.ideia}</span>
                <span className="av-demo" style={{ borderColor: hover === v.id ? v.borda : undefined }}>
                  <span className="av-demo-team">{agenda.equipe}</span>
                  <span className="av-demo-name">{agenda.nome}</span>
                  <span className="av-demo-prof">{agenda.profissional}</span>
                  <span className="av-profile" style={{ ["--glass" as string]: v.fundo, ["--stroke" as string]: v.borda, ["--inset" as string]: v.sombra, ["--shine" as string]: v.brilho, ["--ink" as string]: v.cor }}>
                    <span>Ocupado</span><span className="av-profile-track"><i /></span><b>{agenda.lotacao}</b>
                  </span>
                </span>
                <span className="av-footlabel"><span>Perfil inferior</span><span>{ativa === v.id ? "Selecionado" : "Ver opção"}</span></span>
              </button>
            );
          })}
        </div>
        <div className="av-focus" aria-live="polite">
          <div><span className="av-focus-kicker">Detalhe ampliado · {atual.nome}</span><strong className="av-focus-title">O vidro fica no rodapé, em uma faixa própria.</strong><p className="av-focus-desc">A informação de ocupação permanece legível; a cor aparece como uma camada translúcida contida no retângulo. Sem fita lateral, sem neon, sem efeito de luz.</p></div>
          <div className="av-preview"><span className="av-preview-top"><span>{agendas[agendaAtual].equipe}</span><span>Agenda ativa</span></span><strong className="av-preview-name">{agendas[agendaAtual].nome}</strong><span className="av-preview-prof">{agendas[agendaAtual].profissional}</span><span className="av-profile" style={{ ["--glass" as string]: atual.fundo, ["--stroke" as string]: atual.borda, ["--inset" as string]: atual.sombra, ["--shine" as string]: atual.brilho, ["--ink" as string]: atual.cor, height: 16, marginTop: 11, padding: "0 8px" }}><span>Ocupado</span><span className="av-profile-track"><i /></span><b>{agendas[agendaAtual].lotacao}</b></span></div>
        </div>
        <footer className="av-bottom"><span>PADCOM · CONCEITO VISUAL</span><span>SEM DADOS REAIS · PRÉVIA PARA APROVAÇÃO</span></footer>
      </section>
    </main>
  );
}
