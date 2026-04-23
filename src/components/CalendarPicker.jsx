import { useState } from "react";
import { FONT, DOW_KO, TODAY } from "../constants.js";
import { parseLocal, toDateStr, isHoliday, holidayName } from "../utils.js";

export default function CalendarPicker({value,onChange,onClose,closures=[],specialSchedules=[]}){
  const sel=parseLocal(value||`${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,"0")}-${String(TODAY.getDate()).padStart(2,"0")}`);
  const [vy,setVy]=useState(sel.getFullYear());
  const [vm,setVm]=useState(sel.getMonth());
  const fd=new Date(vy,vm,1).getDay(),dim=new Date(vy,vm+1,0).getDate();
  const cells=[...Array(fd).fill(null),...Array.from({length:dim},(_,i)=>i+1)];
  const isSel=day=>day&&new Date(vy,vm,day).toDateString()===sel.toDateString();
  const isTod=day=>day&&new Date(vy,vm,day).toDateString()===TODAY.toDateString();
  const pick=day=>{if(!day)return;const mm=String(vm+1).padStart(2,"0"),dd=String(day).padStart(2,"0");onChange(`${vy}-${mm}-${dd}`);onClose();};
  const pm=()=>{if(vm===0){setVy(y=>y-1);setVm(11);}else setVm(m=>m-1);};
  const nm=()=>{if(vm===11){setVy(y=>y+1);setVm(0);}else setVm(m=>m+1);};

  return(
    <div style={{position:"absolute",top:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",zIndex:200,background:"#fff",border:"1.5px solid #ddd",borderRadius:14,boxShadow:"0 8px 32px rgba(40,35,25,.18)",padding:14,width:"min(300px, 94vw)",fontFamily:FONT}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <button onClick={pm} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#555",padding:"2px 10px"}}>‹</button>
        <span style={{fontWeight:700,fontSize:14,color:"#1e2e1e"}}>{vy}년 {vm+1}월</span>
        <button onClick={nm} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#555",padding:"2px 10px"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {DOW_KO.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:i===0?"#e05050":i===6?"#4a70d0":"#9a8e80"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((day,i)=>{
          if(!day) return <div key={i}/>;
          const ds=toDateStr(vy,vm,day);
          const dow=new Date(vy,vm,day).getDay();
          const sel2=isSel(day), tod=isTod(day);
          const holiday=isHoliday(ds);
          const fullClosure=closures.find(cl=>cl.date===ds&&!cl.timeSlot);
          const partialClosure=closures.find(cl=>cl.date===ds&&cl.timeSlot);
          const special=specialSchedules.find(s=>s.date===ds);
          const spType=special?.type||"special";
          const isOpen=special&&spType==="open";
          const isRegular=special&&spType==="regular";
          const isSpecialDay=special&&spType==="special";
          const defaultTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"14:00",evening:"19:30"};
          const hasTimeChange=isRegular&&special?.activeSlots?.some(k=>special.customTimes?.[k]&&special.customTimes[k]!==defaultTimes[k]);

          // 회원 InlineCalendar와 동일: 오늘=진초록, 선택(비오늘)=연파랑
          let bg="transparent";
          if(tod) bg="#2e6e44";
          else if(sel2) bg="#dce8ff";

          let color="#2e2e2e";
          if(tod) color="#ffffff";
          else if(sel2) color="#1a3a8a";
          else if(fullClosure) color="#939393";
          else if(holiday||dow===0) color="#e05050";
          else if(dow===6) color="#4a70d0";

          // 회원 달력과 동일: 휴강일 취소선
          const textDecor=fullClosure?"line-through":"none";

          // 배지: 선택 여부와 무관하게 항상 표시 (회원 달력 동일)
          let ind=null;
          if(fullClosure) ind=<div style={{fontSize:7,color:"#a83030",fontWeight:700,lineHeight:1.2,marginTop:1,background:"#fde8e8",borderRadius:3,padding:"0 3px",display:"inline-block"}}>휴강</div>;
          else if(partialClosure){const slabel={dawn:"새벽",morning:"오전",lunch:"점심",afternoon:"오후",evening:"저녁"}[partialClosure.timeSlot]||partialClosure.timeSlot;ind=<div style={{fontSize:7,color:"#c97050",fontWeight:700,lineHeight:1.2,marginTop:1,background:"#fdf0ec",borderRadius:3,padding:"0 3px",display:"inline-block"}}>부분</div>;}
          else if(isOpen) ind=<div style={{fontSize:7,color:"#1a6e4a",fontWeight:700,lineHeight:1.2,marginTop:1,background:"#d8f5ec",borderRadius:3,padding:"0 3px",display:"inline-block"}}>오픈</div>;
          else if(isSpecialDay) ind=<div style={{fontSize:7,color:"#5a3a9a",fontWeight:700,lineHeight:1.2,marginTop:1,background:"#ede8fa",borderRadius:3,padding:"0 3px",display:"inline-block"}}>집중</div>;
          else if(isRegular&&hasTimeChange) ind=<div style={{fontSize:7,color:"#c97474",fontWeight:700,lineHeight:1.2,marginTop:1}}>변경❗</div>;
          else if(isRegular&&special?.dailyNote) ind=<div style={{fontSize:9,lineHeight:1.2,marginTop:1}}>📢</div>;
          else if(holiday&&!fullClosure) ind=<div style={{fontSize:7,color:tod?"rgba(255,255,255,0.8)":sel2?"#3a5aaa":"#e05050",lineHeight:1.2,marginTop:1,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{holidayName(ds).slice(0,3)}</div>;

          return(
            <div key={i} onClick={()=>pick(day)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 1px 3px",borderRadius:8,cursor:"pointer",background:bg,minHeight:38}}>
              <span style={{fontSize:13,color,fontWeight:sel2||tod?700:400,textDecoration:textDecor,lineHeight:1}}>{day}</span>
              {ind}
            </div>
          );
        })}
      </div>
    </div>
  );
}
