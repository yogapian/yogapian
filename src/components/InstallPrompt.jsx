import { useState, useEffect } from "react";
import { FONT } from "../constants.js";

export default function InstallPrompt(){
  const [deferredPrompt,setDeferredPrompt]=useState(null);
  const [showIOSGuide,setShowIOSGuide]=useState(false);
  const [visible,setVisible]=useState(false);

  useEffect(()=>{
    if(window.matchMedia('(display-mode: standalone)').matches) return;
    const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    if(isIOS){ setVisible(true); return; }
    const handler=(e)=>{e.preventDefault();setDeferredPrompt(e);setVisible(true);};
    window.addEventListener('beforeinstallprompt',handler);
    return()=>window.removeEventListener('beforeinstallprompt',handler);
  },[]);

  if(!visible) return null;
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);

  async function handleInstall(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null); setVisible(false);
    } else if(isIOS){ setShowIOSGuide(true); }
  }

  return(
    <>
      <div onClick={handleInstall} style={{margin:"16px auto 0",maxWidth:360,background:"#1e2e1e",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",border:"1px solid rgba(255,255,255,.08)"}}>
        <img src="/icon.png" style={{width:40,height:40,borderRadius:10,flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:"#c8e6c8",fontFamily:FONT}}>앱으로 설치하기</div>
          <div style={{fontSize:11,color:"#6a8a6a",marginTop:2,fontFamily:FONT}}>홈화면에 추가하면 더 편리해요</div>
        </div>
        <div style={{fontSize:22,color:"#7aaa7a",flexShrink:0}}>＋</div>
      </div>
      {showIOSGuide&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:9999,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowIOSGuide(false)}>
          <div style={{width:"100%",background:"#1a2a1a",borderRadius:"20px 20px 0 0",padding:"24px 20px 44px",fontFamily:FONT}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:"#e8f0e8",marginBottom:4}}>홈화면에 추가하는 방법</div>
            <div style={{fontSize:12,color:"#7a9a7a",marginBottom:20}}>Safari 브라우저에서 아래 순서로 진행해주세요</div>
            {[{icon:"□↑",text:"하단 Safari 공유 버튼 탭"},{icon:"⊞",text:"\"홈 화면에 추가\" 선택"},{icon:"✓",text:"우측 상단 \"추가\" 탭"}].map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:"#2e4a2e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:"#c8e6c8",flexShrink:0}}>{s.icon}</div>
                <div style={{fontSize:14,color:"#c8dcc8"}}>{i+1}. {s.text}</div>
              </div>
            ))}
            <button onClick={()=>setShowIOSGuide(false)} style={{marginTop:4,width:"100%",padding:14,background:"#4a6a4a",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,fontFamily:FONT,cursor:"pointer"}}>확인</button>
          </div>
        </div>
      )}
    </>
  );
}
