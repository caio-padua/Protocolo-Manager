export function VarD() {
  const arabescoBilateral = (
    <svg width="22" height="100%" viewBox="0 0 22 280" preserveAspectRatio="xMidYMid meet" style={{height:'100%'}}>
      {[0,40,80,120,160,200,240].map(y => (
        <g key={y}>
          <path d={`M11,${y+5} Q16,${y+12} 11,${y+20} Q6,${y+12} 11,${y+5}Z`} fill="none" stroke="#6B2737" strokeWidth="0.7"/>
          <path d={`M11,${y+20} Q18,${y+28} 11,${y+35} Q4,${y+28} 11,${y+20}Z`} fill="none" stroke="#9B3A4B" strokeWidth="0.5"/>
          <circle cx="11" cy={y+35} r="1.2" fill="none" stroke="#6B2737" strokeWidth="0.6"/>
        </g>
      ))}
      <line x1="11" y1="0" x2="11" y2="280" stroke="#6B2737" strokeWidth="0.4" strokeDasharray="2,3"/>
    </svg>
  );

  return (
    <div className="min-h-screen bg-neutral-100 flex items-start justify-center p-6">
      <div style={{
        width: 620, background: '#fdfcf8', fontFamily: 'Georgia, serif',
        fontSize: 9, color: '#1a0a12', position: 'relative',
        border: '2px solid #6B2737', padding: 0,
        boxShadow: '0 2px 20px rgba(107,39,55,0.22)'
      }}>
        {/* Linha de ouro no topo */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #6B2737, #C4956A, #6B2737)' }}/>

        {/* === CABEÇALHO === */}
        <div style={{ borderBottom: '1px solid #6B2737', padding: '10px 28px 8px' }}>
          {/* Ornamento central de cabeçalho premium */}
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <svg width="280" height="24" viewBox="0 0 280 24" style={{ display: 'inline-block' }}>
              <path d="M0,12 Q30,6 60,12 Q90,18 120,12" fill="none" stroke="#C4956A" strokeWidth="0.6"/>
              <path d="M160,12 Q190,6 220,12 Q250,18 280,12" fill="none" stroke="#C4956A" strokeWidth="0.6"/>
              <path d="M130,4 L135,10 L140,4 L145,10 L150,4" fill="none" stroke="#6B2737" strokeWidth="0.8"/>
              <path d="M125,12 Q132,8 140,12 Q148,16 155,12" fill="none" stroke="#C4956A" strokeWidth="0.7"/>
              {[30,60,90,190,220,250].map(x => (
                <circle key={x} cx={x} cy={12} r="1.5" fill="none" stroke="#C4956A" strokeWidth="0.5"/>
              ))}
            </svg>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: '#3D0F1A', textTransform: 'uppercase' }}>INSTITUTO PÁDUA</div>
              <div style={{ fontSize: 7, letterSpacing: 2.5, color: '#C4956A', marginTop: 1 }}>MEDICINA INTEGRATIVA E LONGEVIDADE</div>
              <div style={{ fontSize: 6.5, color: '#aaa', marginTop: 2 }}>Dr. Caio Henrique Fernandes Pádua — CRM SP 125475</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 7 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#6B2737', letterSpacing: 0.5 }}>RCE-2026-0458</div>
              <div style={{ marginTop: 3, display: 'flex', gap: 6 }}>
                <span style={{ background: '#6B2737', color: '#fdf6ee', padding: '1px 5px', fontSize: 6.5 }}>1ª via Farmácia</span>
                <span style={{ border: '0.5px solid #6B2737', color: '#6B2737', padding: '1px 5px', fontSize: 6.5 }}>2ª via Paciente</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 8, paddingTop: 6, borderTop: '0.5px solid #C4956A' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 3, color: '#3D0F1A', textTransform: 'uppercase' }}>RECEITUÁRIO DE CONTROLE ESPECIAL</div>
            <div style={{ fontSize: 6.5, color: '#C4956A', letterSpacing: 1, marginTop: 2 }}>PORTARIA SVS/MS 344/1998 · LISTA C1 · VALIDADE 30 DIAS</div>
          </div>
        </div>

        {/* === IDENTIFICAÇÕES com colunas de arabesco lateral === */}
        <div style={{ display: 'flex', borderBottom: '0.5px solid #6B2737' }}>
          {/* Coluna arabesco ESQUERDA */}
          <div style={{ width: 22, background: '#fdf6ee', borderRight: '0.3px solid #C4956A', overflow: 'hidden', display: 'flex' }}>
            {arabescoBilateral}
          </div>

          <div style={{ display: 'flex', flex: 1 }}>
            <div style={{ flex: 1, padding: '8px 10px', borderRight: '0.5px solid #C4956A' }}>
              <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, color: '#C4956A', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Emitente</div>
              <div style={{ fontSize: 7.5, fontWeight: 700, marginBottom: 2, color: '#3D0F1A' }}>PROFISSIONAL PRESCRITOR</div>
              <div style={{ fontSize: 8.5 }}>Dr. Caio Henrique Fernandes Pádua</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, marginTop: 4, fontSize: 7 }}>
                <div><span style={{color:'#C4956A'}}>CRM SP </span>123456</div>
                <div><span style={{color:'#C4956A'}}>RQE </span>00000</div>
                <div><span style={{color:'#C4956A'}}>Tel </span>(11) 3000-0000</div>
              </div>
              <div style={{ fontSize: 7, marginTop: 3 }}>Rua [preencher], 000 · São Paulo · SP</div>
            </div>
            <div style={{ flex: 1, padding: '8px 10px' }}>
              <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, color: '#C4956A', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Paciente</div>
              <div style={{ fontSize: 7.5, fontWeight: 700, marginBottom: 2, color: '#3D0F1A' }}>NOME COMPLETO</div>
              <div style={{ fontSize: 8.5 }}>Marina Oliveira Silva</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, marginTop: 4, fontSize: 7 }}>
                <div><span style={{color:'#C4956A'}}>CPF </span>000.000.000-00</div>
                <div><span style={{color:'#C4956A'}}>Nasc. </span>00/00/0000</div>
                <div><span style={{color:'#C4956A'}}>Tel </span>(11) 90000-0000</div>
              </div>
              <div style={{ fontSize: 7, marginTop: 3 }}>Rua [preencher], 000 · São Paulo · SP</div>
            </div>
          </div>

          {/* Coluna arabesco DIREITA */}
          <div style={{ width: 22, background: '#fdf6ee', borderLeft: '0.3px solid #C4956A', overflow: 'hidden', display: 'flex', transform: 'scaleX(-1)' }}>
            {arabescoBilateral}
          </div>
        </div>

        {/* === CORPO com bordas bilaterais === */}
        <div style={{ display: 'flex' }}>
          <div style={{ width: 22, background: '#fdf6ee', borderRight: '0.3px solid #C4956A', overflow: 'hidden', display: 'flex' }}>
            {arabescoBilateral}
          </div>
          <div style={{ flex: 1, padding: '10px 14px', minHeight: 190 }}>
            <div style={{ fontStyle: 'italic', fontSize: 9, marginBottom: 8, color: '#6B2737' }}>Prescrevo</div>
            <div style={{ fontSize: 7, color: '#bbb', marginBottom: 6, textAlign: 'right' }}>DOIS ITENS</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#3D0F1A' }}>01&nbsp;&nbsp;Cloridrato de bupropiona 150 mg — comprimido de liberação prolongada</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, fontSize: 7, margin: '4px 0', borderTop: '0.3px solid #e8d5c4', paddingTop: 3 }}>
                <div><div style={{fontSize:6,color:'#C4956A'}}>FORMA</div>Comprimido</div>
                <div><div style={{fontSize:6,color:'#C4956A'}}>CONC.</div>150 mg</div>
                <div><div style={{fontSize:6,color:'#C4956A'}}>QTDE.</div>60 (sessenta)</div>
                <div><div style={{fontSize:6,color:'#C4956A'}}>LISTA</div>C1</div>
              </div>
              <div style={{ fontSize: 7.5, background: '#fdf0e8', padding: '4px 6px', borderLeft: '2px solid #6B2737' }}>
                <strong>Posologia.</strong> Tomar um comprimido pela manhã, por trinta dias.
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#3D0F1A' }}>02&nbsp;&nbsp;Cloridrato de naltrexona 50 mg — comprimido revestido</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, fontSize: 7, margin: '4px 0', borderTop: '0.3px solid #e8d5c4', paddingTop: 3 }}>
                <div><div style={{fontSize:6,color:'#C4956A'}}>FORMA</div>Comprimido</div>
                <div><div style={{fontSize:6,color:'#C4956A'}}>CONC.</div>50 mg</div>
                <div><div style={{fontSize:6,color:'#C4956A'}}>QTDE.</div>30 (trinta)</div>
                <div><div style={{fontSize:6,color:'#C4956A'}}>LISTA</div>C1</div>
              </div>
              <div style={{ fontSize: 7.5, background: '#fdf0e8', padding: '4px 6px', borderLeft: '2px solid #6B2737' }}>
                <strong>Posologia.</strong> Tomar meio comprimido à noite por 7 dias; após, 1 comprimido à noite.
              </div>
            </div>
          </div>
          <div style={{ width: 22, background: '#fdf6ee', borderLeft: '0.3px solid #C4956A', overflow: 'hidden', display: 'flex', transform: 'scaleX(-1)' }}>
            {arabescoBilateral}
          </div>
        </div>

        {/* Assinatura */}
        <div style={{ padding: '6px 28px 10px', borderTop: '0.5px solid #C4956A', display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: '"Dancing Script", cursive, Georgia', fontSize: 22, color: '#3D0F1A', marginBottom: 2 }}>Caio Pádua</div>
            <div style={{ borderTop: '0.5px solid #6B2737', paddingTop: 3, fontSize: 7 }}>Dr. Caio Henrique Fernandes Pádua</div>
            <div style={{ fontSize: 6.5, color: '#C4956A' }}>CRM SP 123456 · RQE 00000</div>
            <div style={{ fontSize: 6, color: '#bbb', marginTop: 1 }}>São Paulo, {new Date().toLocaleDateString('pt-BR')}</div>
          </div>
          <div style={{ width: 180, border: '0.5px solid #C4956A', padding: '5px 6px', fontSize: 6, background: '#fdf6ee' }}>
            <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 1, marginBottom: 3, color: '#6B2737' }}>DOCUMENTO ASSINADO ELETRONICAMENTE</div>
            <div><strong>Assinante:</strong> CAIO H. F. PÁDUA</div>
            <div>CPF: 293.274.948-06 · ICP-Brasil A3</div>
            <div><strong>Assinado em:</strong> {new Date().toLocaleDateString('pt-BR')}</div>
            <div style={{ marginTop: 3 }}><strong>Confira em:</strong> parxis.app/v/rce-2026-0458</div>
          </div>
        </div>

        {/* === PAINEL INFERIOR BILATERAL === */}
        <div style={{ borderTop: '2px solid #6B2737', position: 'relative' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #6B2737, #C4956A, #6B2737)' }}/>

          <div style={{ position: 'relative' }}>
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.06, zIndex:0 }} preserveAspectRatio="xMidYMid slice">
              <defs>
                <pattern id="arabD" x="0" y="0" width="44" height="44" patternUnits="userSpaceOnUse">
                  <path d="M22,4 Q28,12 22,20 Q16,12 22,4Z" fill="none" stroke="#6B2737" strokeWidth="1"/>
                  <path d="M22,24 Q28,32 22,40 Q16,32 22,24Z" fill="none" stroke="#6B2737" strokeWidth="1"/>
                  <path d="M4,22 Q12,28 20,22 Q12,16 4,22Z" fill="none" stroke="#6B2737" strokeWidth="1"/>
                  <path d="M24,22 Q32,28 40,22 Q32,16 24,22Z" fill="none" stroke="#6B2737" strokeWidth="1"/>
                  <circle cx="22" cy="22" r="2" fill="none" stroke="#C4956A" strokeWidth="0.8"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#arabD)"/>
            </svg>
            <div style={{ display: 'flex', gap: 10, padding: '10px 28px', position:'relative', zIndex:2 }}>
              <div style={{ flex: 1, background: '#fff', border: '0.5px solid #6B2737', padding: '6px 8px' }}>
                <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, color: '#6B2737', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Comprador</div>
                {['Nome:', 'Endereço:', 'Cidade:', 'Ident.:', 'Telefone:'].map(label => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, fontSize: 7 }}>
                    <span style={{ width: 45, color: '#C4956A', flexShrink: 0 }}>{label}</span>
                    <span style={{ flex: 1, borderBottom: '0.4px solid #C4956A' }}></span>
                  </div>
                ))}
                <div style={{ marginTop: 4, fontSize: 7, color: '#6B2737' }}>Data: <span style={{ borderBottom: '0.4px solid #6B2737', paddingRight: 20 }}>____/____/________</span></div>
              </div>
              <div style={{ flex: 1, background: '#fff', border: '0.5px solid #6B2737', padding: '6px 8px' }}>
                <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, color: '#6B2737', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Fornecedor</div>
                <div style={{ height: 46 }}></div>
                <div style={{ marginTop: 4, borderTop: '0.4px solid #C4956A', paddingTop: 3, fontSize: 7, color: '#C4956A' }}>Assinatura do Farmacêutico</div>
                <div style={{ marginTop: 10, borderTop: '0.4px solid #C4956A', paddingTop: 3, fontSize: 7 }}>Data: ____/____/________</div>
              </div>
            </div>
          </div>

          {/* Rodapé bordô */}
          <div style={{ background: '#6B2737', padding: '5px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 6, color: '#c9a0a8' }}>
              <div>INSTITUTO PÁDUA · Rua [preencher], 000 · São Paulo, SP · (11) 3000-0000</div>
              <div>CONFERÊNCIA DO DOCUMENTO EM PARXIS.APP/V/[CÓDIGO]</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: '#fdf6ee', fontFamily: 'Georgia, serif' }}>PARXIS</div>
              <div style={{ fontSize: 5.5, letterSpacing: 1.5, color: '#C4956A', marginTop: 1 }}>CLINICAL INTELLIGENCE SYSTEM</div>
            </div>
          </div>

          {/* Linha de ouro no rodapé */}
          <div style={{ height: 3, background: 'linear-gradient(90deg, #6B2737, #C4956A, #6B2737)' }}/>
        </div>
      </div>
    </div>
  );
}
