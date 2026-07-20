export function VarA() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center p-6">
      <div style={{
        width: 620, background: '#fff', fontFamily: 'Georgia, serif',
        fontSize: 9, color: '#111', position: 'relative',
        border: '1.5px solid #333', padding: 0, boxShadow: '0 2px 16px rgba(0,0,0,0.18)'
      }}>
        {/* Borda dupla interna */}
        <div style={{ position: 'absolute', inset: 5, border: '0.5px solid #555', pointerEvents: 'none', zIndex: 0 }} />

        {/* Ornamentos de canto — arabescos clássicos */}
        {[{t:3,l:3},{t:3,r:3},{b:3,l:3},{b:3,r:3}].map((pos, i) => (
          <svg key={i} width={36} height={36} style={{ position:'absolute', ...pos, zIndex:1 }} viewBox="0 0 36 36">
            <path d="M2,18 Q2,2 18,2" fill="none" stroke="#555" strokeWidth="0.8"/>
            <path d="M2,18 Q2,2 18,2" fill="none" stroke="#555" strokeWidth="0.8" transform="scale(-1,1) translate(-36,0)" style={{display: pos.r !== undefined ? 'block':'none'}}/>
            <path d="M2,18 Q2,2 18,2" fill="none" stroke="#555" strokeWidth="0.8" transform="scale(1,-1) translate(0,-36)" style={{display: pos.b !== undefined ? 'block':'none'}}/>
            <circle cx="18" cy="18" r="1.5" fill="#555"/>
            <circle cx="2" cy="2" r="1" fill="#888"/>
            <circle cx="34" cy="2" r="1" fill="#888"/>
          </svg>
        ))}

        {/* === CABEÇALHO === */}
        <div style={{ padding: '14px 18px 8px', borderBottom: '1px solid #bbb', position:'relative', zIndex:2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {/* Nome da clínica - canto superior esquerdo */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#111' }}>INSTITUTO PÁDUA</div>
              <div style={{ fontSize: 7.5, letterSpacing: 2, color: '#555', marginTop: 1 }}>MEDICINA INTEGRATIVA E LONGEVIDADE</div>
              <div style={{ fontSize: 7, color: '#777', marginTop: 2 }}>Dr. Caio Henrique Fernandes Pádua — CRM SP 125475</div>
            </div>
            {/* RCE + vias */}
            <div style={{ textAlign: 'right', fontSize: 7 }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>RCE-2026-0458</div>
              <div style={{ marginTop: 3, display: 'flex', gap: 8 }}>
                <span style={{ border: '0.5px solid #333', padding: '1px 4px' }}>1ª via Farmácia</span>
                <span style={{ border: '0.5px solid #333', padding: '1px 4px' }}>2ª via Paciente</span>
              </div>
            </div>
          </div>
          {/* Título central */}
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>RECEITUÁRIO DE CONTROLE ESPECIAL</div>
            <div style={{ fontSize: 6.5, color: '#666', letterSpacing: 1, marginTop: 2 }}>PORTARIA SVS/MS 344/1998 · LISTA C1 · VALIDADE 30 DIAS</div>
          </div>
        </div>

        {/* === CAIXAS DE IDENTIFICAÇÃO (2 colunas) === */}
        <div style={{ display: 'flex', borderBottom: '1px solid #bbb', position:'relative', zIndex:2 }}>
          {/* Emitente */}
          <div style={{ flex: 1, padding: '8px 10px', borderRight: '0.5px solid #bbb' }}>
            <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#444', marginBottom: 5, borderBottom: '0.5px solid #ccc', paddingBottom: 2 }}>Identificação do Emitente</div>
            <div style={{ fontSize: 7.5, fontWeight: 700, marginBottom: 2 }}>PROFISSIONAL PRESCRITOR</div>
            <div style={{ fontSize: 8.5 }}>Dr. Caio Henrique Fernandes Pádua</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, marginTop: 4, fontSize: 7 }}>
              <div><span style={{color:'#666'}}>CRM SP </span>123456</div>
              <div><span style={{color:'#666'}}>RQE </span>00000</div>
              <div><span style={{color:'#666'}}>Tel </span>(11) 3000-0000</div>
            </div>
            <div style={{ fontSize: 7, marginTop: 3, color: '#333' }}>Rua [preencher], 000 · São Paulo · SP · CEP 00000-000</div>
          </div>
          {/* Paciente */}
          <div style={{ flex: 1, padding: '8px 10px' }}>
            <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#444', marginBottom: 5, borderBottom: '0.5px solid #ccc', paddingBottom: 2 }}>Identificação do Paciente</div>
            <div style={{ fontSize: 7.5, fontWeight: 700, marginBottom: 2 }}>NOME COMPLETO</div>
            <div style={{ fontSize: 8.5 }}>Marina Oliveira Silva</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, marginTop: 4, fontSize: 7 }}>
              <div><span style={{color:'#666'}}>CPF </span>000.000.000-00</div>
              <div><span style={{color:'#666'}}>Nasc. </span>00/00/0000</div>
              <div><span style={{color:'#666'}}>Tel </span>(11) 90000-0000</div>
            </div>
            <div style={{ fontSize: 7, marginTop: 3, color: '#333' }}>Rua [preencher], 000 · São Paulo · SP · CEP 00000-000</div>
          </div>
        </div>

        {/* === CORPO DA PRESCRIÇÃO === */}
        <div style={{ padding: '10px 18px', minHeight: 200, position:'relative', zIndex:2 }}>
          <div style={{ fontStyle: 'italic', fontSize: 9, marginBottom: 8, color: '#444' }}>Prescrevo</div>
          <div style={{ fontSize: 7, color: '#888', marginBottom: 6, textAlign: 'right' }}>DOIS ITENS</div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>01&nbsp;&nbsp;Cloridrato de bupropiona 150 mg — comprimido de liberação prolongada</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, fontSize: 7, color: '#555', margin: '4px 0', borderTop: '0.3px solid #ddd', paddingTop: 3 }}>
              <div><div style={{fontSize:6,color:'#888'}}>FORMA</div>Comprimido</div>
              <div><div style={{fontSize:6,color:'#888'}}>CONCENTRAÇÃO</div>150 mg</div>
              <div><div style={{fontSize:6,color:'#888'}}>QUANTIDADE</div>60 (sessenta)</div>
              <div><div style={{fontSize:6,color:'#888'}}>LISTA</div>C1</div>
            </div>
            <div style={{ fontSize: 7.5, background: '#f7f7f7', padding: '4px 6px', borderLeft: '2px solid #bbb' }}>
              <strong>Posologia.</strong> Tomar um comprimido pela manhã, por trinta dias. Não partir nem triturar.
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>02&nbsp;&nbsp;Cloridrato de naltrexona 50 mg — comprimido revestido</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, fontSize: 7, color: '#555', margin: '4px 0', borderTop: '0.3px solid #ddd', paddingTop: 3 }}>
              <div><div style={{fontSize:6,color:'#888'}}>FORMA</div>Comprimido</div>
              <div><div style={{fontSize:6,color:'#888'}}>CONCENTRAÇÃO</div>50 mg</div>
              <div><div style={{fontSize:6,color:'#888'}}>QUANTIDADE</div>30 (trinta)</div>
              <div><div style={{fontSize:6,color:'#888'}}>LISTA</div>C1</div>
            </div>
            <div style={{ fontSize: 7.5, background: '#f7f7f7', padding: '4px 6px', borderLeft: '2px solid #bbb' }}>
              <strong>Posologia.</strong> Tomar meio comprimido à noite por sete dias e, a partir do oitavo, um comprimido à noite.
            </div>
          </div>
        </div>

        {/* === ASSINATURA + CERTIFICADO DIGITAL === */}
        <div style={{ padding: '6px 18px 10px', borderTop: '0.5px solid #ccc', display: 'flex', gap: 12, alignItems: 'flex-start', position:'relative', zIndex:2 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: '"Dancing Script", cursive, Georgia', fontSize: 22, color: '#222', marginBottom: 2, lineHeight: 1 }}>Caio Pádua</div>
            <div style={{ borderTop: '0.5px solid #555', paddingTop: 3, fontSize: 7 }}>Dr. Caio Henrique Fernandes Pádua</div>
            <div style={{ fontSize: 6.5, color: '#666' }}>CRM SP 123456 · RQE 00000</div>
            <div style={{ fontSize: 6, color: '#888', marginTop: 1 }}>São Paulo, {new Date().toLocaleDateString('pt-BR')}</div>
          </div>
          <div style={{ width: 180, border: '0.5px solid #bbb', padding: '5px 6px', fontSize: 6, background: '#fafafa' }}>
            <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 1, marginBottom: 3, color: '#555' }}>DOCUMENTO ASSINADO ELETRONICAMENTE</div>
            <div><strong>Assinante:</strong> CAIO HENRIQUE FERNANDES PÁDUA</div>
            <div>CPF: 293.274.948-06</div>
            <div><strong>Certificado:</strong> ICP-Brasil A3 SymplusID Múltipla</div>
            <div><strong>Assinado em:</strong> {new Date().toLocaleDateString('pt-BR')}</div>
            <div style={{ marginTop: 3 }}><strong>Confira em:</strong> parxis.app/v/rce-2026-0458</div>
          </div>
        </div>

        {/* === PAINEL INFERIOR COM ARABESCO === */}
        <div style={{ position: 'relative', borderTop: '1px solid #aaa' }}>
          {/* Fundo arabesco clássico */}
          <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.07, zIndex:0 }} preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="arabA" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M30,5 Q40,15 30,25 Q20,15 30,5Z" fill="none" stroke="#000" strokeWidth="0.8"/>
                <path d="M30,35 Q40,45 30,55 Q20,45 30,35Z" fill="none" stroke="#000" strokeWidth="0.8"/>
                <path d="M5,30 Q15,40 25,30 Q15,20 5,30Z" fill="none" stroke="#000" strokeWidth="0.8"/>
                <path d="M35,30 Q45,40 55,30 Q45,20 35,30Z" fill="none" stroke="#000" strokeWidth="0.8"/>
                <circle cx="30" cy="30" r="2" fill="none" stroke="#000" strokeWidth="0.6"/>
                <path d="M10,10 Q20,20 10,30" fill="none" stroke="#000" strokeWidth="0.5"/>
                <path d="M50,10 Q40,20 50,30" fill="none" stroke="#000" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#arabA)"/>
          </svg>

          {/* 2 caixas brancas sobre o arabesco */}
          <div style={{ display: 'flex', gap: 10, padding: '10px 12px', position:'relative', zIndex:2 }}>
            <div style={{ flex: 1, background: '#fff', border: '0.5px solid #888', padding: '6px 8px' }}>
              <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#333', marginBottom: 5, borderBottom: '0.3px solid #ccc', paddingBottom: 2 }}>Identificação do Comprador</div>
              {['Nome:', 'Endereço:', 'Cidade:', 'Ident.:', 'Telefone:'].map(label => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, fontSize: 7 }}>
                  <span style={{ width: 45, color: '#555', flexShrink: 0 }}>{label}</span>
                  <span style={{ flex: 1, borderBottom: '0.4px solid #aaa' }}></span>
                  {label === 'Cidade:' && <><span style={{margin:'0 4px', color:'#555', fontSize:7}}>UF:</span><span style={{width:20, borderBottom:'0.4px solid #aaa'}}></span></>}
                  {label === 'Ident.:' && <><span style={{margin:'0 4px', color:'#555', fontSize:7}}>Org. Emissor:</span><span style={{width:30, borderBottom:'0.4px solid #aaa'}}></span></>}
                </div>
              ))}
              <div style={{ marginTop: 5, fontSize: 7 }}>Data: <span style={{ borderBottom: '0.4px solid #aaa', paddingRight: 20 }}>____/____/________</span></div>
            </div>
            <div style={{ flex: 1, background: '#fff', border: '0.5px solid #888', padding: '6px 8px' }}>
              <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#333', marginBottom: 5, borderBottom: '0.3px solid #ccc', paddingBottom: 2 }}>Identificação do Fornecedor</div>
              <div style={{ height: 40 }}></div>
              <div style={{ marginTop: 6, borderTop: '0.4px solid #aaa', paddingTop: 4, fontSize: 7, color: '#555' }}>Assinatura do Farmacêutico</div>
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 7, borderTop: '0.4px solid #aaa', paddingTop: 3 }}>
                <span>Data: ____/____/________</span>
              </div>
            </div>
          </div>

          {/* Rodapé: endereço + PARXIS logo */}
          <div style={{ padding: '4px 12px 8px', borderTop: '0.3px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position:'relative', zIndex:2 }}>
            <div style={{ fontSize: 6, color: '#666' }}>
              <div>INSTITUTO PÁDUA · Rua [preencher], 000 — Conj. 00 · São Paulo, SP · CEP 00000-000</div>
              <div>TELEFONE (11) 3000-0000 · CONFERÊNCIA DO DOCUMENTO EM PARXIS.APP/V/[CÓDIGO]</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: '#1a1a1a', fontFamily: 'Georgia, serif' }}>PARXIS</div>
              <div style={{ fontSize: 5.5, letterSpacing: 1.5, color: '#666', marginTop: 1 }}>CLINICAL INTELLIGENCE SYSTEM</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
