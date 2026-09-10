import { useState } from "react";
import { FONT, LOGO_B64 } from "../constants.js";
import { _supabase } from "../db.js";

// 관리자 계정은 Supabase Auth로 관리 (이메일은 고정, 비밀번호는 대시보드에서 직접 설정)
const ADMIN_EMAIL = "admin@yogapian.app";

export default function AdminLoginPage({onLogin,onGoMember}){
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  async function tryLogin(){
    if(!password||loading) return;
    setLoading(true);
    const {error:authError}=await _supabase.auth.signInWithPassword({email:ADMIN_EMAIL,password});
    setLoading(false);
    if(authError){setError("비밀번호가 올바르지 않습니다.");setPassword("");return;}
    onLogin();
  }
  return(
    <div style={{minHeight:"100vh",background:"#2e3a2e",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:FONT}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <img src={LOGO_B64} alt="요가피안" style={{width:130,height:130,objectFit:"contain",display:"block",margin:"0 auto"}}/>
        <div style={{fontSize:14,fontWeight:600,color:"#a0b8a0",marginTop:8,letterSpacing:1}}>관리자 페이지</div>
      </div>
      <div style={{background:"rgba(255,255,255,.07)",borderRadius:18,padding:"24px 22px",width:"100%",maxWidth:280,border:"1px solid rgba(255,255,255,.1)"}}>
        <div style={{marginBottom:12}}><label style={{display:"block",fontSize:12,fontWeight:700,color:"#7a9a7a",marginBottom:5}}>관리자 비밀번호</label><input type="password" style={{width:"100%",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:10,padding:"12px 14px",fontSize:18,color:"#e8f0e8",background:"rgba(255,255,255,.05)",fontFamily:FONT,textAlign:"center"}} placeholder="비밀번호" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()}/></div>
        {error&&<div style={{fontSize:12,color:"#e8a0a0",marginBottom:10,textAlign:"center"}}>{error}</div>}
        <button onClick={tryLogin} disabled={loading} style={{width:"100%",background:"#4a7a4a",color:"#fff",border:"none",borderRadius:12,padding:13,fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:FONT,opacity:loading?0.7:1}}>{loading?"확인 중...":"로그인"}</button>
      </div>
      <button onClick={onGoMember} style={{marginTop:18,background:"none",border:"none",fontSize:12,color:"#5a7a5a",cursor:"pointer",fontFamily:FONT}}>← 회원 페이지로</button>
    </div>
  );
}
