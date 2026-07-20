export function VarB() {
  return (
    <div className="min-h-screen bg-stone-100 flex items-start justify-center p-6">
      <div style={{
        width: 620, background: '#fffef8', fontFamily: 'Georgia, serif',
        fontSize: 9, color: '#1a1a1a', position: 'relative',
        border: '2px solid #8B7355', padding: 0,
        boxShadow: '0 2px 20px rgba(0,0,0,0.22)'
      }}>
        {/* Moldura interna dourada */}
        <div style={{ position: 'absolute', inset: 5, border: '0.5px solid #C9A84C', pointerEvents: 'none', zIndex: 0 }} />

        {/* === ARABESCOS HERÁLDICOS NO CABEÇALHO === */}
        <div style={{ borderBottom: '1.5px solid #8B7355', background: 'linear-gradient(to bottom, #fdf6e3, #fffef8)', position: 'relative', overflow: 'hidden' }}>
          {/* Arabesco central ornamental */}
          <svg width="100%" height="56" viewBox="0 0 620 56" style={{ display: 'block' }}>
            <path d="M310,6 C320,6 328,10 330,16 C332,22 326,26 318,24 C326,28 330,34 328,40 C326,46 318,48 310,48 C302,48 294,46 292,40 C290,34 294,28 302,24 C294,26 288,22 290,16 C292,10 300,6 310,6Z" fill="none" stroke="#C9A84C" strokeWidth="0.8"/>
            <path d="M310,8 L310,46" stroke="#C9A84C" strokeWidth="0.3" strokeDasharray="2,2"/>
            <circle cx="310" cy="27" r="3" fill="none" stroke="#C9A84C" strokeWidth="0.7"/>
            {/* Volutas esquerda */}
            <path d="M290,27 Q270,20 255,27 Q240,34 250,40 Q256,44 262,40" fill="none" stroke="#C9A84C" strokeWidth="0.7"/>
            <path d="M270,27 Q260,22 255,27" fill="none" stroke="#C9A84C" strokeWidth="0.5"/>
            <path d="M240,25 Q225,18 215,27 Q205,36 215,42" fill="none" stroke="#C9A84C" strokeWidth="0.7"/>
            <path d="M200,27 Q185,20 175,27" fill="none" stroke="#C9A84C" strokeWidth="0.6"/>
            <path d="M160,27 Q140,20 120,27" fill="none" stroke="#C9A84C" strokeWidth="0.5"/>
            <path d="M100,27 Q80,22 60,27 Q40,32 30,27" fill="none" stroke="#C9A84C" strokeWidth="0.5"/>
            {/* Volutas direita (espelho) */}
            <path d="M330,27 Q350,20 365,27 Q380,34 370,40 Q364,44 358,40" fill="none" stroke="#C9A84C" strokeWidth="0.7"/>
            <path d="M350,27 Q360,22 365,27" fill="none" stroke="#C9A84C" strokeWidth="0.5"/>
            <path d="M380,25 Q395,18 405,27 Q415,36 405,42" fill="none" stroke="#C9A84C" strokeWidth="0.7"/>
            <path d="M420,27 Q435,20 445,27" fill="none" stroke="#C9A84C" strokeWidth="0.6"/>
            <path d="M460,27 Q480,20 500,27" fill="none" stroke="#C9A84C" strokeWidth="0.5"/>
            <path d="M520,27 Q540,22 560,27 Q580,32 590,27" fill="none" stroke="#C9A84C" strokeWidth="0.5"/>
            {/* Pequenos losangos */}
            {[60,120,180,240,380,440,500,560].map(x => (
              <path key={x} d={`M${x},27 L${x+3},24 L${x+6},27 L${x+3},30Z`} fill="#C9A84C" opacity="0.5"/>
            ))}
          </svg>

          <div style={{ padding: '0 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: '#5C3A1E', textTransform: 'uppercase' }}>INSTITUTO PÁDUA</div>
              <div style={{ fontSize: 7, letterSpacing: 2.5, color: '#8B7355', marginTop: 1 }}>MEDICINA INTEGRATIVA E LONGEVIDADE</div>
              <div style={{ fontSize: 6.5, color: '#999', marginTop: 1 }}>Dr. Caio Henrique Fernandes Pádua — CRM SP 125475</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 7 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#8B7355', letterSpacing: 0.5 }}>RCE-2026-0458</div>
              <div style={{ marginTop: 3, display: 'flex', gap: 6 }}>
                <span style={{ border: '0.5px solid #C9A84C', padding: '1px 4px', color: '#5C3A1E' }}>1ª via Farmácia</span>
                <span style={{ border: '0.5px solid #C9A84C', padding: '1px 4px', color: '#5C3A1E' }}>2ª via Paciente</span>
              </div>
            </div>
          </div>

          {/* Título */}
          <div style={{ textAlign: 'center', padding: '4px 0 10px', borderTop: '0.5px solid #C9A84C' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 3, color: '#3D2B0A', textTransform: 'uppercase' }}>RECEITUÁRIO DE CONTROLE ESPECIAL</div>
            <div style={{ fontSize: 6.5, color: '#8B7355', letterSpacing: 1, marginTop: 2 }}>PORTARIA SVS/MS 344/1998 · LISTA C1 · VALIDADE 30 DIAS</div>
          </div>
        </div>

        {/* === IDENTIFICAÇÕES === */}
        <div style={{ display: 'flex', borderBottom: '0.5px solid #C9A84C' }}>
          <div style={{ flex: 1, padding: '8px 10px', borderRight: '0.5px solid #C9A84C' }}>
            <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, color: '#8B7355', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Emitente</div>
            <div style={{ fontSize: 7.5, fontWeight: 700, marginBottom: 2 }}>PROFISSIONAL PRESCRITOR</div>
            <div style={{ fontSize: 8.5 }}>Dr. Caio Henrique Fernandes Pádua</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, marginTop: 4, fontSize: 7 }}>
              <div><span style={{color:'#8B7355'}}>CRM SP </span>123456</div>
              <div><span style={{color:'#8B7355'}}>RQE </span>00000</div>
              <div><span style={{color:'#8B7355'}}>Tel </span>(11) 3000-0000</div>
            </div>
            <div style={{ fontSize: 7, marginTop: 3 }}>Rua [preencher], 000 · São Paulo · SP</div>
          </div>
          <div style={{ flex: 1, padding: '8px 10px' }}>
            <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, color: '#8B7355', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Paciente</div>
            <div style={{ fontSize: 7.5, fontWeight: 700, marginBottom: 2 }}>NOME COMPLETO</div>
            <div style={{ fontSize: 8.5 }}>Marina Oliveira Silva</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, marginTop: 4, fontSize: 7 }}>
              <div><span style={{color:'#8B7355'}}>CPF </span>000.000.000-00</div>
              <div><span style={{color:'#8B7355'}}>Nasc. </span>00/00/0000</div>
              <div><span style={{color:'#8B7355'}}>Tel </span>(11) 90000-0000</div>
            </div>
            <div style={{ fontSize: 7, marginTop: 3 }}>Rua [preencher], 000 · São Paulo · SP</div>
          </div>
        </div>

        {/* === CORPO === */}
        <div style={{ padding: '10px 18px', minHeight: 190 }}>
          <div style={{ fontStyle: 'italic', fontSize: 9, marginBottom: 8, color: '#5C3A1E' }}>Prescrevo</div>
          <div style={{ fontSize: 7, color: '#999', marginBottom: 6, textAlign: 'right' }}>DOIS ITENS</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#3D2B0A' }}>01&nbsp;&nbsp;Cloridrato de bupropiona 150 mg — comprimido de liberação prolongada</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, fontSize: 7, color: '#5C3A1E', margin: '4px 0', borderTop: '0.3px solid #e0d4b8', paddingTop: 3 }}>
              <div><div style={{fontSize:6,color:'#8B7355'}}>FORMA</div>Comprimido</div>
              <div><div style={{fontSize:6,color:'#8B7355'}}>CONC.</div>150 mg</div>
              <div><div style={{fontSize:6,color:'#8B7355'}}>QTDE.</div>60 (sessenta)</div>
              <div><div style={{fontSize:6,color:'#8B7355'}}>LISTA</div>C1</div>
            </div>
            <div style={{ fontSize: 7.5, background: '#fdf3d8', padding: '4px 6px', borderLeft: '2px solid #C9A84C' }}>
              <strong>Posologia.</strong> Tomar um comprimido pela manhã, por trinta dias.
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#3D2B0A' }}>02&nbsp;&nbsp;Cloridrato de naltrexona 50 mg — comprimido revestido</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, fontSize: 7, color: '#5C3A1E', margin: '4px 0', borderTop: '0.3px solid #e0d4b8', paddingTop: 3 }}>
              <div><div style={{fontSize:6,color:'#8B7355'}}>FORMA</div>Comprimido</div>
              <div><div style={{fontSize:6,color:'#8B7355'}}>CONC.</div>50 mg</div>
              <div><div style={{fontSize:6,color:'#8B7355'}}>QTDE.</div>30 (trinta)</div>
              <div><div style={{fontSize:6,color:'#8B7355'}}>LISTA</div>C1</div>
            </div>
            <div style={{ fontSize: 7.5, background: '#fdf3d8', padding: '4px 6px', borderLeft: '2px solid #C9A84C' }}>
              <strong>Posologia.</strong> Tomar meio comprimido à noite, por 7 dias; após, 1 comprimido à noite.
            </div>
          </div>
        </div>

        {/* Assinatura + certificado */}
        <div style={{ padding: '6px 18px 10px', borderTop: '0.5px solid #C9A84C', display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: '"Dancing Script", cursive, Georgia', fontSize: 22, color: '#3D2B0A', marginBottom: 2 }}>Caio Pádua</div>
            <div style={{ borderTop: '0.5px solid #8B7355', paddingTop: 3, fontSize: 7 }}>Dr. Caio Henrique Fernandes Pádua</div>
            <div style={{ fontSize: 6.5, color: '#8B7355' }}>CRM SP 123456 · RQE 00000</div>
            <div style={{ fontSize: 6, color: '#aaa', marginTop: 1 }}>São Paulo, {new Date().toLocaleDateString('pt-BR')}</div>
          </div>
          <div style={{ width: 180, border: '0.5px solid #C9A84C', padding: '5px 6px', fontSize: 6, background: '#fdf6e3' }}>
            <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 1, marginBottom: 3, color: '#8B7355' }}>DOCUMENTO ASSINADO ELETRONICAMENTE</div>
            <div><strong>Assinante:</strong> CAIO HENRIQUE FERNANDES PÁDUA</div>
            <div>CPF: 293.274.948-06 · ICP-Brasil A3</div>
            <div><strong>Assinado em:</strong> {new Date().toLocaleDateString('pt-BR')}</div>
            <div style={{ marginTop: 3 }}><strong>Confira em:</strong> parxis.app/v/rce-2026-0458</div>
          </div>
        </div>

        {/* === PAINEL INFERIOR HERÁLDICO === */}
        <div style={{ borderTop: '1.5px solid #8B7355', position: 'relative', background: '#fffef8' }}>
          {/* Arabesco separador heráldico */}
          <svg width="100%" height="32" viewBox="0 0 620 32" style={{ display: 'block' }}>
            <path d="M310,4 L306,10 L296,10 L304,16 L300,26 L310,20 L320,26 L316,16 L324,10 L314,10Z" fill="none" stroke="#C9A84C" strokeWidth="0.7"/>
            <path d="M0,16 Q60,8 130,16 Q180,22 240,16 Q270,12 290,16" stroke="#C9A84C" strokeWidth="0.5" fill="none"/>
            <path d="M620,16 Q560,8 490,16 Q440,22 380,16 Q350,12 330,16" stroke="#C9A84C" strokeWidth="0.5" fill="none"/>
            {[80,150,220,400,470,540].map(x => (
              <circle key={x} cx={x} cy={16} r="1.5" fill="none" stroke="#C9A84C" strokeWidth="0.5"/>
            ))}
          </svg>

          {/* Fundo arabesco para as caixas */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.06, zIndex:0 }} preserveAspectRatio="xMidYMid slice">
              <defs>
                <pattern id="arabB" x="0" y="0" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M25,5 Q35,15 25,25 Q15,15 25,5Z" fill="none" stroke="#8B7355" strokeWidth="1"/>
                  <path d="M25,25 Q35,35 25,45 Q15,35 25,25Z" fill="none" stroke="#8B7355" strokeWidth="1"/>
                  <path d="M5,25 Q15,35 25,25 Q15,15 5,25Z" fill="none" stroke="#8B7355" strokeWidth="1"/>
                  <path d="M25,25 Q35,35 45,25 Q35,15 25,25Z" fill="none" stroke="#8B7355" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#arabB)"/>
            </svg>
            <div style={{ display: 'flex', gap: 10, padding: '8px 12px', position:'relative', zIndex:2 }}>
              <div style={{ flex: 1, background: '#fff', border: '0.5px solid #C9A84C', padding: '6px 8px' }}>
                <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, color: '#8B7355', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Comprador</div>
                {['Nome:', 'Endereço:', 'Cidade:', 'Ident.:', 'Telefone:'].map(label => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, fontSize: 7 }}>
                    <span style={{ width: 45, color: '#8B7355', flexShrink: 0 }}>{label}</span>
                    <span style={{ flex: 1, borderBottom: '0.4px solid #C9A84C' }}></span>
                  </div>
                ))}
                <div style={{ marginTop: 4, fontSize: 7, color: '#8B7355' }}>Data: <span style={{ borderBottom: '0.4px solid #C9A84C', paddingRight: 20 }}>____/____/________</span></div>
              </div>
              <div style={{ flex: 1, background: '#fff', border: '0.5px solid #C9A84C', padding: '6px 8px' }}>
                <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, color: '#8B7355', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Fornecedor</div>
                <div style={{ height: 46 }}></div>
                <div style={{ marginTop: 4, borderTop: '0.4px solid #C9A84C', paddingTop: 3, fontSize: 7, color: '#8B7355' }}>Assinatura do Farmacêutico</div>
                <div style={{ marginTop: 10, borderTop: '0.4px solid #C9A84C', paddingTop: 3, fontSize: 7, color: '#8B7355' }}>Data: ____/____/________</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '4px 12px 8px', borderTop: '0.5px solid #e0d4b8', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 6, color: '#999' }}>
              <div>INSTITUTO PÁDUA · Rua [preencher], 000 · São Paulo, SP · CEP 00000-000</div>
              <div>TELEFONE (11) 3000-0000 · CONFERÊNCIA EM PARXIS.APP/V/[CÓDIGO]</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: '#8B7355', fontFamily: 'Georgia, serif' }}>PARXIS</div>
              <div style={{ fontSize: 5.5, letterSpacing: 1.5, color: '#aaa', marginTop: 1 }}>CLINICAL INTELLIGENCE SYSTEM</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
