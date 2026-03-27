import { useState } from "react";

export default function NoticeBoard({notices,member}){
  const [expanded,setExpanded]=useState(null);
  const filtered=notices.filter(n=>!n.targetMemberId||(member&&n.targetMemberId===member.id));
  const visible=filtered.filter(n=>n.pinned).concat(filtered.filter(n=>!n.pinned)).slice(0,5);
  if(!visible.length)return null;
  return(
    <div style={{marginBottom:16}}>
      {visible.map(n=>(
        <div key={n.id} style={{background:n.pinned?"#fffaeb":"#fff",border:`1px solid ${n.pinned?"#e8c44a":"#e4e0d8"}`,borderRadius:12,padding:"12px 14px",marginBottom:8,cursor:"pointer"}} onClick={()=>setExpanded(expanded===n.id?null:n.id)}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {n.pinned&&<span style={{fontSize:14,flexShrink:0}}>📌</span>}
            <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e",flex:1}}>{n.title}</span>
            <span style={{fontSize:12,color:"#9a8e80",flexShrink:0}}>{expanded===n.id?"▴":"▾"}</span>
          </div>
          {expanded===n.id&&(
            <div style={{marginTop:8,borderTop:"1px solid #f0ece4",paddingTop:8}}>
              {n.content&&<div style={{fontSize:13,color:"#5a5a5a",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{n.content}</div>}
              {n.imageUrl&&<img src={n.imageUrl} alt="공지 이미지" style={{width:"100%",borderRadius:8,maxHeight:320,objectFit:"contain",background:"#f7f4ef"}}/>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
