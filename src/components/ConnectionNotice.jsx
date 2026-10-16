import { useEffect, useRef } from 'react';
import { FONT } from '../constants.js';

export default function ConnectionNotice({ initial = false, saving = false, offline = false }) {
  const buttonRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    const keepFocus = event => {
      if (!dialogRef.current?.contains(event.target)) dialogRef.current?.focus();
    };
    document.addEventListener('focusin', keepFocus);
    return () => { document.removeEventListener('focusin', keepFocus); previous?.focus?.(); };
  }, []);
  return (
    <div style={{position: initial ? 'relative' : 'fixed', inset:0, zIndex:20000,
      minHeight:initial ? '100vh' : undefined, display:'flex',alignItems:'center',justifyContent:'center',
      padding:24,boxSizing:'border-box',background:initial ? '#f5f3ef' : 'rgba(30,40,30,.55)',fontFamily:FONT}}>
      <section ref={dialogRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="connection-title" aria-describedby="connection-description"
        onKeyDown={event=>{if(event.key==='Tab'){event.preventDefault(); (saving ? dialogRef : buttonRef).current?.focus();}}}
        style={{width:'100%',maxWidth:360,background:'#fff',borderRadius:18,padding:28,boxShadow:'0 8px 32px rgba(0,0,0,.12)',color:'#2e3a2e'}}>
        <h2 id="connection-title" style={{fontSize:20,margin:'0 0 14px'}}>{offline ? '인터넷 연결을 확인해 주세요' : '서버에 연결할 수 없습니다'}</h2>
        <p id="connection-description" style={{fontSize:15,lineHeight:1.7,margin:'0 0 20px'}}>
          {offline ? 'Wi-Fi 또는 모바일 데이터 연결을 확인한 뒤 다시 시도해 주세요.'
            : '현재 연결 문제로 예약 서비스를 이용하기 어렵습니다. 잠시 후 다시 연결해 주세요.'}
          {saving && <><br/>예약 저장 결과를 확인 중입니다. 잠시 기다려 주세요.</>}
        </p>
        <button ref={buttonRef} disabled={saving} onClick={()=>window.location.reload()}
          style={{width:'100%',padding:'13px 16px',border:0,borderRadius:10,background:saving?'#a8afa7':'#38513b',color:'#fff',fontSize:15,fontFamily:FONT,cursor:saving?'wait':'pointer'}}>
          {saving ? '저장 결과 확인 중…' : '다시 연결'}
        </button>
      </section>
    </div>
  );
}
