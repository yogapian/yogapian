import { useState, useEffect } from "react";
import { FONT } from "../constants.js";

export default function InstallPrompt(){
  const [deferredPrompt,setDeferredPrompt]=useState(null);
  const [showGuide,setShowGuide]=useState(false);
  const [visible,setVisible]=useState(false);

  // 이미 설치(standalone)면 표시 안 함
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isSamsung = /SamsungBrowser/i.test(ua);
  // iOS·삼성 인터넷은 beforeinstallprompt 없이 항상 버튼 표시
  const alwaysShow = isIOS || isSamsung;

  useEffect(()=>{
    if(isStandalone) return;
    if(alwaysShow){ setVisible(true); return; }
    const handler=(e)=>{e.preventDefault();setDeferredPrompt(e);setVisible(true);};
    window.addEventListener('beforeinstallprompt',handler);
    return()=>window.removeEventListener('beforeinstallprompt',handler);
  },[]);// eslint-disable-line

  if(!visible||isStandalone) return null;

  async function handleInstall(){
    if(deferredPrompt){
      // Chrome·삼성 인터넷(이벤트 있는 경우): 네이티브 프롬프트
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null); setVisible(false);
    } else {
      // iOS 또는 삼성 인터넷(이벤트 없는 경우): 메뉴 안내
      setShowGuide(true);
    }
  }

  // 삼성 인터넷 안내 스텝
  const samsungSteps = [
    {icon:"⋮", text:"우측 상단 메뉴(⋮) 탭"},
    {icon:"⊞", text:"\"홈 화면에 추가\" 선택"},
    {icon:"✓",  text:"\"추가\" 버튼 탭"},
  ];
  // iOS Safari 안내 스텝
  const iosSteps = [
    {icon:"□↑", text:"하단 Safari 공유 버튼 탭"},
    {icon:"⊞",  text:"\"홈 화면에 추가\" 선택"},
    {icon:"✓",  text:"우측 상단 \"추가\" 탭"},
  ];
  const guideSteps = isSamsung ? samsungSteps : iosSteps;
  const guideTitle = isSamsung ? "삼성 인터넷에서 추가하는 방법" : "홈화면에 추가하는 방법";
  const guideSub   = isSamsung
    ? "삼성 인터넷 메뉴에서 아래 순서로 진행해주세요"
    : "Safari 브라우저에서 아래 순서로 진행해주세요";

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
      {showGuide&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:9999,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowGuide(false)}>
          <div style={{width:"100%",background:"#1a2a1a",borderRadius:"20px 20px 0 0",padding:"24px 20px 44px",fontFamily:FONT}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:"#e8f0e8",marginBottom:4}}>{guideTitle}</div>
            <div style={{fontSize:12,color:"#7a9a7a",marginBottom:20}}>{guideSub}</div>
            {guideSteps.map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:"#2e4a2e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:"#c8e6c8",flexShrink:0}}>{s.icon}</div>
                <div style={{fontSize:14,color:"#c8dcc8"}}>{i+1}. {s.text}</div>
              </div>
            ))}
            <button onClick={()=>setShowGuide(false)} style={{marginTop:4,width:"100%",padding:14,background:"#4a6a4a",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,fontFamily:FONT,cursor:"pointer"}}>확인</button>
          </div>
        </div>
      )}
    </>
  );
}
