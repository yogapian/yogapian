import { useState } from "react";
import { DOW_KO, TIME_SLOTS, TODAY } from "../constants.js";
import { parseLocal, toDateStr, isHoliday, fmt, fmtWithDow } from "../utils.js";

export default function MiniCalendar({memberId, bookings, member}){
  const now=new Date(TODAY);
  const [vy,setVy]=useState(now.getFullYear());
  const [vm,setVm]=useState(now.getMonth());
  const fd=new Date(vy,vm,1).getDay(),dim=new Date(vy,vm+1,0).getDate();
  const cells=[...Array(fd).fill(null),...Array.from({length:dim},(_,i)=>i+1)];
  const ymStr=`${vy}-${String(vm+1).padStart(2,'0')}`;

  const attendedDays=new Set(
    bookings.filter(b=>{
      if(b.memberId!==memberId||b.status!=="attended")return false;
      const d=parseLocal(b.date);
      return d.getFullYear()===vy&&d.getMonth()===vm;
    }).map(b=>parseLocal(b.date).getDate())
  );
  const monthCount=attendedDays.size;

  const renewalForMonth=(function(){
    if(!member||!member.renewalHistory)return null;
    return member.renewalHistory.find(function(r){
      const rs=r.startDate.slice(0,7),re2=r.endDate.slice(0,7);
      return rs<=ymStr&&re2>=ymStr;
    })||null;
  })();
  const TYPE_LABEL={'1month':'1개월권','3month':'3개월권'};

  const monthRecs=bookings
    .filter(b=>b.memberId===memberId&&b.status==="attended"&&b.date.startsWith(ymStr))
    .sort((a,b2)=>b2.date.localeCompare(a.date));

  const prevM=()=>{if(vm===0){setVy(y=>y-1);setVm(11);}else setVm(m=>m-1);};
  const nextM=()=>{if(vm===11){setVy(y=>y+1);setVm(0);}else setVm(m=>m+1);};

  return(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #e4e0d8",overflow:"hidden",marginBottom:14}}>
      <div style={{padding:"11px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #f0ece4"}}>
        <button onClick={prevM} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#7a6e60",padding:"0 6px",lineHeight:1}}>‹</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#1e2e1e"}}>{vy}년 {vm+1}월</div>
          {renewalForMonth&&(
            <div style={{fontSize:10,color:"#9a8e80",marginTop:2}}>
              {TYPE_LABEL[renewalForMonth.memberType]||''}
              {renewalForMonth.total>0&&` ${renewalForMonth.total}회`}
            </div>
          )}
        </div>
        <button onClick={nextM} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#7a6e60",padding:"0 6px",lineHeight:1}}>›</button>
      </div>
      <div style={{padding:"10px 10px 8px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
          {DOW_KO.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:i===0?"#e05050":i===6?"#4a70d0":"#b0a090"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {cells.map((day,i)=>{
            const dow=day?new Date(vy,vm,day).getDay():null;
            const ds=day?toDateStr(vy,vm,day):"";
            const attended=day&&attendedDays.has(day);
            const isToday=day&&new Date(vy,vm,day).toDateString()===TODAY.toDateString();
            const holiday=day&&isHoliday(ds);
            const isRed=dow===0||holiday;
            const isSat=dow===6;
            const holdStart=member?.holding?.startDate;
            const holdEnd=member?.holding?.endDate;
            const isCurrentHolding=day&&holdStart&&ds>=holdStart&&(!holdEnd||ds<=holdEnd);
            const isPastHolding=day&&(member?.holdingHistory||[]).some(h=>ds>=h.startDate&&ds<=h.endDate);
            const isHolding=isCurrentHolding||isPastHolding;
            return(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 2px",borderRadius:8,background:isToday?"#f0f8f0":"transparent"}}>
                <span style={{fontSize:12,color:day?(attended?"#2e6e44":isToday?"#4a6a4a":isHolding?"#8a98c8":isRed?"#e05050":isSat?"#4a70d0":"#c8c0b0"):"transparent",fontWeight:attended||isToday?700:400}}>{day||""}</span>
                {attended&&<span style={{width:6,height:6,borderRadius:"50%",background:"#5a9e6a",marginTop:1,display:"block"}}/>}
                {isHolding&&!attended&&<span style={{fontSize:8,color:"#8a98c8",lineHeight:1,marginTop:1}}>⏸</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{borderTop:"1px solid #f0ece4",padding:"10px 14px"}}>
        {(()=>{
          const monthStart=`${vy}-${String(vm+1).padStart(2,'0')}-01`;
          const monthEnd=`${vy}-${String(vm+1).padStart(2,'0')}-${String(new Date(vy,vm+1,0).getDate()).padStart(2,'0')}`;
          const holdStart=member?.holding?.startDate;
          const holdEnd=member?.holding?.endDate;
          const currentOverlap=holdStart&&holdStart<=monthEnd&&(!holdEnd||holdEnd>=monthStart);
          const pastOverlaps=(member?.holdingHistory||[]).filter(h=>h.startDate<=monthEnd&&h.endDate>=monthStart);
          if(!currentOverlap&&pastOverlaps.length===0) return null;
          return(
            <div style={{marginBottom:8}}>
              {currentOverlap&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#6a7fc8",background:"#edf0f8",borderRadius:8,padding:"5px 10px",marginBottom:4}}>
                <span>⏸️</span><span>홀딩: {fmt(holdStart)} ~ {holdEnd?fmt(holdEnd):"복귀 미정"}</span>
              </div>}
              {pastOverlaps.map((h,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#8a8aaa",background:"#f3f4f8",borderRadius:8,padding:"5px 10px",marginBottom:4}}>
                  <span>⏸</span><span>홀딩: {fmt(h.startDate)} ~ {fmt(h.endDate)}</span>
                </div>
              ))}
            </div>
          );
        })()}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:monthRecs.length>0?8:0}}>
          <span style={{fontSize:12,color:"#9a8e80"}}>이번 달 출석</span>
          <span style={{fontSize:14,fontWeight:700,color:monthCount>0?"#2e6e44":"#b0a090"}}>{monthCount}회 🌿</span>
        </div>
        {monthRecs.map((b,i)=>{
          const sl=TIME_SLOTS.find(t=>t.key===b.timeSlot);
          return(
            <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderTop:i>0?"1px solid #f8f4ef":"none"}}>
              <span style={{fontSize:14,width:20,textAlign:"center"}}>{sl?.icon||"📍"}</span>
              <span style={{fontSize:12,color:"#3a4a3a",flex:1}}>{fmtWithDow(b.date)}</span>
              <span style={{fontSize:11,color:sl?.color,fontWeight:600}}>{sl?.label}</span>
            </div>
          );
        })}
        {monthRecs.length===0&&<div style={{fontSize:11,color:"#c8c0b0",textAlign:"center",padding:"2px 0"}}>이번 달 출석 없음</div>}
      </div>
    </div>
  );
}
