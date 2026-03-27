import { useState } from "react";
import { fmt, addDays } from "../utils.js";
import { get3MonthsInfo } from "../memberCalc.js";
import S from "../styles.js";

export default function ExtensionModal({member,onClose,onSave}){
  const info=get3MonthsInfo(member.startDate);
  const [pm,setPm]=useState(info.map(m=>({...m,give:0})));
  const total=pm.reduce((s,m)=>s+m.give,0);
  const sg=(i,v)=>setPm(p=>p.map((m,idx)=>idx===i?{...m,give:Math.max(0,Math.min(m.surplus,v))}:m));
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:440}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>📅</span><div><div style={S.modalTitle}>5주 달 연장</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>
        {info.map((m,i)=>(<div key={m.monthName} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f0ece4"}}>
          <div><div style={{fontSize:14,fontWeight:700,color:"#2e3e2e",marginBottom:2}}>{m.monthName}</div><div style={{fontSize:12,color:"#9a8e80"}}>워킹데이 <b>{m.workingDays}일</b> {m.surplus>0&&<span style={{background:"#fdf3e3",color:"#9a5a10",borderRadius:5,padding:"1px 6px",fontSize:11,fontWeight:700}}>5주 +{m.surplus}일</span>}</div></div>
          {m.surplus>0?<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><span style={{fontSize:10,color:"#a09080"}}>연장일</span><div style={{display:"flex",alignItems:"center",gap:7}}><button style={S.stepper} onClick={()=>sg(i,pm[i].give-1)}>−</button><span style={{fontSize:15,fontWeight:700,color:"#2e5c3e",minWidth:24,textAlign:"center"}}>{pm[i].give}</span><button style={S.stepper} onClick={()=>sg(i,pm[i].give+1)}>+</button></div><span style={{fontSize:10,color:"#b0a090"}}>최대 {m.surplus}일</span></div>:<span style={{fontSize:12,color:"#c8c0b0"}}>해당없음</span>}
        </div>))}
        <div style={{background:"#f5f9f5",borderRadius:10,padding:"12px 14px",margin:"12px 0 4px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:14,fontWeight:700}}>적용 종료일</span>
          <span style={{fontSize:15,fontWeight:700,color:"#2e5c3e"}}>{fmt(addDays(member.endDate,total))}</span>
        </div>
        <div style={S.modalBtns}><button style={S.cancelBtn} onClick={onClose}>취소</button><button style={S.saveBtn} onClick={()=>onSave(total)}>저장</button></div>
      </div>
    </div>
  );
}
