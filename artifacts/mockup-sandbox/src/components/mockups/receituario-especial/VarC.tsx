export function VarC() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-6">
      <div style={{
        width: 620, background: '#fff', fontFamily: '"Arial", sans-serif',
        fontSize: 9, color: '#0f1f2e', position: 'relative',
        border: '2px solid #1B3A4B', padding: 0,
        boxShadow: '0 2px 20px rgba(0,0,0,0.20)'
      }}>
        {/* Barra de cor no topo — Art Déco */}
        <div style={{ height: 6, background: 'linear-gradient(90deg, #1B3A4B 60%, #2E9B8F 100%)' }}/>

        {/* === CABEÇALHO ART DÉCO === */}
        <div style={{ padding: '10px 18px 8px', borderBottom: '0.5px solid #1B3A4B', background: '#fff' }}>
          {/* Ornamento geométrico déco */}
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <svg width="320" height="18" viewBox="0 0 320 18" style={{ display: 'inline-block' }}>
              <line x1="0" y1="9" x2="130" y2="9" stroke="#2E9B8F" strokeWidth="0.6"/>
              <polygon points="130,9 136,5 140,9 136,13" fill="none" stroke="#1B3A4B" strokeWidth="0.8"/>
              <polygon points="148,9 152,5 158,9 152,13" fill="none" stroke="#2E9B8F" strokeWidth="0.6"/>
              <polygon points="160,9 164,4 168,9 164,14" fill="#2E9B8F" opacity="0.3"/>
              <text x="160" y="12.5" textAnchor="middle" style={{fontSize:8, fontFamily:'Arial', fontWeight:700, letterSpacing:2, fill:'#1B3A4B'}}>✦</text>
              <polygon points="162,9 168,5 172,9 168,13" fill="none" stroke="#2E9B8F" strokeWidth="0.6"/>
              <polygon points="180,9 184,5 190,9 184,13" fill="none" stroke="#1B3A4B" strokeWidth="0.8"/>
              <line x1="190" y1="9" x2="320" y2="9" stroke="#2E9B8F" strokeWidth="0.6"/>
            </svg>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 2, color: '#1B3A4B', textTransform: 'uppercase', fontFamily: 'Arial' }}>INSTITUTO PÁDUA</div>
              <div style={{ fontSize: 7, letterSpacing: 3, color: '#2E9B8F', marginTop: 2, textTransform: 'uppercase' }}>Medicina Integrativa e Longevidade</div>
              <div style={{ fontSize: 6.5, color: '#888', marginTop: 2 }}>Dr. Caio Henrique Fernandes Pádua — CRM SP 125475</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 7 }}>
              <div style={{ fontSize: 8, fontWeight: 800, color: '#1B3A4B', letterSpacing: 1 }}>RCE-2026-0458</div>
              <div style={{ marginTop: 3, display: 'flex', gap: 6 }}>
                <span style={{ background: '#1B3A4B', color: '#fff', padding: '1px 5px', fontSize: 6.5 }}>1ª via Farmácia</span>
                <span style={{ border: '0.5px solid #1B3A4B', padding: '1px 5px', color: '#1B3A4B', fontSize: 6.5 }}>2ª via Paciente</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 8, paddingTop: 6, borderTop: '0.5px solid #2E9B8F' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 4, color: '#1B3A4B', textTransform: 'uppercase' }}>RECEITUÁRIO DE CONTROLE ESPECIAL</div>
            <div style={{ fontSize: 6.5, color: '#2E9B8F', letterSpacing: 1, marginTop: 2 }}>PORTARIA SVS/MS 344/1998 · LISTA C1 · VALIDADE 30 DIAS</div>
          </div>

          {/* Ornamento geométrico inferior déco */}
          <div style={{ textAlign: 'center', marginTop: 6 }}>
            <svg width="300" height="14" viewBox="0 0 300 14" style={{ display: 'inline-block' }}>
              <line x1="0" y1="7" x2="120" y2="7" stroke="#2E9B8F" strokeWidth="0.4"/>
              <rect x="122" y="4" width="6" height="6" fill="none" stroke="#1B3A4B" strokeWidth="0.7" transform="rotate(45 125 7)"/>
              <rect x="131" y="4" width="6" height="6" fill="#2E9B8F" opacity="0.4" transform="rotate(45 134 7)"/>
              <rect x="140" y="3" width="8" height="8" fill="none" stroke="#1B3A4B" strokeWidth="0.9" transform="rotate(45 144 7)"/>
              <rect x="149" y="4" width="6" height="6" fill="#2E9B8F" opacity="0.4" transform="rotate(45 152 7)"/>
              <rect x="158" y="4" width="6" height="6" fill="none" stroke="#1B3A4B" strokeWidth="0.7" transform="rotate(45 161 7)"/>
              <line x1="168" y1="7" x2="300" y2="7" stroke="#2E9B8F" strokeWidth="0.4"/>
            </svg>
          </div>
        </div>

        {/* === IDENTIFICAÇÕES === */}
        <div style={{ display: 'flex', borderBottom: '0.5px solid #1B3A4B' }}>
          <div style={{ flex: 1, padding: '8px 10px', borderRight: '0.5px solid #2E9B8F' }}>
            <div style={{ fontSize: 6, fontWeight: 800, letterSpacing: 3, color: '#2E9B8F', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Emitente</div>
            <div style={{ fontSize: 7.5, fontWeight: 700, marginBottom: 2, color: '#1B3A4B' }}>PROFISSIONAL PRESCRITOR</div>
            <div style={{ fontSize: 8.5 }}>Dr. Caio Henrique Fernandes Pádua</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, marginTop: 4, fontSize: 7 }}>
              <div><span style={{color:'#2E9B8F'}}>CRM SP </span>123456</div>
              <div><span style={{color:'#2E9B8F'}}>RQE </span>00000</div>
              <div><span style={{color:'#2E9B8F'}}>Tel </span>(11) 3000-0000</div>
            </div>
            <div style={{ fontSize: 7, marginTop: 3 }}>Rua [preencher], 000 · São Paulo · SP</div>
          </div>
          <div style={{ flex: 1, padding: '8px 10px' }}>
            <div style={{ fontSize: 6, fontWeight: 800, letterSpacing: 3, color: '#2E9B8F', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Paciente</div>
            <div style={{ fontSize: 7.5, fontWeight: 700, marginBottom: 2, color: '#1B3A4B' }}>NOME COMPLETO</div>
            <div style={{ fontSize: 8.5 }}>Marina Oliveira Silva</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, marginTop: 4, fontSize: 7 }}>
              <div><span style={{color:'#2E9B8F'}}>CPF </span>000.000.000-00</div>
              <div><span style={{color:'#2E9B8F'}}>Nasc. </span>00/00/0000</div>
              <div><span style={{color:'#2E9B8F'}}>Tel </span>(11) 90000-0000</div>
            </div>
            <div style={{ fontSize: 7, marginTop: 3 }}>Rua [preencher], 000 · São Paulo · SP</div>
          </div>
        </div>

        {/* === CORPO === */}
        <div style={{ padding: '10px 18px', minHeight: 190 }}>
          <div style={{ fontStyle: 'italic', fontSize: 9, marginBottom: 8, color: '#1B3A4B' }}>Prescrevo</div>
          <div style={{ fontSize: 7, color: '#999', marginBottom: 6, textAlign: 'right' }}>DOIS ITENS</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#1B3A4B' }}>01&nbsp;&nbsp;Cloridrato de bupropiona 150 mg — comprimido de liberação prolongada</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, fontSize: 7, margin: '4px 0', borderTop: '0.3px solid #e0e8ec', paddingTop: 3 }}>
              <div><div style={{fontSize:6,color:'#2E9B8F'}}>FORMA</div>Comprimido</div>
              <div><div style={{fontSize:6,color:'#2E9B8F'}}>CONC.</div>150 mg</div>
              <div><div style={{fontSize:6,color:'#2E9B8F'}}>QTDE.</div>60 (sessenta)</div>
              <div><div style={{fontSize:6,color:'#2E9B8F'}}>LISTA</div>C1</div>
            </div>
            <div style={{ fontSize: 7.5, background: '#f0f7f9', padding: '4px 6px', borderLeft: '2px solid #2E9B8F' }}>
              <strong>Posologia.</strong> Tomar um comprimido pela manhã, por trinta dias.
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#1B3A4B' }}>02&nbsp;&nbsp;Cloridrato de naltrexona 50 mg — comprimido revestido</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, fontSize: 7, margin: '4px 0', borderTop: '0.3px solid #e0e8ec', paddingTop: 3 }}>
              <div><div style={{fontSize:6,color:'#2E9B8F'}}>FORMA</div>Comprimido</div>
              <div><div style={{fontSize:6,color:'#2E9B8F'}}>CONC.</div>50 mg</div>
              <div><div style={{fontSize:6,color:'#2E9B8F'}}>QTDE.</div>30 (trinta)</div>
              <div><div style={{fontSize:6,color:'#2E9B8F'}}>LISTA</div>C1</div>
            </div>
            <div style={{ fontSize: 7.5, background: '#f0f7f9', padding: '4px 6px', borderLeft: '2px solid #2E9B8F' }}>
              <strong>Posologia.</strong> Tomar meio comprimido à noite por 7 dias; após, 1 comprimido à noite.
            </div>
          </div>
        </div>

        {/* Assinatura */}
        <div style={{ padding: '6px 18px 10px', borderTop: '0.5px solid #2E9B8F', display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: '"Dancing Script", cursive, Georgia', fontSize: 22, color: '#1B3A4B', marginBottom: 2 }}>Caio Pádua</div>
            <div style={{ borderTop: '0.5px solid #1B3A4B', paddingTop: 3, fontSize: 7 }}>Dr. Caio Henrique Fernandes Pádua</div>
            <div style={{ fontSize: 6.5, color: '#2E9B8F' }}>CRM SP 123456 · RQE 00000</div>
            <div style={{ fontSize: 6, color: '#aaa', marginTop: 1 }}>São Paulo, {new Date().toLocaleDateString('pt-BR')}</div>
          </div>
          <div style={{ width: 180, border: '0.5px solid #2E9B8F', padding: '5px 6px', fontSize: 6, background: '#f0f7f9' }}>
            <div style={{ fontSize: 6, fontWeight: 800, letterSpacing: 1, marginBottom: 3, color: '#1B3A4B' }}>DOCUMENTO ASSINADO ELETRONICAMENTE</div>
            <div><strong>Assinante:</strong> CAIO H. F. PÁDUA</div>
            <div>CPF: 293.274.948-06 · ICP-Brasil A3</div>
            <div><strong>Assinado em:</strong> {new Date().toLocaleDateString('pt-BR')}</div>
            <div style={{ marginTop: 3 }}><strong>Confira em:</strong> parxis.app/v/rce-2026-0458</div>
          </div>
        </div>

        {/* === PAINEL INFERIOR ART DÉCO === */}
        <div style={{ borderTop: '2px solid #1B3A4B', position: 'relative' }}>
          {/* Separador geométrico */}
          <div style={{ background: '#1B3A4B', height: 3 }} />
          <div style={{ background: '#2E9B8F', height: 1.5 }} />

          {/* Fundo padrão geométrico déco */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.05, zIndex:0 }} preserveAspectRatio="xMidYMid slice">
              <defs>
                <pattern id="arabC" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <rect x="15" y="15" width="10" height="10" fill="none" stroke="#1B3A4B" strokeWidth="1" transform="rotate(45 20 20)"/>
                  <line x1="0" y1="20" x2="15" y2="20" stroke="#2E9B8F" strokeWidth="0.6"/>
                  <line x1="25" y1="20" x2="40" y2="20" stroke="#2E9B8F" strokeWidth="0.6"/>
                  <line x1="20" y1="0" x2="20" y2="15" stroke="#2E9B8F" strokeWidth="0.6"/>
                  <line x1="20" y1="25" x2="20" y2="40" stroke="#2E9B8F" strokeWidth="0.6"/>
                  <circle cx="20" cy="20" r="1.5" fill="#1B3A4B"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#arabC)"/>
            </svg>
            <div style={{ display: 'flex', gap: 10, padding: '10px 12px', position:'relative', zIndex:2 }}>
              <div style={{ flex: 1, background: '#fff', border: '0.5px solid #1B3A4B', padding: '6px 8px' }}>
                <div style={{ fontSize: 6, fontWeight: 800, letterSpacing: 2, color: '#1B3A4B', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Comprador</div>
                {['Nome:', 'Endereço:', 'Cidade:', 'Ident.:', 'Telefone:'].map(label => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, fontSize: 7 }}>
                    <span style={{ width: 45, color: '#2E9B8F', flexShrink: 0 }}>{label}</span>
                    <span style={{ flex: 1, borderBottom: '0.4px solid #2E9B8F' }}></span>
                  </div>
                ))}
                <div style={{ marginTop: 4, fontSize: 7, color: '#1B3A4B' }}>Data: <span style={{ borderBottom: '0.4px solid #1B3A4B', paddingRight: 20 }}>____/____/________</span></div>
              </div>
              <div style={{ flex: 1, background: '#fff', border: '0.5px solid #1B3A4B', padding: '6px 8px' }}>
                <div style={{ fontSize: 6, fontWeight: 800, letterSpacing: 2, color: '#1B3A4B', marginBottom: 4, textTransform: 'uppercase' }}>Identificação do Fornecedor</div>
                <div style={{ height: 46 }}></div>
                <div style={{ marginTop: 4, borderTop: '0.4px solid #2E9B8F', paddingTop: 3, fontSize: 7, color: '#2E9B8F' }}>Assinatura do Farmacêutico</div>
                <div style={{ marginTop: 10, borderTop: '0.4px solid #2E9B8F', paddingTop: 3, fontSize: 7 }}>Data: ____/____/________</div>
              </div>
            </div>
          </div>

          {/* Barra + rodapé */}
          <div style={{ background: '#1B3A4B', padding: '5px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 6, color: '#7a9faf' }}>
              <div>INSTITUTO PÁDUA · Rua [preencher], 000 · São Paulo, SP · (11) 3000-0000</div>
              <div>CONFERÊNCIA DO DOCUMENTO EM PARXIS.APP/V/[CÓDIGO]</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, color: '#fff', fontFamily: 'Arial' }}>PARXIS</div>
              <div style={{ fontSize: 5.5, letterSpacing: 1.5, color: '#2E9B8F', marginTop: 1 }}>CLINICAL INTELLIGENCE SYSTEM</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
