import { useState } from "react";
import { FONT, GE, LOGO_B64 } from "../constants.js";
import { saveAutoLogin } from "../db.js";
import S from "../styles.js";
import { ContactBar } from "./ContactBar.jsx";
import InstallPrompt from "./InstallPrompt.jsx";

export default function MemberLoginPage({members,onLogin,onGoAdmin}){
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [error,setError]=useState("");
  const [shake,setShake]=useState(false);
  const [candidates,setCandidates]=useState(null);
  const [autoLogin,setAutoLogin]=useState(false);

  async function doLogin(m){
    if(autoLogin){
      try{ await saveAutoLogin(m.id); }catch(e){}
    }
    onLogin(m);
    setCandidates(null);
  }

  function tryLogin(){
    const trimName=name.trim(), trimPhone=phone.trim();
    const exact=members.find(m=>m.name.trim()===trimName&&m.phone4===trimPhone);
    if(exact){doLogin(exact);return;}
    const byNameOnly=members.filter(m=>m.name.trim()===trimName);
    if(byNameOnly.length>1&&!trimPhone){setCandidates(byNameOnly);return;}
    if(byNameOnly.length>1&&trimPhone){
      const matched=byNameOnly.filter(m=>m.phone4===trimPhone);
      if(matched.length===1){doLogin(matched[0]);return;}
      if(matched.length===0){setCandidates(byNameOnly);return;}
    }
    if(byNameOnly.length===1&&!trimPhone){doLogin(byNameOnly[0]);return;}
    setError("이름 또는 전화번호 뒷자리가 일치하지 않습니다.");
    setShake(true);setTimeout(()=>setShake(false),500);
  }

  if(candidates){
    return(
      <div style={{minHeight:"100vh",background:"#f5f3ef",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"40px 16px 20px",fontFamily:FONT}}>
        <div style={{background:"#fff",borderRadius:18,padding:"24px 20px",width:"100%",maxWidth:360,boxShadow:"0 4px 24px rgba(40,35,25,.1)"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#1e2e1e",marginBottom:4,textAlign:"center"}}>어느 분이세요?</div>
          <div style={{fontSize:12,color:"#9a8e80",marginBottom:16,textAlign:"center"}}>같은 이름의 회원이 여러 명 있어요</div>
          {candidates.map(m=>(
            <button key={m.id} onClick={()=>doLogin(m)}
              style={{width:"100%",background:"#f7f4ef",border:"1.5px solid #e4e0d8",borderRadius:12,padding:"14px 16px",marginBottom:8,cursor:"pointer",fontFamily:FONT,display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
              <span style={{fontSize:22}}>{GE[m.gender]}</span>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"#1e2e1e"}}>{m.name}</div>
                <div style={{fontSize:12,color:"#9a8e80",marginTop:2}}>전화번호 끝자리 ···{m.phone4}</div>
              </div>
            </button>
          ))}
          <button onClick={()=>setCandidates(null)} style={{width:"100%",background:"none",border:"none",color:"#9a8e80",fontSize:12,cursor:"pointer",fontFamily:FONT,marginTop:4}}>← 돌아가기</button>
        </div>
      </div>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:"#f5f3ef",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"40px 16px 20px",fontFamily:FONT}}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}.shake{animation:shake .4s ease}*{box-sizing:border-box}button,input{font-family:${FONT};outline:none}@media(max-width:360px){.login-card{padding:20px 16px!important}}input,textarea,select{font-size:16px!important}`}</style>
      <div style={{textAlign:"center",marginBottom:20}}>
        <img src={LOGO_B64} alt="요가피안" style={{width:140,height:140,objectFit:"contain",display:"block",margin:"0 auto"}}/>
      </div>
      <div className={(shake?"shake ":"")+"login-card"} style={{background:"#fff",borderRadius:18,padding:"28px 24px",width:"100%",maxWidth:360,boxShadow:"0 4px 24px rgba(40,35,25,.1)"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#1e2e1e",marginBottom:18,textAlign:"center"}}>수업 예약 · 내 기록 확인</div>
        <div style={{marginBottom:12}}><label style={{display:"block",fontSize:12,fontWeight:700,color:"#9a8e80",marginBottom:5}}>이름</label><input style={{...S.inp,fontSize:15}} placeholder="이름을 입력하세요" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()}/></div>
        <div style={{marginBottom:8}}><label style={{display:"block",fontSize:12,fontWeight:700,color:"#9a8e80",marginBottom:5}}>전화번호 뒷 4자리</label><input style={{...S.inp,fontSize:16,letterSpacing:5,textAlign:"center"}} placeholder="0000" maxLength={4} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&tryLogin()} type="tel"/></div>
        {error&&<div style={{fontSize:12,color:"#c97474",marginBottom:10,padding:"7px 11px",background:"#fef5f5",borderRadius:8}}>{error}</div>}
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:14,userSelect:"none"}} onClick={()=>setAutoLogin(a=>!a)}>
          <div style={{width:38,height:20,borderRadius:10,background:autoLogin?"#4a6a4a":"#ddd",position:"relative",transition:"background .2s",flexShrink:0}}>
            <div style={{position:"absolute",top:2,left:autoLogin?19:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
          </div>
          <span style={{fontSize:12,color:"#7a6e60"}}>자동 로그인</span>
        </label>
        <button onClick={tryLogin} style={{width:"100%",background:"#4a6a4a",color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:FONT,marginTop:0,touchAction:"manipulation"}}>확인하기</button>
      </div>
      <ContactBar/>
      <InstallPrompt/>
      <button onClick={onGoAdmin} style={{marginTop:12,background:"none",border:"none",fontSize:11,color:"#9a8e80",cursor:"pointer",fontFamily:FONT}}>관리자 페이지 →</button>
    </div>
  );
}
