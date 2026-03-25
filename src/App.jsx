import { useState, useRef, useMemo, useCallback, useEffect, createContext, useContext } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function debounce(fn, delay){
  let timer;
  return (...args)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...args), delay); };
}

const ClosuresContext = createContext([]);
const useClosures = () => useContext(ClosuresContext);

const SLOT_LIMIT = 10;
const SCHEDULE = {0:[],1:["dawn","morning","lunch","evening"],2:["lunch","evening"],3:["dawn","morning","lunch","evening"],4:["lunch","evening"],5:["dawn","morning","evening"],6:[]};
const TIME_SLOTS = [
  {key:"dawn",      label:"새벽",time:"06:30",color:"#3d5494",bg:"#edf0f8",icon:"🌙"},
  {key:"morning",   label:"오전",time:"08:30",color:"#3d6e45",bg:"#eaf4ea",icon:"🌤️"},
  {key:"lunch",     label:"점심",time:"11:50",color:"#8a5510",bg:"#fdf3e3",icon:"☀️"},
  {key:"afternoon", label:"오후",time:"14:00",color:"#6a5494",bg:"#f0edf8",icon:"🌞"},
  {key:"evening",   label:"저녁",time:"19:30",color:"#5c3070",bg:"#f2edf8",icon:"🌛"},
];
const DOW_KO=["일","월","화","수","목","금","토"];
const FONT="'Malgun Gothic','맑은 고딕',-apple-system,sans-serif";

// 한국 공휴일 (2025~2026)
const KR_HOLIDAYS={
  "2025-01-01":"신정","2025-01-28":"설날연휴","2025-01-29":"설날","2025-01-30":"설날연휴",
  "2025-03-01":"삼일절","2025-05-05":"어린이날","2025-05-06":"대체공휴일",
  "2025-05-15":"부처님오신날","2025-06-06":"현충일",
  "2025-08-15":"광복절","2025-10-03":"개천절","2025-10-05":"추석연휴",
  "2025-10-06":"추석","2025-10-07":"추석연휴","2025-10-08":"대체공휴일",
  "2025-10-09":"한글날","2025-12-25":"크리스마스",
  "2025-12-31":"연말 무료수업",
  "2026-01-01":"신년 무료수업","2026-02-15":"설날연휴","2026-02-16":"설날","2026-02-17":"설날연휴","2026-02-18":"설날연휴",
  "2026-03-01":"삼일절","2026-03-02":"대체공휴일","2026-05-05":"어린이날","2026-05-24":"부처님오신날","2026-05-25":"대체공휴일",
  "2026-06-06":"현충일","2026-06-08":"대체공휴일","2026-08-15":"광복절","2026-08-17":"대체공휴일",
  "2026-09-24":"추석연휴","2026-09-25":"추석","2026-09-26":"추석연휴","2026-09-28":"대체공휴일",
  "2026-10-03":"개천절","2026-10-05":"대체공휴일","2026-10-09":"한글날","2026-12-25":"크리스마스",
};
function isHoliday(dateStr){ return !!KR_HOLIDAYS[dateStr]; }
function holidayName(dateStr){ return KR_HOLIDAYS[dateStr]||""; }
function toDateStr(y,m,d){ return`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
const LOGO_B64="/logo.png";
// 오늘 날짜를 항상 실제 현재 날짜로 동적 계산
const _now=new Date();
const TODAY_STR=`${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,"0")}-${String(_now.getDate()).padStart(2,"0")}`;
const TODAY=new Date(_now.getFullYear(),_now.getMonth(),_now.getDate());
const ADMIN_PIN="0066";

const parseLocal=s=>{if(!s)return TODAY;const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);};
const fmt=d=>{const dt=parseLocal(d);return`${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,"0")}.${String(dt.getDate()).padStart(2,"0")}`;};
const fmtWithDow=d=>`${fmt(d)} (${DOW_KO[parseLocal(d).getDay()]})`;
function useClock(){
  const [now,setNow]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);
  const h=String(now.getHours()).padStart(2,"0"),mi=String(now.getMinutes()).padStart(2,"0"),s=String(now.getSeconds()).padStart(2,"0");
  const dateStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  return{timeStr:`${h}:${mi}:${s}`,dateTimeStr:`${fmtWithDow(dateStr)} ${h}:${mi}:${s}`};
}
const addDays=(s,n)=>{const d=parseLocal(s);d.setDate(d.getDate()+n);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
// 3개월권: 휴강 반영 실제 종료일 (60평일 카운트)
// 홀딩 중인 기간은 카운트에서 제외 (홀딩 startDate까지만 카운트 후 복귀 후 이어서)
// 3개월권 60평일 기준 종료일 (휴강 반영, extensionDays 제외 - 순수 60평일)
// 3개월권 휴강 연장일수: startDate~endDate 사이 전체휴강 평일수
function getClosureExtDays(m, closures=[]) {
  // closureType: regular=연장없음, regular_ext/special=extensionOverride만큼 연장
  let total = 0;
  for(const cl of closures) {
    if(cl.timeSlot) continue; // 전체휴강만
    if(cl.date < m.startDate || cl.date > m.endDate) continue; // 기간 밖
    const ov = cl.extensionOverride;
    if(!ov) continue; // 0 또는 falsy → 연장없음
    total += ov;
  }
  return total;
}

const calcDL=(m, closures=[])=>{
  const e = parseLocal(effEnd(m, closures));
  return Math.ceil((e-TODAY)/86400000);
};
const effEnd=(m, closures=[])=>{
  const closureExt = getClosureExtDays(m, closures);
  const total = closureExt + (m.extensionDays||0) + (m.holdingDays||0);
  return total > 0 ? addDays(m.endDate, total) : m.endDate;
};
function wdInMonth(y,mo){let c=0,days=new Date(y,mo+1,0).getDate();for(let d=1;d<=days;d++){const w=new Date(y,mo,d).getDay();if(w&&w!==6)c++;}return c;}
function countWorkdays(s,e){let c=0,cur=parseLocal(s),end=parseLocal(e);while(cur<=end){const d=cur.getDay();if(d&&d!==6)c++;cur.setDate(cur.getDate()+1);}return c;}

function endOfNextMonth(fromStr){
  const d=parseLocal(fromStr);
  const nextMonth=new Date(d.getFullYear(), d.getMonth()+2, 0);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth()+1).padStart(2,'0')}-${String(nextMonth.getDate()).padStart(2,'0')}`;
}
function endOfMonth(fromStr){
  const d=parseLocal(fromStr);
  const last=new Date(d.getFullYear(), d.getMonth()+1, 0);
  return `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
}

function calc3MonthEnd(startStr, closures=[]) {
  const closedDates = new Set(closures.filter(cl=>!cl.timeSlot).map(cl=>cl.date));
  let workdays = 0, cur = parseLocal(startStr);
  while(workdays < 60) {
    const dow = cur.getDay();
    const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
    if(dow !== 0 && dow !== 6 && !closedDates.has(ds)) workdays++;
    cur.setDate(cur.getDate()+1);
  }
  cur.setDate(cur.getDate()-1);
  return `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
}

function holdingElapsed(holding) {
  if(!holding || !holding.startDate) return 0;
  return Math.max(0, Math.ceil((TODAY - parseLocal(holding.startDate)) / 86400000));
}
function get3MonthsInfo(s){const st=parseLocal(s);return Array.from({length:3},(_,i)=>{const rm=st.getMonth()+i,y=st.getFullYear()+Math.floor(rm/12),mo=rm%12,wd=wdInMonth(y,mo);return{year:y,month:mo,monthName:`${y}.${String(mo+1).padStart(2,"0")}`,workingDays:wd,surplus:Math.max(0,wd-20)};});}

function usedAsOf(memberId, targetDate, bookings, members){
  const member = members ? members.find(m=>m.id===memberId) : null;
  if(!member) return 0;
  const rh=member.renewalHistory||[];
  let startDate=member.startDate;
  for(let ri=0;ri<rh.length;ri++){const r=rh[ri];if(targetDate>=r.startDate&&targetDate<=r.endDate){startDate=r.startDate;break;}}
  
  let cnt=0;
  for(let i=0;i<bookings.length;i++){
    const b=bookings[i];
    // ✅ 수정: "cancelled"(취소)와 "waiting"(대기)은 횟수에서 제외하고, 
    // 오직 "attended"나 "reserved"(확정된 것)만 카운트합니다.
    if(b.memberId===memberId && 
       (b.status==="attended" || b.status==="reserved") && 
       b.date>=startDate && b.date<=targetDate) {
      cnt++;
    }
  }
  return cnt;
}

const getStatus=(m, closures=[])=>{
  const dl=calcDL(m, closures);
  if(m.holding)return"hold";
  if(dl<0)return"off";
  return"on";
};
const SC={on:{label:"ON",bg:"#e8f0e8",color:"#2e6e44",dot:"#3d8a55"},off:{label:"OFF",bg:"#f5eeee",color:"#8e3030",dot:"#c97474"},hold:{label:"HOLD",bg:"#edf0f8",color:"#3d5494",dot:"#6a7fc8"}};
const GE={F:"🧘🏻‍♀️",M:"🧘🏻‍♂️"};
const TYPE_CFG={"1month":{label:"1개월",bg:"#e0f2e9",color:"#1e6040"},"3month":{label:"3개월",bg:"#ede9fe",color:"#5b30b8"}};

const BOOKING_STATUS={
  reserved: {label:"출석",bg:"#e8f0e8",color:"#2e6e44",icon:"✓"},
  attended: {label:"출석",bg:"#e8f0e8",color:"#2e6e44",icon:"✓"},
  waiting:  {label:"대기",bg:"#fdf3e3",color:"#9a5a10",icon:"⏳"},
  cancelled:{label:"취소",bg:"#f0ece4",color:"#9a8e80",icon:"×"},
};


function CalendarPicker({value,onChange,onClose,closures=[],specialSchedules=[]}){
  const sel=parseLocal(value||TODAY_STR);
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
          // 정규인데 시간 변경 있는지 체크
          const defaultTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"14:00",evening:"19:30"};
          const hasTimeChange=isRegular&&special?.activeSlots?.some(k=>special.customTimes?.[k]&&special.customTimes[k]!==defaultTimes[k]);

          // 배경색 (오늘/선택만)
          let bg="transparent";
          if(sel2) bg="#4a6a4a";
          else if(tod) bg="#eef5ee";

          // 날짜 색상
          let color="#2e2e2e";
          if(sel2) color="#fff";
          else if(fullClosure) color="#c97474";
          else if(holiday||dow===0) color="#e05050";
          else if(dow===6) color="#4a70d0";

          const textDecor=fullClosure&&!sel2?"line-through":"none";

          // 인디케이터 - 글씨만
          let ind=null;
          if(!sel2){
            if(fullClosure) ind=<div style={{fontSize:8,color:"#a83030",fontWeight:700,lineHeight:1.2,marginTop:1,background:"#fde8e8",borderRadius:3,padding:"1px 4px",display:"inline-block"}}>휴강</div>;
            else if(partialClosure){const slabel={dawn:"새벽",morning:"오전",lunch:"점심",afternoon:"오후",evening:"저녁"}[partialClosure.timeSlot]||partialClosure.timeSlot;ind=<div style={{fontSize:8,color:"#9a5a10",fontWeight:700,lineHeight:1.2,marginTop:1,background:"#fdf0d8",borderRadius:3,padding:"1px 4px",display:"inline-block"}}>{slabel}✕</div>;}
            else if(isOpen) ind=<div style={{fontSize:8,color:"#1a6e4a",fontWeight:700,lineHeight:1.2,marginTop:1,background:"#d8f5ec",borderRadius:3,padding:"1px 4px",display:"inline-block"}}>오픈</div>;
            else if(isRegular&&hasTimeChange) ind=<div style={{fontSize:8,color:"#c97474",fontWeight:700,lineHeight:1.2,marginTop:1,marginTop:1}}>변경❗</div>;
            else if(isRegular&&special?.dailyNote) ind=<div style={{fontSize:8,color:"transparent",fontWeight:700,lineHeight:1.2,marginTop:1}}>📌</div>;
            else if(isSpecialDay) ind=<div style={{fontSize:8,color:"#5a3a9a",fontWeight:700,lineHeight:1.2,marginTop:1,background:"#ede8fa",borderRadius:3,padding:"1px 4px",display:"inline-block"}}>집중</div>;
            else if(holiday&&!fullClosure) ind=<div style={{fontSize:7,color:"#e05050",lineHeight:1.2,marginTop:1,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{holidayName(ds).slice(0,3)}</div>;
          }

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

function MiniCalendar({memberId, bookings, member}){
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
            // 홀딩 기간 체크 - 현재 홀딩 + 과거 홀딩 이력 모두
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
        {/* 이 달에 홀딩 기간이 걸리면 안내 */}
        {(()=>{
          const monthStart=`${vy}-${String(vm+1).padStart(2,'0')}-01`;
          const monthEnd=`${vy}-${String(vm+1).padStart(2,'0')}-${String(new Date(vy,vm+1,0).getDate()).padStart(2,'0')}`;
          // 현재 홀딩
          const holdStart=member?.holding?.startDate;
          const holdEnd=member?.holding?.endDate;
          const currentOverlap=holdStart&&holdStart<=monthEnd&&(!holdEnd||holdEnd>=monthStart);
          // 과거 홀딩 이력
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

function NoticeBoard({notices,member}){
  const [expanded,setExpanded]=useState(null);
  // targetMemberId 없으면 전체 공지, 있으면 해당 회원 것도 포함
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

function PeriodBar({member}){
  const closures=useClosures();
  const end=effEnd(member,closures);
  const dl=calcDL(member,closures);
  const dlColor=dl<0?"#c97474":dl<=7?"#9a5a10":"#2e5c3e";
  const dlBg=dl<0?"#fef5f5":dl<=7?"#fdf3e3":"#eef5ee";
  const dlLabel=dl<0?`${Math.abs(dl)}일 초과`:dl===0?"오늘 만료":`D-${dl}`;
  const closureExt=getClosureExtDays(member,closures);
  const holdExt=member.extensionDays||0;
  return(
    <div style={{padding:"10px 16px",background:"#fafaf7",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",fontSize:12,color:"#7a6e60"}}>
        <span style={{fontWeight:600}}>{fmt(member.startDate)}</span>
        <span style={{color:"#c8c0b0"}}>→</span>
        <span style={{fontWeight:600,color:dl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(end)}</span>
        {closureExt>0&&<span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{closureExt}일</span>}
        {holdExt>0&&<span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{holdExt}일</span>}
      </div>
      <div style={{fontSize:13,fontWeight:700,color:dlColor,background:dlBg,borderRadius:8,padding:"4px 10px",flexShrink:0}}>{dlLabel}</div>
    </div>
  );
}

function HoldBanner({member}){
  const elapsed=holdingElapsed(member.holding);
  return(
    <div style={{padding:"8px 16px",background:"#edf0f8",display:"flex",alignItems:"center",gap:8,fontSize:12}}>
      <span style={{fontSize:14}}>⏸️</span>
      <span style={{color:"#6a7ab8"}}>{fmt(member.holding.startDate)} ~ 복귀 미정</span>
      <span style={{marginLeft:"auto",color:"#3d5494",fontWeight:700}}>+{elapsed}일 경과</span>
    </div>
  );
}

function KakaoBtn({style={}}){
  return(
    <a href="http://pf.kakao.com/_sAebn/chat" target="_blank" rel="noopener noreferrer"
      style={{display:"inline-flex",alignItems:"center",gap:7,background:"#FEE500",color:"#191600",borderRadius:10,padding:"9px 18px",fontSize:13,fontWeight:700,textDecoration:"none",boxShadow:"0 2px 8px rgba(0,0,0,.1)",...style}}>
      <svg width="20" height="20" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
        <ellipse cx="20" cy="18" rx="18" ry="15" fill="#391B1B"/>
        <path d="M11 23 L8 30 L16 24.5 Z" fill="#391B1B"/>
        <path d="M13.5 16.5 Q13.5 14.5 15 13.5 Q16.5 12.5 20 12.5 Q23.5 12.5 25 13.5 Q26.5 14.5 26.5 16.5 Q26.5 18.5 25 19.5 Q23.5 20.5 20 20.5 Q18.5 20.5 17 20 L14 22 L14.5 19.5 Q13.5 18.5 13.5 16.5 Z" fill="#FEE500"/>
      </svg>
      문의하기
    </a>
  );
}

function ContactBar(){
  return(
    <div style={{width:"100%",maxWidth:360,marginTop:24}}>
      <div style={{borderTop:"1px solid #e8e4dc",marginBottom:14}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0}}>
        <a href="https://naver.me/5MVLA70u" target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.65,flexShrink:0}}>
            <path d="M13.5 12.4L10.2 7H7v10h3.5V11.6L14 17H17V7h-3.5v5.4z" fill="#9a8e80"/>
          </svg>
          네이버 플레이스
        </a>
        <span style={{color:"#d8d4cc",fontSize:11}}>|</span>
        <a href="http://pf.kakao.com/_sAebn/chat" target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <svg width="16" height="16" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0,opacity:0.65}}>
            <ellipse cx="20" cy="18" rx="18" ry="15" fill="#8a7a50"/>
            <path d="M11 23 L8 30 L16 24.5 Z" fill="#8a7a50"/>
            <path d="M13.5 16.5 Q13.5 14.5 15 13.5 Q16.5 12.5 20 12.5 Q23.5 12.5 25 13.5 Q26.5 14.5 26.5 16.5 Q26.5 18.5 25 19.5 Q23.5 20.5 20 20.5 Q18.5 20.5 17 20 L14 22 L14.5 19.5 Q13.5 18.5 13.5 16.5 Z" fill="#f5f0e8"/>
          </svg>
          카톡채널 문의
        </a>
        <span style={{color:"#d8d4cc",fontSize:11}}>|</span>
        <a href="tel:050713769324"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <span style={{fontSize:12,opacity:0.7}}>📞</span>
          전화 문의
        </a>
      </div>
    </div>
  );
}

function MemberContactBar(){
  return(
    <div style={{width:"100%",maxWidth:360,marginTop:24}}>
      <div style={{borderTop:"1px solid #e8e4dc",marginBottom:14}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0}}>
        <a href="https://naver.me/5MVLA70u" target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.65,flexShrink:0}}>
            <path d="M13.5 12.4L10.2 7H7v10h3.5V11.6L14 17H17V7h-3.5v5.4z" fill="#9a8e80"/>
          </svg>
          네이버 플레이스
        </a>
        <span style={{color:"#d8d4cc",fontSize:11}}>|</span>
        <a href="http://pf.kakao.com/_sAebn/chat" target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <svg width="16" height="16" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0,opacity:0.65}}>
            <ellipse cx="20" cy="18" rx="18" ry="15" fill="#8a7a50"/>
            <path d="M11 23 L8 30 L16 24.5 Z" fill="#8a7a50"/>
            <path d="M13.5 16.5 Q13.5 14.5 15 13.5 Q16.5 12.5 20 12.5 Q23.5 12.5 25 13.5 Q26.5 14.5 26.5 16.5 Q26.5 18.5 25 19.5 Q23.5 20.5 20 20.5 Q18.5 20.5 17 20 L14 22 L14.5 19.5 Q13.5 18.5 13.5 16.5 Z" fill="#f5f0e8"/>
          </svg>
          카톡채널 문의
        </a>
        <span style={{color:"#d8d4cc",fontSize:11}}>|</span>
        <a href="tel:050713769324"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <span style={{fontSize:12,opacity:0.7}}>📞</span>
          전화 문의
        </a>
      </div>
      <div style={{paddingBottom:24}}/>
    </div>
  );
}

function MemberReservePage({member,bookings,setBookings,setMembers,specialSchedules,closures,notices,onBack}){
  const [tab,setTab]=useState("reserve");
  const [selDate,setSelDate]=useState(TODAY_STR);
  const [showCal,setShowCal]=useState(false);
  const [confirmCancel,setConfirmCancel]=useState(null);

  const dow=parseLocal(selDate).getDay();
  const special=specialSchedules.find(s=>s.date===selDate);
  const isWeekend=dow===0||dow===6;
  const isSpecial=!!special;
  const isOpen=special?.type==="open";
  const isRegular=special?.type==="regular";
  const isFuture=selDate>=TODAY_STR;
  const dayClosure=closures.find(cl=>cl.date===selDate&&!cl.timeSlot);
  const getSlotClosure=k=>closures.find(cl=>cl.date===selDate&&cl.timeSlot===k);
  const defaultTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};
  const hasTimeChange=isRegular&&special?.activeSlots?.some(k=>special.customTimes?.[k]&&special.customTimes[k]!==defaultTimes[k]);

  const getSlots=()=>{
    if(isSpecial)return TIME_SLOTS.filter(s=>special.activeSlots.includes(s.key)).map(s=>({...s,time:special.customTimes?.[s.key]||s.time}));
    if(isWeekend)return[];
    return TIME_SLOTS.filter(s=>SCHEDULE[dow]?.includes(s.key));
  };
  const slots=getSlots();
  const dayActive=bookings.filter(b=>b.date===selDate&&b.status!=="cancelled");
  const closuresCxt=useClosures();
  const memberDl=calcDL(member,closuresCxt);
  const memberExpired=memberDl<0;
  const rem=memberExpired?0:Math.max(0,member.total-member.used);

  function slotActiveCount(k){return dayActive.filter(b=>b.timeSlot===k&&b.status==="attended").length;}
  function slotWaitCount(k){return dayActive.filter(b=>b.timeSlot===k&&b.status==="waiting").length;}
  function mySlot(k){return dayActive.find(b=>b.memberId===member.id&&b.timeSlot===k);}
  function waitingRank(k){
    const waiters=dayActive.filter(b=>b.timeSlot===k&&b.status==="waiting").sort((a,bk)=>a.id-bk.id);
    const idx=waiters.findIndex(b=>b.memberId===member.id);
    return idx>=0?idx+1:0;
  }

  function reserve(slotKey,isWaiting=false){
    if(rem<=0||mySlot(slotKey)||getSlotClosure(slotKey)||dayClosure)return;
    if(!isWaiting&&slotActiveCount(slotKey)>=SLOT_LIMIT)return;
    const nid=Math.max(...bookings.map(b=>b.id),0)+1;
    const bStatus=isWaiting?"waiting":"attended";
    setBookings(p=>[...p,{id:nid,date:selDate,memberId:member.id,timeSlot:slotKey,walkIn:false,status:bStatus,cancelNote:"",cancelledBy:""}]);
    if(!isWaiting&&!isOpen) setMembers(p=>p.map(m=>m.id===member.id?{...m,used:m.used+1}:m));
  }

  function cancelBooking(bId){
    const cancelled = bookings.find(b=>b.id===bId);
    if(!cancelled) return;
    const slotKey = cancelled.timeSlot;

    // 🔴 핵심 방어: 취소되는 자리가 '정원석'일 때만 승격 발동
    const isAttendedCancelled = cancelled.status === "attended" || cancelled.status === "reserved";
    // 🔴 핵심 방어: 취소하는 본인을 제외한 순수 대기자만 색출
    const waiters = bookings.filter(b=>b.date===cancelled.date && b.timeSlot===slotKey && b.status==="waiting" && b.id!==bId).sort((a,b)=>a.id-b.id);
    const firstWaiter = isAttendedCancelled && waiters.length > 0 ? waiters[0] : null;

    setBookings(p => {
      const next = p.map(b => b.id === bId ? { ...b, status: "cancelled", cancelledBy: "member" } : b);
      if(firstWaiter){
        return next.map(b => b.id === firstWaiter.id ? { ...b, status: "attended" } : b);
      }
      return next;
    });

    if(firstWaiter){
      const slotLabel = TIME_SLOTS.find(t=>t.key===slotKey)?.label||"";
      const nid = Date.now();
      setNotices(prev=>[{id:nid, title:"📢 예약 확정 안내", content:`${fmt(cancelled.date)} ${slotLabel} 수업 대기가 예약으로 확정되었습니다!`, pinned:false, createdAt:TODAY_STR, targetMemberId:firstWaiter.memberId}, ...(prev||[])]);
      
      if(!isOpen) setMembers(p=>p.map(m=>m.id===firstWaiter.memberId ? {...m, used: m.used+1} : m));
    }

    // 정원석이 취소되었을 때만 횟수를 환불해 줌 (대기자 취소는 환불 없음)
    if(isAttendedCancelled && !isOpen) {
      setMembers(p=>p.map(m=>m.id===cancelled.memberId ? {...m, used: Math.max(0, m.used-1)} : m));
    }
    setConfirmCancel(null);
  }

  const myAll=bookings.filter(b=>b.memberId===member.id&&b.status!=="cancelled").sort((a,b)=>b.date.localeCompare(a.date));
  const myUpcoming=myAll.filter(b=>b.date>=TODAY_STR&&b.status==="reserved");
  // 2월 이전 기록도 모두 표시 (startDate 제한 없이 전체 기간)
  const myHistory=myAll.filter(b=>b.status==="attended"||b.date<TODAY_STR);

  return(
    <div style={{padding:"0 14px 80px",maxWidth:520,margin:"0 auto",width:"100%"}}>
      <div style={{display:"flex",gap:0,marginBottom:16,background:"#e8e4dc",borderRadius:10,padding:3}}>
        {[["reserve","🗓️ 수업 예약"],["history","📋 내 기록"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,border:"none",borderRadius:8,padding:"9px 0",fontSize:13,fontWeight:tab===k?700:400,background:tab===k?"#fff":"transparent",color:tab===k?"#1e2e1e":"#9a8e80",cursor:"pointer",fontFamily:FONT,boxShadow:tab===k?"0 1px 4px rgba(60,50,40,.1)":"none"}}>{l}</button>
        ))}
      </div>

      {tab==="reserve"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <button style={{...S.navBtn,padding:"10px 14px",fontSize:16,minWidth:44,flexShrink:0,opacity:selDate<=TODAY_STR?0.3:1,cursor:selDate<=TODAY_STR?"default":"pointer"}} onClick={()=>{if(selDate>TODAY_STR)setSelDate(d=>addDays(d,-1));}}>←</button>
            <div style={{flex:1,position:"relative"}}>
              <div onClick={()=>setShowCal(s=>!s)} style={{background:showCal?"#eef5ee":"#fff",border:`1.5px solid ${showCal?"#4a6a4a":"#ddd"}`,borderRadius:10,padding:"11px 14px",fontSize:14,fontWeight:700,color:"#1e2e1e",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span>{fmtWithDow(selDate)}</span>
                  {selDate===TODAY_STR&&<span style={{fontSize:11,background:"#4a6a4a",color:"#fff",borderRadius:5,padding:"2px 7px",fontWeight:700}}>오늘</span>}
                  {dayClosure&&<span style={{fontSize:10,background:"#fde8e8",color:"#a83030",borderRadius:4,padding:"1px 6px",fontWeight:700}}>휴강</span>}
                  {!dayClosure&&isOpen&&<span style={{fontSize:10,background:"#d8f5ec",color:"#1a6e4a",borderRadius:4,padding:"1px 6px",fontWeight:700}}>오픈</span>}
                  {!dayClosure&&isSpecial&&special?.type==="special"&&<span style={{fontSize:10,background:"#ede8fa",color:"#5a3a9a",borderRadius:4,padding:"1px 6px",fontWeight:700}}>집중</span>}
                  {!dayClosure&&isRegular&&hasTimeChange&&<span style={{fontSize:10,background:"#fdf0d8",color:"#9a5a10",borderRadius:4,padding:"1px 6px",fontWeight:700}}>변경❗</span>}
                  {!dayClosure&&isRegular&&special?.dailyNote&&!hasTimeChange&&<span style={{fontSize:10,background:"#fdf0d8",color:"#9a5a10",borderRadius:4,padding:"1px 6px",fontWeight:700}}>📌</span>}
                </div>
                <span style={{fontSize:12,color:"#9a8e80"}}>▾</span>
              </div>
              {showCal&&(<><div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setShowCal(false)}/><CalendarPicker value={selDate} onChange={v=>{setSelDate(v);setShowCal(false);}} onClose={()=>setShowCal(false)} closures={closures} specialSchedules={specialSchedules}/></>)}
            </div>
            <button style={{...S.navBtn,padding:"10px 14px",fontSize:16,minWidth:44,flexShrink:0}} onClick={()=>setSelDate(d=>addDays(d,1))}>→</button>
          </div>

          {!isFuture&&<div style={{textAlign:"center",padding:"20px 0",color:"#b0a090",fontSize:13}}>과거 날짜는 예약할 수 없어요.</div>}
          {isFuture&&isWeekend&&(!isSpecial||(special&&special.type==="regular"))&&!dayClosure&&<div style={{textAlign:"center",padding:"28px 0",color:"#b0a090"}}><div style={{fontSize:32,marginBottom:8}}>🌿</div><div style={{fontSize:14}}>이 날은 수업이 없습니다.</div></div>}
          {isFuture&&isSpecial&&(hasTimeChange||special?.dailyNote?.trim())&&(
            <div style={{background:special.type==="open"?"#d8f5ec":special.type==="special"?"#f0edff":"#fdf3e3",border:`1.5px solid ${special.type==="open"?"#1a6e4a":special.type==="special"?"#a090d0":"#e8a44a"}`,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
              <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{fontSize:18,flexShrink:0}}>🔔</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:special.type==="open"?"#1a6e4a":special.type==="special"?"#5a3a9a":"#9a5a10",marginBottom:4}}>오늘의 공지</div>
                  {special.dailyNote?.trim()&&<div style={{fontSize:12,color:special.type==="open"?"#1a5a3a":special.type==="special"?"#4a2e8a":"#7a4a10",whiteSpace:"pre-wrap"}}>{special.dailyNote}</div>}
                </div>
              </div>
            </div>
          )}
          {isFuture&&isOpen&&(
            <div style={{background:"#d8f5ec",border:"1.5px solid #7acca0",borderRadius:12,padding:"12px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:24,flexShrink:0}}>🍀</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#1a6e4a"}}>오픈클래스</div>
<div style={{fontSize:11,color:"#1a5a3a",marginTop:3}}>{special.label}</div>
{special.feeNote&&<div style={{fontSize:12,color:"#1a5a3a",marginTop:3}}>{special.feeNote}</div>}
              </div>
            </div>
          )}
          {isFuture&&isSpecial&&!isOpen&&special?.type==="special"&&(
            <div style={{background:"linear-gradient(135deg,#f0edff,#e8e2ff)",border:"1.5px solid #a090d0",borderRadius:12,padding:"12px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:24,flexShrink:0}}>⚡️</span>
              <div style={{flex:1}}>
               <div style={{fontSize:13,fontWeight:700,color:"#4a2e8a"}}>집중수련</div>
<div style={{fontSize:11,color:"#7a5aaa",marginTop:3}}>{special.label}</div>
{special.feeNote&&<div style={{fontSize:12,color:"#6a4aaa",marginTop:3}}>{special.feeNote}</div>}
              </div>
            </div>
          )}
          {isFuture&&dayClosure&&<div style={{background:"#fff3f0",border:"1px solid #f0b0a0",borderRadius:10,padding:"12px 14px",marginBottom:12,display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:20}}>🔕</span><div><div style={{fontSize:13,fontWeight:700,color:"#8e3030"}}>전체 휴강</div><div style={{fontSize:12,color:"#9a5a50",marginTop:2}}>{dayClosure.reason}</div></div></div>}

          {isFuture&&!dayClosure&&slots.filter(slot=>{
            if(selDate!==TODAY_STR) return true;
            const now=new Date(); // 매번 실시간으로 현재 시간 가져오기
            // 수업 시작 시간 기준 - 시작 후에는 예약 불가
            const slotHours={"dawn":6,"morning":8,"lunch":11,"afternoon":14,"evening":19};
            const slotMins={"dawn":30,"morning":30,"lunch":50,"afternoon":0,"evening":30};
            const h=slotHours[slot.key]||0,m=slotMins[slot.key]||0;
            const nowTotalMins=now.getHours()*60+now.getMinutes();
            const slotTotalMins=h*60+m;
            return nowTotalMins<slotTotalMins; // 현재 시각이 수업 시작 전일 때만 표시
          }).map(slot=>{
            const slClosure=getSlotClosure(slot.key);
            const cnt=slotActiveCount(slot.key);
            const waitCnt=slotWaitCount(slot.key);
            const remaining=SLOT_LIMIT-cnt;
            const myB=mySlot(slot.key);
            const myRank=myB&&myB.status==="waiting"?waitingRank(slot.key):0;
            const isFull=remaining<=0;
            return(
              <div key={slot.key} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${slClosure?"#f0b0a0":myB&&myB.status==="waiting"?"#e8c44a":myB?"#4a6a4a":isFull?"#f0ece4":slot.color+"33"}`,marginBottom:10,overflow:"hidden"}}>
                <div style={{background:slClosure?"#fff3f0":slot.bg,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:20}}>{slot.icon}</span>
                    <div>
                      <div style={{fontSize:15,fontWeight:700,color:slClosure?"#8e3030":slot.color}}>{slot.label} {(()=>{
                        const defT={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"}[slot.key];
                        const isChg=isRegular&&defT&&slot.time!==defT;
                        return isChg
                          ? <span style={{fontSize:13,opacity:.9}}><span style={{textDecoration:"line-through",color:"#b0a0a0",fontWeight:400}}>{defT}</span> → <span style={{color:"#c97474"}}>{slot.time}</span></span>
                          : <span style={{fontSize:13,opacity:.8}}>{slot.time}</span>;
                      })()}</div>
                      <div style={{fontSize:12,color:slClosure?"#9a5a50":remaining<=2&&!myB?"#c97474":slot.color}}>
                        {slClosure?`🔕 ${slClosure.reason}`:myB&&myB.status==="waiting"?`대기 ${myRank}번째 · 잔여 ${remaining}석`:myB?`예약됨 · 잔여 ${remaining}석`:isFull?`마감 · 대기 ${waitCnt}명`:`잔여 ${remaining}석`}
                      </div>
                    </div>
                  </div>
                  {slClosure?(
                    <span style={{fontSize:12,background:"#f5eeee",color:"#8e3030",borderRadius:8,padding:"6px 12px",fontWeight:700}}>휴강</span>
                  ):myB?(
                    <button onClick={()=>setConfirmCancel(myB.id)} style={{background:"#f5eeee",color:"#c97474",border:"1px solid #e8a0a0",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>{myB.status==="waiting"?"대기취소":"예약취소"}</button>
                  ):isFull?(
                    <button onClick={()=>reserve(slot.key,true)} style={{background:"#fdf3e3",color:"#9a5a10",border:"1px solid #e8c44a",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>대기신청</button>
                  ):(
                    <button onClick={()=>reserve(slot.key)} disabled={rem<=0} style={{background:rem<=0?"#f0ece4":slot.color,color:rem<=0?"#b0a090":"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:700,cursor:rem<=0?"not-allowed":"pointer",fontFamily:FONT,opacity:rem<=0?0.7:1}}>
                      {rem<=0?"잔여없음":"예약하기"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==="history"&&(
        <div>
          <div style={{background:"#fff",borderRadius:12,border:"1px solid #e4e0d8",padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:13,color:"#7a6e60"}}>누적 출석 <span style={{fontSize:11,color:"#9a8e80"}}>({fmt(member.firstDate||member.startDate)} 최초 등록)</span></span>
            <span style={{fontSize:18,fontWeight:700,color:"#2e6e44"}}>{myHistory.filter(b=>b.status==="attended").length}회</span>
          </div>
          {/* 회원권 연장 정보 */}
          {(()=>{
            const closureExt=getClosureExtDays(member,closures);
            const holdExt=member.extensionDays||0;
            if(closureExt===0&&holdExt===0) return null;
            return(
              <div style={{background:"#f0f8f0",borderRadius:12,border:"1px solid #b8d8b8",padding:"12px 16px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:"#2e6e44",marginBottom:8}}>🌿 회원권 연장 내역</div>
                {closureExt>0&&(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,marginBottom:4}}>
                    <span style={{color:"#5a7a5a"}}>휴강으로 인한 연장</span>
                    <span style={{fontWeight:700,color:"#2e6e44",background:"#f0ede8",color:"#8a7e70",borderRadius:5,padding:"1px 8px"}}>+{closureExt}일</span>
                  </div>
                )}
                {holdExt>0&&(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,marginBottom:4}}>
                    <span style={{color:"#5a6a9a"}}>홀딩으로 인한 연장</span>
                    <span style={{fontWeight:700,color:"#3d5494",background:"#edf0f8",borderRadius:5,padding:"1px 8px"}}>+{holdExt}일</span>
                  </div>
                )}
                <div style={{borderTop:"1px solid #c8e0c8",marginTop:6,paddingTop:6,display:"flex",justifyContent:"space-between",fontSize:12}}>
                  <span style={{color:"#7a6e60"}}>총 연장</span>
                  <span style={{fontWeight:700,color:"#2e5c3e"}}>+{closureExt+holdExt}일</span>
                </div>
              </div>
            );
          })()}
          <MiniCalendar memberId={member.id} bookings={bookings} member={member}/>
          {myUpcoming.length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1e2e1e",marginBottom:8}}>예약 완료 ({myUpcoming.length})</div>
              {myUpcoming.map(b=>{const sl=TIME_SLOTS.find(t=>t.key===b.timeSlot);return(
                <div key={b.id} style={{background:"#edf0f8",borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"#2a5abf"}}>{fmtWithDow(b.date)}</div>
                    <div style={{fontSize:12,color:"#5a6a9a",marginTop:2}}>{sl?.icon} {sl?.label} {sl?.time}</div>
                  </div>
                  <button onClick={()=>setConfirmCancel(b.id)} style={{background:"#f5eeee",color:"#c97474",border:"1px solid #e8a0a0",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>취소</button>
                </div>
              );})}
            </div>
          )}
        </div>
      )}

      {confirmCancel&&(
        <div style={S.overlay} onClick={()=>setConfirmCancel(null)}>
          <div style={{...S.modal,maxWidth:300,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:30,marginBottom:10}}>🌿</div>
            <div style={{...S.modalTitle,marginBottom:6}}>예약을 취소할까요?</div>
            <div style={{fontSize:13,color:"#9a8e80",marginBottom:20}}>취소하면 잔여 횟수가 복구됩니다.</div>
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setConfirmCancel(null)}>아니오</button>
              <button style={{...S.saveBtn,background:"#c97474"}} onClick={()=>cancelBooking(confirmCancel)}>취소하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberView({member,bookings,setBookings,setMembers,specialSchedules,closures,notices,setNotices,onLogout}){
  const m=member;
  const closuresCxt=useClosures();
  const status=getStatus(m,closuresCxt),sc=SC[status];
  const tc=TYPE_CFG[m.memberType]||TYPE_CFG["1month"];
  const dl=calcDL(m,closuresCxt);
  const end=effEnd(m,closuresCxt);
  const expired=dl<0;
  const rem=expired?0:Math.max(0,m.total-m.used);
  const pct=expired?100:Math.round(m.used/Math.max(m.total,1)*100);
  const barColor=expired?"#c97474":status==="hold"?"#6a7fc8":"#5a9e6a";
  const isOff=status==="off";
  const closureExt=getClosureExtDays(m,closuresCxt);

  // 개인 공지 팝업 — 읽지 않은 것만
  const personalNotices=(notices||[]).filter(n=>n.targetMemberId===m.id&&!n.readBy?.includes(m.id));
  const [popupNotice,setPopupNotice]=useState(personalNotices.length>0?personalNotices[0]:null);

  function markRead(n){
    setNotices&&setNotices(p=>p.filter(x=>x.id!==n.id));
    setPopupNotice(null);
  }

  const {dateTimeStr}=useClock();

  return(
    <div style={{minHeight:"100vh",background:"#f5f3ef",fontFamily:FONT}}>
      {/* 개인 공지 팝업 */}
      {popupNotice&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
          <div style={{background:"#fff",borderRadius:18,padding:"24px 20px",width:"100%",maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}>
            <div style={{fontSize:20,marginBottom:8,textAlign:"center"}}>📢</div>
            <div style={{fontSize:15,fontWeight:700,color:"#1e2e1e",marginBottom:12,textAlign:"center"}}>{popupNotice.title}</div>
            <div style={{fontSize:13,color:"#5a5a5a",lineHeight:1.8,whiteSpace:"pre-wrap",background:"#f7f4ef",borderRadius:10,padding:"12px 14px",marginBottom:16}}>{popupNotice.content}</div>
            <button onClick={()=>markRead(popupNotice)} style={{width:"100%",background:"#4a6a4a",color:"#fff",border:"none",borderRadius:12,padding:"13px 0",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>확인했어요</button>
          </div>
        </div>
      )}
      {/* 상단 헤더 */}
      <div style={{background:"#f5f3ef",padding:"max(16px, env(safe-area-inset-top)) 16px 12px",maxWidth:520,margin:"0 auto",width:"100%",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
            <span style={{fontSize:20,color:"#5a7a5a"}}>ॐ</span>
            <span style={{fontSize:21,fontWeight:700,color:"#1e2e1e"}}>요가피안</span>
          </div>
          <div style={{fontSize:11,color:"#a09080"}}>{dateTimeStr}</div>
        </div>
        <button onClick={onLogout} style={{background:"#f0ece4",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#7a6e60",cursor:"pointer",fontFamily:FONT,marginTop:4}}>로그아웃</button>
      </div>
      <div style={{padding:"0 14px 0",maxWidth:520,margin:"0 auto",width:"100%"}}>
        {/* 공지 최상단 */}
        <NoticeBoard notices={notices} member={member}/>
        {/* 회원카드 */}
        <div style={{...S.card,opacity:isOff?0.82:1,marginBottom:12}}>
          <div style={{...S.cardTop}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flex:1,minWidth:0}}>
              <span style={{fontSize:20,lineHeight:1,flexShrink:0}}>{GE[m.gender]}</span>
              <span style={S.memberName}>{m.name}</span>
              {m.isNew&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
              {!isOff&&<span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:tc.bg,color:tc.color,fontWeight:700}}>{tc.label}</span>}
              {m.holding&&<span style={{fontSize:13,lineHeight:1,flexShrink:0}}>⏸️</span>}
            </div>
            <span style={{...S.statusBadge,background:sc.bg,color:sc.color,flexShrink:0}}><span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,display:"inline-block",marginRight:4}}/>{sc.label}</span>
          </div>
          {m.adminNote&&<div style={{fontSize:11,color:"#9a5a10",background:"#fffaeb",borderRadius:6,padding:"3px 8px",marginBottom:7,border:"1px dashed #e8c44a"}}>📝 {m.adminNote}</div>}
          {isOff?(
            <div style={{fontSize:11,color:"#b0a090",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
              <span>종료</span><span style={{fontWeight:600,color:"#c97474"}}>{fmt(end)}</span>
            </div>
          ):(
            <>
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                  <span style={{fontSize:11,color:"#9a8e80"}}>등록 <b style={{color:"#3a4a3a"}}>{m.total}회</b></span>
                  <span style={{fontSize:11,color:"#9a8e80"}}>사용 <b style={{color:"#3a4a3a"}}>{m.used}</b></span>
                  <span style={{fontSize:13,fontWeight:700,color:rem===0?"#9a5a10":"#2e5c3e"}}>잔여 <span style={{fontSize:20}}>{rem}</span>회</span>
                </div>
                <div style={{background:"#e8e4dc",borderRadius:8,height:20,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",transition:"width .4s"}}>
                    {pct>15&&<span style={{fontSize:10,fontWeight:700,color:"#fff"}}>{m.used}회</span>}
                  </div>
                </div>
              </div>
              <div style={S.dateRow}>
                <div style={{display:"flex",flexDirection:"column",gap:1}}><span style={S.dateLabel}>등록일</span><span style={S.dateVal}>{fmt(m.startDate)}</span></div>
                <span style={{color:"#c8c0b0",fontSize:13,marginTop:9}}>→</span>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  <span style={S.dateLabel}>종료일</span>
                  <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                    <span style={{...S.dateVal,color:dl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(end)}</span>
                    {closureExt>0&&<span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{closureExt}일</span>}
                    {(m.extensionDays||0)>0&&<span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{m.extensionDays}일</span>}
                  </div>
                </div>
                <div style={{...S.dChip,background:dl<0?"#f5eeee":dl<=7?"#fdf3e3":"#eef4ee",color:dl<0?"#c97474":dl<=7?"#9a5a10":"#2e6e44"}}>{dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`}</div>
              </div>
            </>
          )}
        </div>
      </div>
      <MemberReservePage member={m} bookings={bookings} setBookings={setBookings} setMembers={setMembers} specialSchedules={specialSchedules} closures={closures} notices={notices} onBack={()=>{}}/>
      <div style={{display:"flex",justifyContent:"center"}}>
        <MemberContactBar/>
      </div>
    </div>
  );
}

function NoticeManager({notices,setNotices,onClose}){
  const [form,setForm]=useState(null);
  const [editId,setEditId]=useState(null);
  function openAdd(){setEditId(null);setForm({title:"",content:"",pinned:false,imageUrl:""});}
  function openEdit(n){setEditId(n.id);setForm({title:n.title,content:n.content,pinned:n.pinned,imageUrl:n.imageUrl||""});}
  function save(){
    if(!form.title)return;
    if(editId){setNotices(p=>p.map(n=>n.id===editId?{...n,...form}:n));}
    else{const nid=Math.max(...notices.map(n=>n.id),0)+1;setNotices(p=>[...p,{id:nid,...form,createdAt:TODAY_STR}]);}
    setForm(null);
  }
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:440,maxHeight:"85vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{...S.modalHead,justifyContent:"space-between"}}>
          <div style={S.modalHead}><span style={{fontSize:20}}>📢</span><span style={S.modalTitle}>공지사항 관리</span></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:"#9a8e80",cursor:"pointer"}}>×</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {!form&&(<>
            <button onClick={openAdd} style={{...S.saveBtn,width:"100%",marginBottom:12,textAlign:"center"}}>+ 새 공지 작성</button>
            {notices.length===0&&<div style={{textAlign:"center",color:"#b0a090",fontSize:13,padding:"20px 0"}}>공지사항이 없습니다.</div>}
            {notices.map(n=>(
              <div key={n.id} style={{background:n.pinned?"#fffaeb":"#f7f4ef",borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${n.pinned?"#e8c44a":"#e4e0d8"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  {n.pinned&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:5,padding:"1px 6px",fontWeight:700}}>📌 고정</span>}
                  <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e",flex:1}}>{n.title}</span>
                </div>
                <div style={{fontSize:12,color:"#7a6e60",marginBottom:8,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{n.content}</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>openEdit(n)} style={{...S.editBtn,fontSize:11,padding:"4px 10px"}}>수정</button>
                  <button onClick={()=>setNotices(p=>p.filter(x=>x.id!==n.id))} style={{...S.delBtn,fontSize:11,padding:"4px 10px"}}>삭제</button>
                  <button onClick={()=>setNotices(p=>p.map(x=>x.id===n.id?{...x,pinned:!x.pinned}:x))} style={{fontSize:11,background:"#fdf3e3",color:"#9a5a10",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontFamily:FONT}}>{n.pinned?"고정해제":"고정"}</button>
                </div>
              </div>
            ))}
          </>)}
          {form&&(<>
            <div style={S.fg}><label style={S.lbl}>제목</label><input style={S.inp} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="공지 제목"/></div>
            <div style={S.fg}><label style={S.lbl}>내용</label><textarea style={{...S.inp,height:90,resize:"vertical"}} value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="공지 내용 (선택)"/></div>
            <div style={S.fg}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                <div onClick={()=>setForm(f=>({...f,pinned:!f.pinned}))} style={{width:38,height:20,borderRadius:10,background:form.pinned?"#4a6a4a":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
                  <div style={{position:"absolute",top:2,left:form.pinned?19:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </div>
                <span style={{color:"#4a4a4a"}}>상단 고정 (중요 공지)</span>
              </label>
            </div>
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setForm(null)}>취소</button>
              <button style={S.saveBtn} onClick={save}>저장</button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}

function AttendCheckModal({rec,members,isOpen,bookings,setBookings,setMembers,notices,setNotices,onClose}){
  const [note,setNote]=useState("");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const mem=rec.memberId?members.find(m=>m.id===rec.memberId):null;
  const slotLabel=TIME_SLOTS.find(t=>t.key===rec.timeSlot)?.label||"";
  const live=bookings.find(b=>b.id===rec.id)||rec;

  // 공통 로직: 대기자 중 가장 빠른 순번 1명 찾기
  const getFirstWaiter = (allBookings) => {
    return allBookings
      .filter(b => b.date === rec.date && b.timeSlot === rec.timeSlot && b.status === "waiting")
      .sort((a, b) => a.id - b.id)[0];
  };

  // 공통 로직: 대기자를 예약으로 승격시키고 알림/횟수 처리
  const promoteWaiterLogic = (nextBookings) => {
    const waiter = getFirstWaiter(nextBookings);
    if (!waiter) return { nextBookings };

    // 1. 상태를 'attended'(예약확정)으로 변경
    const updatedBookings = nextBookings.map(b => 
      b.id === waiter.id ? { ...b, status: "attended" } : b
    );

    // 2. 알림 메시지 생성
    const nid = Date.now();
    setNotices(prev => [{
      id: nid,
      title: "📢 예약 확정 안내",
      content: `${fmt(rec.date)} ${slotLabel} 수업 대기가 예약으로 확정되었습니다!`,
      pinned: false, createdAt: TODAY_STR, targetMemberId: waiter.memberId
    }, ...prev]);

    // 3. 정규 회원일 경우 사용 횟수 +1 (오픈클래스 제외)
    if (!isOpen) {
      setMembers(prevM => prevM.map(m => m.id === waiter.id ? { ...m, used: m.used + 1 } : m));
    }

    return { nextBookings: updatedBookings };
  };

  function doAttend(){
    setBookings(p=>p.map(b=>b.id===rec.id?{...b,confirmedAttend:true}:b));
    onClose();
  }

  // [불참 처리] - 자리가 비므로 대기자 승격
  function doAbsent(){
    setBookings(p => {
      let next = p.map(b => b.id === rec.id ? { ...b, confirmedAttend: false } : b);
      const res = promoteWaiterLogic(next);
      return res.nextBookings;
    });
    onClose();
  }

  // [삭제 처리] - 자리가 비므로 대기자 승격
  function doDelete(){
    const isReserved = rec.status === "attended" || rec.status === "reserved";
    
    setBookings(p => {
      // 본인 삭제 처리
      let next = p.map(b => b.id === rec.id ? { ...b, status: "cancelled", cancelNote: note, cancelledBy: "admin", confirmedAttend: false } : b);
      
      // 확정 예약자가 삭제되는 경우에만 대기자 승격
      if(isReserved) {
        const res = promoteWaiterLogic(next);
        next = res.nextBookings;
      }
      return next;
    });

    // 본인이 회원인 경우 횟수 복구 (-1)
    if(isReserved && mem && !isOpen) {
      setMembers(p=>p.map(m=>m.id===mem.id ? {...m, used: Math.max(0, m.used-1)} : m));
    }
    onClose();
  }

  function doReset(){
    setBookings(p=>p.map(b=>b.id===rec.id?{...b,confirmedAttend:null}:b));
    onClose();
  }

  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:300}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={{fontSize:20}}>📋</span>
          <div>
            <div style={S.modalTitle}>{mem ? mem.name : rec.onedayName}</div>
            <div style={{fontSize:12,color:"#9a8e80",marginTop:2}}>{slotLabel} 출석 확인</div>
          </div>
        </div>

        {live.confirmedAttend===true && (
          <div style={{textAlign:"center",marginBottom:12}}>
            <div style={{fontSize:32,marginBottom:6}}>{live.walkIn ? "☑️" : "✅"}</div>
            <div style={{fontSize:13,color:"#9a8e80"}}>출석 확인됨 {live.walkIn ? "(워크인)" : ""}</div>
            <button onClick={doReset} style={{marginTop:10,background:"none",border:"none",fontSize:12,color:"#9a8e80",cursor:"pointer",fontFamily:FONT}}>↩ 되돌리기</button>
          </div>
        )}

        {live.confirmedAttend===false && (
          confirmDelete ? (
            <>
              <div style={{textAlign:"center",fontSize:13,color:"#c97474",fontWeight:700,marginBottom:10}}>목록에서 삭제할까요?</div>
              <input style={{...S.inp,fontSize:12,marginBottom:10}} value={note} onChange={e=>setNote(e.target.value)} placeholder="불참 사유 (선택)"/>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <button onClick={()=>setConfirmDelete(false)} style={{flex:1,background:"#f5f5f5",color:"#9a8e80",border:"none",borderRadius:10,padding:"10px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>취소</button>
                <button onClick={doDelete} style={{flex:1,background:"#fff0f0",color:"#c97474",border:"1.5px solid #f0b0b0",borderRadius:10,padding:"10px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>삭제+알림</button>
              </div>
            </>
          ) : (
            <div style={{textAlign:"center",marginBottom:12}}>
              <div style={{fontSize:32,marginBottom:6}}>❌</div>
              <div style={{fontSize:13,color:"#9a8e80",marginBottom:10}}>불참 처리됨</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={doReset} style={{flex:1,background:"#f5f5f5",color:"#9a8e80",border:"none",borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>↩ 되돌리기</button>
                <button onClick={()=>setConfirmDelete(true)} style={{flex:1,background:"#fff0f0",color:"#c97474",border:"1.5px solid #f0b0b0",borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>🗑️ 삭제</button>
              </div>
            </div>
          )
        )}

        {(live.confirmedAttend===undefined || live.confirmedAttend===null) && (
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={doAttend} style={{flex:1,background:"#eef5ee",color:"#2e6e44",border:"1.5px solid #7aaa7a",borderRadius:10,padding:"14px 0",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>✅ 출석</button>
            <button onClick={()=>{
              // 원데이(비회원)는 doDelete와 동일한 로직으로 처리하여 대기자 승격 유도
              if(!mem) doDelete(); 
              else doAbsent();
            }} style={{flex:1,background:"#fff0f0",color:"#c97474",border:"1.5px solid #f0b0b0",borderRadius:10,padding:"14px 0",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>❌ 불참</button>
          </div>
        )}
        <button onClick={onClose} style={{...S.cancelBtn,width:"100%"}}>닫기</button>
      </div>
    </div>
  );
}

function AdminCancelModal({booking,member,onClose,onConfirm}){
  const [note,setNote]=useState("");
  const sl=TIME_SLOTS.find(t=>t.key===booking.timeSlot);
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={{fontSize:20}}>⚠️</span>
          <div>
            <div style={S.modalTitle}>예약 강제 취소</div>
            <div style={{fontSize:12,color:"#9a8e80",marginTop:2}}>{member?.name}</div>
          </div>
        </div>
        <div style={{background:"#fdf3e3",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#8a5510",marginBottom:14}}>
          {fmtWithDow(booking.date)} {sl?.label} {sl?.time}<br/>취소 시 잔여 횟수가 복구됩니다.
        </div>
        <div style={S.fg}>
          <label style={S.lbl}>취소 사유 (선택)</label>
          <textarea 
            style={{...S.inp,height:80,resize:"none"}} 
            value={note} 
            onChange={e=>setNote(e.target.value)} 
            placeholder="예: 노쇼 처리, 강사 사정 등"
          />
        </div>
        <div style={S.modalBtns}>
          <button style={S.cancelBtn} onClick={onClose}>닫기</button>
          <button style={{...S.saveBtn,background:"#c97474"}} onClick={()=>onConfirm(note)}>강제 취소</button>
        </div>
      </div>
    </div>
  );
}

function AttendanceBoard({members,bookings,setBookings,setMembers,specialSchedules,setSpecialSchedules,closures,setClosures,notices,setNotices,onMemberClick}){
  const [date,setDate]=useState(TODAY_STR);
  const [showCal,setShowCal]=useState(false);
  const [addModal,setAddModal]=useState(null);
  const [addForm,setAddForm]=useState({type:"member",memberId:"",onedayName:"",walkIn:false});
  const [convertModal,setConvertModal]=useState(null);
  const [showSpecialMgr,setShowSpecialMgr]=useState(false);
  const INIT_SP={date:TODAY_STR,label:"",type:"regular",feeNote:"",dailyNote:"",activeSlots:[],customTimes:{dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"}};
  const [newSp,setNewSp]=useState(INIT_SP);
  const [originalType,setOriginalType]=useState(null);
  const closeSpecialMgr=()=>{setShowSpecialMgr(false);setOriginalType(null);setNewSp(INIT_SP);};
  const [cancelModal,setCancelModal]=useState(null);
  const [attendCheckModal,setAttendCheckModal]=useState(null);
  const [dragId,setDragId]=useState(null);
  const [dragOver,setDragOver]=useState(null);
  const [showClosureMgr,setShowClosureMgr]=useState(false);
  const [closureForm,setClosureForm]=useState({date:TODAY_STR,timeSlot:"",reason:"",closureType:"regular",extensionOverride:0});
  const [quickDetailM,setQuickDetailM]=useState(null); // 이름 클릭 시 회원 상세 카드

  const [openWaitActionId, setOpenWaitActionId] = useState(null);
  const [waitPopup, setWaitPopup] = useState(null); // {rec, slotKey, mem}

  const dow=parseLocal(date).getDay();
  const special=specialSchedules.find(s=>s.date===date);
  const isWeekend=dow===0||dow===6;
  const isSpecial=!!special;
  const isOpen=special?.type==="open";
  const isRegular=special?.type==="regular";
  const dayClosure=closures.find(cl=>cl.date===date&&!cl.timeSlot);
  const getSlotClosure=k=>closures.find(cl=>cl.date===date&&cl.timeSlot===k);
  const defaultTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"14:00",evening:"19:30"};
  const hasTimeChange=isRegular&&special?.activeSlots?.some(k=>special.customTimes?.[k]&&special.customTimes[k]!==defaultTimes[k]);

  const getSlots=()=>{
    if(isSpecial)return TIME_SLOTS.filter(s=>special.activeSlots.includes(s.key)).map(s=>({...s,time:special.customTimes?.[s.key]||s.time}));
    if(isWeekend)return[];
    return TIME_SLOTS.filter(s=>SCHEDULE[dow]?.includes(s.key));
  };
  const slots=getSlots();
  const dayActive=bookings.filter(b=>b.date===date&&b.status!=="cancelled");

  function adminCancel(id, note){
    const b = bookings.find(bk=>bk.id===id);
    if(!b) return;

    const isAttendedCancelled = b.status === "attended" || b.status === "reserved";
    const waiters = bookings.filter(bk=>bk.date===b.date && bk.timeSlot===b.timeSlot && bk.status==="waiting" && bk.id!==id).sort((a,c)=>a.id-c.id);
    const firstWaiter = isAttendedCancelled && waiters.length > 0 ? waiters[0] : null;

    setBookings(p => {
      const next = p.map(bk => bk.id === id ? { ...bk, status: "cancelled", cancelledBy: "admin", cancelNote: note } : bk);
      if(firstWaiter){
        return next.map(bk => bk.id === firstWaiter.id ? { ...bk, status: "attended" } : bk);
      }
      return next;
    });

    if(firstWaiter){
      const slotLabel = TIME_SLOTS.find(t=>t.key===b.timeSlot)?.label||"";
      const nid = Date.now();
      setNotices(prev=>[{id:nid, title:"📢 예약 확정 안내", content:`${fmt(b.date)} ${slotLabel} 수업 대기가 예약으로 확정되었습니다!`, pinned:false, createdAt:TODAY_STR, targetMemberId:firstWaiter.memberId}, ...(prev||[])]);

      if(!isOpen) setMembers(p=>p.map(m=>m.id===firstWaiter.memberId ? {...m, used: m.used+1} : m));
    }

    if(isAttendedCancelled && b.memberId && !isOpen) {
      setMembers(p=>p.map(m=>m.id===b.memberId ? {...m, used: Math.max(0, m.used-1)} : m));
    }
    setCancelModal(null);
  }

  function addRecord(){
    const nid=Math.max(...bookings.map(b=>b.id),0)+1;
    if(addForm.type==="oneday"){
      if(!addForm.onedayName.trim())return;
      setBookings(p=>[...p,{id:nid,date,memberId:null,onedayName:addForm.onedayName.trim(),timeSlot:addModal,walkIn:true,status:"attended",cancelNote:"",cancelledBy:""}]);
    } else {
      if(!addForm.memberId)return;
      setBookings(p=>[...p,{id:nid,date,memberId:+addForm.memberId,timeSlot:addModal,walkIn:addForm.walkIn,status:"attended",cancelNote:"",cancelledBy:""}]);
      if(!isOpen) setMembers(p=>p.map(m=>m.id===+addForm.memberId?{...m,used:m.used+1}:m));
    }
    setAddModal(null);setAddForm({type:"member",memberId:"",onedayName:"",walkIn:false});
  }

  function onDragStart(e,id){setDragId(id);e.dataTransfer.effectAllowed="move";}
  function onDragEnd(){setDragId(null);setDragOver(null);}
  function onDropSlot(e,slotKey){
    e.preventDefault();
    if(!dragId)return;
    const rec=bookings.find(b=>b.id===dragId);
    if(!rec||rec.timeSlot===slotKey)return;
    const alreadyIn=dayActive.filter(b=>b.timeSlot===slotKey&&b.memberId).map(b=>b.memberId);
    if(rec.memberId&&alreadyIn.includes(rec.memberId))return;
    setBookings(p=>p.map(b=>b.id===dragId?{...b,timeSlot:slotKey}:b));
    setDragOver(null);setDragId(null);
  }

  const slotMids=k=>dayActive.filter(b=>b.timeSlot===k&&b.memberId).map(b=>b.memberId);
  const avail=k=>members.filter(m=>!slotMids(k).includes(m.id)&&getStatus(m,closures)!=="off").sort((a,b)=>a.name.localeCompare(b.name,"ko"));

  function addSpecial(){
    if(!newSp.date)return;
    if(newSp.type!=="regular"&&!newSp.label)return;
    const nid=Math.max(...specialSchedules.map(s=>s.id),0)+1;
    const label=newSp.label||(newSp.type==="regular"?"정규수업":"");
    setSpecialSchedules(p=>[...p.filter(s=>s.date!==newSp.date),{...newSp,label,id:nid}]);
    closeSpecialMgr();
  }
  const toggleSp=sl=>setNewSp(f=>({...f,activeSlots:f.activeSlots.includes(sl)?f.activeSlots.filter(s=>s!==sl):[...f.activeSlots,sl]}));

  const attendedDay=dayActive.filter(b=>b.status==="attended").length;

  return(
    <div>
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
          <button style={{...S.navBtn,padding:"10px 14px",fontSize:16,minWidth:44,flexShrink:0}} onClick={()=>setDate(d=>addDays(d,-1))}>←</button>
          <div style={{flex:1,position:"relative"}}>
            <div onClick={()=>setShowCal(s=>!s)} style={{background:showCal?"#eef5ee":"#fff",border:`1.5px solid ${showCal?"#4a6a4a":"#ddd"}`,borderRadius:10,padding:"10px 12px",fontSize:14,fontWeight:700,color:"#1e2e1e",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              {fmtWithDow(date)}
              {date===TODAY_STR&&<span style={{fontSize:10,background:"#4a6a4a",color:"#fff",borderRadius:5,padding:"2px 6px",fontWeight:700}}>오늘</span>}
              {dayClosure&&<span style={{fontSize:10,background:"#fde8e8",color:"#a83030",borderRadius:4,padding:"1px 6px",fontWeight:700}}>휴강</span>}
              {isSpecial&&special.type==="open"&&<span style={{fontSize:10,background:"#d8f5ec",color:"#1a6e4a",borderRadius:4,padding:"1px 6px",fontWeight:700}}>오픈</span>}
              {isSpecial&&special.type==="special"&&<span style={{fontSize:10,background:"#ede8fa",color:"#5a3a9a",borderRadius:4,padding:"1px 6px",fontWeight:700}}>집중</span>}
              {isSpecial&&special.type==="regular"&&(hasTimeChange||special.dailyNote)&&<span style={{fontSize:10,background:"#fdf0d8",color:"#9a5a10",borderRadius:4,padding:"1px 6px",fontWeight:700}}>{hasTimeChange?"변경❗":"📌"}</span>}
              <span style={{fontSize:12,color:"#9a8e80"}}>▾</span>
            </div>
            {showCal&&(<><div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setShowCal(false)}/><CalendarPicker value={date} onChange={v=>{setDate(v);setShowCal(false);}} onClose={()=>setShowCal(false)} closures={closures} specialSchedules={specialSchedules}/></>)}
          </div>
          <button style={{...S.navBtn,padding:"10px 14px",fontSize:16,minWidth:44,flexShrink:0}} onClick={()=>setDate(d=>addDays(d,1))}>→</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          {slots.length>0&&<div style={{background:"#2e8a4a",color:"#fff",borderRadius:8,padding:"5px 10px",fontSize:12,fontWeight:700}}>출석 {attendedDay}</div>}
          <button style={{...S.navBtn,fontSize:11,padding:"6px 10px",color:"#8a5510",background:"#fff"}} onClick={()=>{
            const dowSlots=SCHEDULE[new Date(date+"T00:00:00").getDay()]||[];
            const regularTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};
            // specialSchedules에서 직접 찾기 (special 변수보다 정확)
            const spOnDate=specialSchedules.find(s=>s.date===date);
            if(spOnDate){
              setNewSp({date,type:spOnDate.type,label:spOnDate.label||"",feeNote:spOnDate.feeNote||"",dailyNote:spOnDate.dailyNote||"",activeSlots:spOnDate.activeSlots||[],customTimes:{...regularTimes,...(spOnDate.customTimes||{})}});
              setOriginalType(spOnDate.type);
            } else if(dowSlots.length){
              // 정규 운영일 신규 → activeSlots는 요일 슬롯으로 세팅 (정규 기본값)
              setNewSp({date,type:"regular",label:"",feeNote:"",dailyNote:"",activeSlots:dowSlots,customTimes:regularTimes});
              setOriginalType("regular");
            } else {
              // 주말 등 비운영일 신규
              setNewSp({date,type:"special",label:"",feeNote:"",activeSlots:[],customTimes:regularTimes});
              setOriginalType(null);
            }
            setShowSpecialMgr(true);
          }}>
            🗓️ 수업설정
          </button>
        </div>
      </div>

      {isWeekend&&(!isSpecial||(special&&special.type==="regular"))&&!dayClosure&&<div style={{textAlign:"center",padding:"50px 0",color:"#b0a090"}}><div style={{fontSize:36,marginBottom:10}}>🌿</div><div style={{fontSize:14,fontWeight:700}}>이 날은 수업이 없습니다.</div></div>}
      {isSpecial&&(hasTimeChange||special?.dailyNote?.trim())&&(
        <div style={{background:special.type==="open"?"#d8f5ec":special.type==="special"?"#f0edff":"#fdf3e3",border:`1.5px solid ${special.type==="open"?"#1a6e4a":special.type==="special"?"#a090d0":"#e8a44a"}`,borderRadius:10,padding:"10px 14px",marginBottom:12}}>
          <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:16,flexShrink:0}}>🔔</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:special.type==="open"?"#1a6e4a":special.type==="special"?"#5a3a9a":"#9a5a10",marginBottom:4}}>오늘의 공지</div>
              {special.dailyNote?.trim()&&<div style={{fontSize:12,color:special.type==="open"?"#1a5a3a":special.type==="special"?"#4a2e8a":"#7a4a10",whiteSpace:"pre-wrap"}}>{special.dailyNote}</div>}
            </div>
          </div>
        </div>
      )}
      {isOpen&&(
        <div style={{background:"#d8f5ec",border:"1.5px solid #7acca0",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:20,flexShrink:0}}>🍀</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1a6e4a"}}>오픈클래스</div>
<div style={{fontSize:11,color:"#1a5a3a",marginTop:3}}>{special.label}</div>
{special.feeNote&&<div style={{fontSize:12,color:"#1a5a3a",marginTop:3}}>{special.feeNote}</div>}
          </div>
        </div>
      )}
    {isSpecial&&!isOpen&&special?.type==="special"&&(
        <div style={{background:"linear-gradient(135deg,#f0edff,#e8e2ff)",border:"1.5px solid #a090d0",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:20,flexShrink:0}}>⚡️</span>
          <div style={{flex:1}}>
           <div style={{fontSize:13,fontWeight:700,color:"#4a2e8a"}}>집중수련</div>
<div style={{fontSize:11,color:"#7a5aaa",marginTop:3}}>{special.label}</div>
{special.feeNote&&<div style={{fontSize:12,color:"#6a4aaa",marginTop:3}}>{special.feeNote}</div>}
          </div>
        </div>
      )}
      {dayClosure&&<div style={{
          background:dayClosure.closureType==="regular"?"#fff0f0":dayClosure.closureType==="regular_ext"?"#fff5f5":"#fff0f0",
          border:`1px solid ${dayClosure.closureType==="regular"?"#e8a0a0":dayClosure.closureType==="regular_ext"?"#f0b0b0":"#e8a0a0"}`,
          borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8,fontSize:13}}>
        <span style={{fontSize:18}}>🔕</span>
        <div style={{flex:1}}>
          <b>{dayClosure.closureType==="regular"?"정기 휴강":dayClosure.closureType==="regular_ext"?"정기휴강 (추가연장)":"⚠️ 별도 휴강"}</b> — {dayClosure.reason}
          {dayClosure.closureType==="regular"
            ?<span style={{marginLeft:6,fontSize:11,background:"#e8f5e0",color:"#2e6e44",borderRadius:4,padding:"1px 6px",fontWeight:700}}>연장없음</span>
            :!dayClosure.timeSlot&&<span style={{marginLeft:6,fontSize:11,background:"#fef5e0",color:"#9a5a10",borderRadius:4,padding:"1px 6px",fontWeight:700}}>+1일 연장</span>
          }
        </div>
        <button onClick={()=>{const nc=closures.filter(cl=>cl.id!==dayClosure.id);setClosures(nc);setMembers(prev=>prev.map(m=>m.memberType==="3month"?{...m,endDate:calc3MonthEnd(m.startDate,nc)}:m));}} style={{background:"none",border:"none",color:"#c97474",cursor:"pointer",fontSize:12,fontFamily:FONT}}>삭제</button>
      </div>}

      {slots.length>0&&!dayClosure&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
          {slots.map(slot=>{
            const recs=dayActive.filter(b=>b.timeSlot===slot.key);
            const isDT=dragOver===slot.key;
            const slotCl=getSlotClosure(slot.key);
            return(
              <div key={slot.key}
                onDragOver={e=>{e.preventDefault();setDragOver(slot.key);}}
                onDrop={e=>onDropSlot(e,slot.key)}
                onDragLeave={()=>setDragOver(null)}
                style={{background:"#fff",borderRadius:14,overflow:"hidden",border:`2px solid ${slotCl?"#f0b0a0":isDT?slot.color:"#e8e4dc"}`,boxShadow:isDT?`0 0 0 3px ${slot.bg}`:"0 2px 8px rgba(60,50,40,.06)"}}>
                {slotCl&&<div style={{background:"#fff3f0",padding:"6px 12px",fontSize:11,color:"#8e3030",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #f0d0c0"}}>
                  <span>🔕 {slotCl.reason}</span>
                  <button onClick={()=>setClosures(p=>p.filter(cl=>cl.id!==slotCl.id))} style={{background:"none",border:"none",color:"#c97474",cursor:"pointer",fontSize:11,fontFamily:FONT}}>삭제</button>
                </div>}
                <div style={{background:slot.bg,padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:17}}>{slot.icon}</span>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:slot.color}}>{slot.label}</div>
                      <div style={{fontSize:11,color:slot.color,opacity:.8}}>{(()=>{
                        const defT={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"}[slot.key];
                        const isChg=isRegular&&defT&&slot.time!==defT;
                        return isChg
                          ? <span><span style={{textDecoration:"line-through",color:"#b0a0a0"}}>{defT}</span> → <span style={{color:"#c97474",fontWeight:700}}>{slot.time}</span></span>
                          : slot.time;
                      })()}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <span style={{fontSize:12,color:slot.color,fontWeight:700}}>{recs.length}명</span>
                    {!slotCl&&<button onClick={()=>{setAddModal(slot.key);setAddForm({type:"member",memberId:"",onedayName:"",walkIn:false});}} style={{fontSize:11,background:slot.color,color:"#fff",border:"none",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontFamily:FONT,fontWeight:700,minHeight:26}}>+ 추가</button>}
                  </div>
                </div>
                <div style={{minHeight:44}}>
                  {recs.length===0&&<div style={{padding:12,textAlign:"center",fontSize:12,color:"#c8c0b0"}}>없음</div>}
                  {(() => {
                    const sorted = [...recs].sort((a,b)=>{
                      const aOneday=!a.memberId, bOneday=!b.memberId;
                      const aWait=a.status==="waiting", bWait=b.status==="waiting";
                      if(aOneday&&!bOneday) return 1;
                      if(!aOneday&&bOneday) return -1;
                      if(aWait&&!bWait) return 1;
                      if(!aWait&&bWait) return -1;
                      return a.id-b.id;
                    });
                    const waiters=recs.filter(r=>r.status==="waiting").sort((a,b)=>a.id-b.id);
                    return sorted.map(rec=>{
                    const isOneday=!rec.memberId;
                    const mem=isOneday?null:members.find(m=>m.id===rec.memberId);
                    const isWaiting=rec.status==="waiting";
                    const waitRank=isWaiting?waiters.findIndex(w=>w.id===rec.id)+1:0;
                    const waitEmoji=["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"][waitRank-1]||`${waitRank}`;
                    const remCount=mem?Math.max(0,mem.total-usedAsOf(mem.id,date,bookings,members)):null;
                    const isDragging=dragId===rec.id;
                    const showRemWarn=!isOneday&&!isWaiting&&remCount!==null&&remCount<=2;
                    const remColor=showRemWarn?(remCount<=1?"#a83030":"#9a5a10"):undefined;
                    const cardColor=mem?.cardColor||"";
                    const isAttended=rec.confirmedAttend===true;
                    const isAbsent=rec.confirmedAttend===false;
                    const rowBg=isAbsent?"#fff8f8":isWaiting?"#e8e8e8":cardColor?`${cardColor}22`:"#fff";
                    return(
                        <div key={rec.id} draggable={!slotCl&&!isWaiting} onDragStart={e=>!slotCl&&!isWaiting&&onDragStart(e,rec.id)} onDragEnd={onDragEnd}
                          style={{padding:"8px 12px",borderBottom:"0.5px solid #f8f4ef",display:"flex",alignItems:"center",gap:8,opacity:isDragging?0.4:isAbsent?0.5:1,background:rowBg,cursor:slotCl||isWaiting?"default":"grab",WebkitUserSelect:"none",userSelect:"none"}}>
                          
                          {/* 1. 왼쪽 여백 및 이모지 영역 (지워졌던 부분 복구!) */}
                          {!slotCl&&<span style={{fontSize:11,color:"#c8c0b0",flexShrink:0}}>⠿</span>}
                          
                          <span style={{fontSize:15,flexShrink:0}}>{isOneday?"👤":GE[mem?.gender]||"🧘🏿"}</span>
                          
                          {/* 2. 이름 영역 */}
                          <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:4,overflow:"hidden"}}>
                            <span onClick={()=>!isOneday&&mem&&setQuickDetailM(mem)}
                              style={{fontSize:13,fontWeight:500,color:isAbsent?"#c97474":isWaiting?"#666":isOneday?"#9a6020":"#1e2e1e",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:isOneday?"default":"pointer",textDecoration:isAbsent?"line-through":"underline",textDecorationColor:isOneday?"#e8a44a":"#c8c0b0",textUnderlineOffset:2,flexShrink:1,minWidth:0}}>
                              {isOneday?rec.onedayName:mem.name}
                            </span>
                            {showRemWarn&&!isAbsent&&<span style={{fontSize:10,color:remColor,fontWeight:700,flexShrink:0}}>잔여{remCount}</span>}
                          </div>
                          
                          {/* 3. 오른쪽 버튼 및 상태 표시 영역 */}
                          {isWaiting?(
                            <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setWaitPopup({rec, slotKey: slot.key, mem});
                                }} 
                                style={{fontSize:14,flexShrink:0, cursor:"pointer", padding:"2px 4px", borderRadius:4, background:"transparent"}}
                              >
                                {waitEmoji}
                              </span>
                            </div>
                          ):isOneday?(
                            <button onClick={()=>setAttendCheckModal(rec)} style={{fontSize:16,background:"none",border:"none",cursor:"pointer",padding:"0 2px",lineHeight:1,flexShrink:0}}>
                              {isAttended ? (rec.walkIn ? "☑️" : "✅") : isAbsent ? "❌" : "🕉"}
                            </button>
                          ):(
                            <button onClick={()=>setAttendCheckModal(rec)} style={{fontSize:16,background:"none",border:"none",cursor:"pointer",padding:"0 2px",lineHeight:1,opacity:isAbsent?0.7:1,flexShrink:0}}>
                              {isAttended ? (rec.walkIn ? "☑️" : "✅") : isAbsent ? "❌" : "🕉"}
                            </button>
                          )}
                        </div>
                      );
                  });})()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addModal&&(
        <div style={S.overlay} onClick={()=>setAddModal(null)}>
          <div style={{...S.modal,maxWidth:350}} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}><span style={{fontSize:22}}>{TIME_SLOTS.find(t=>t.key===addModal)?.icon}</span><div><div style={S.modalTitle}>{TIME_SLOTS.find(t=>t.key===addModal)?.label} 출석 추가</div><div style={{fontSize:12,color:"#9a8e80",marginTop:2}}>{fmtWithDow(date)}</div></div></div>
            <div style={{display:"flex",gap:0,marginBottom:14,background:"#e8e4dc",borderRadius:9,padding:3}}>
              {[["member","🧘🏻‍♀️ 회원"],["oneday","🙋 원데이"]].map(([v,l])=>(
                <button key={v} onClick={()=>setAddForm(f=>({...f,type:v}))} style={{flex:1,border:"none",borderRadius:7,padding:"8px 0",fontSize:13,fontWeight:addForm.type===v?700:400,background:addForm.type===v?"#fff":"transparent",color:addForm.type===v?"#1e2e1e":"#9a8e80",cursor:"pointer",fontFamily:FONT,boxShadow:addForm.type===v?"0 1px 4px rgba(60,50,40,.1)":"none"}}>{l}</button>
              ))}
            </div>
            {addForm.type==="member"&&(<>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {[[false,"🟦 예약"],[true,"🚶 워크인"]].map(([v,l])=>(
                  <button key={String(v)} onClick={()=>setAddForm(f=>({...f,walkIn:v}))} style={{flex:1,padding:"8px 0",borderRadius:9,border:"1.5px solid",cursor:"pointer",fontSize:12,fontFamily:FONT,borderColor:addForm.walkIn===v?"#5a7a5a":"#e0d8cc",background:addForm.walkIn===v?"#eef5ee":"#faf8f5",color:addForm.walkIn===v?"#2e5c3e":"#9a8e80",fontWeight:addForm.walkIn===v?700:400}}>{l}</button>
                ))}
              </div>
              <div style={S.fg}><label style={S.lbl}>회원 선택</label>
                <select style={{...S.inp}} value={addForm.memberId} onChange={e=>setAddForm(f=>({...f,memberId:e.target.value}))}>
                  <option value="">-- 회원을 선택하세요 --</option>
                  {avail(addModal).map(m=><option key={m.id} value={m.id}>{m.gender==="F"?"🧘🏻‍♀️":"🧘🏻‍♂️"} {m.name}{m.adminNickname?` (${m.adminNickname})`:""} (잔여 {m.total-m.used}회)</option>)}
                </select>
              </div>
            </>)}
            {addForm.type==="oneday"&&(
              <div style={S.fg}>
                <label style={S.lbl}>참여자 이름</label>
                <input style={S.inp} value={addForm.onedayName} onChange={e=>setAddForm(f=>({...f,onedayName:e.target.value}))} placeholder="원데이 참여자 이름" autoFocus/>
              </div>
            )}
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setAddModal(null)}>취소</button>
              <button style={{...S.saveBtn,opacity:(addForm.type==="member"?addForm.memberId:addForm.onedayName.trim())?1:0.5}}
                onClick={addRecord}
                disabled={!(addForm.type==="member"?addForm.memberId:addForm.onedayName.trim())}>
                출석 추가
              </button>
            </div>
          </div>
        </div>
      )}

      {convertModal&&(
        <div style={S.overlay} onClick={()=>setConvertModal(null)}>
          <div style={{...S.modal,maxWidth:300,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:28,marginBottom:8}}>🌱</div>
            <div style={{...S.modalTitle,marginBottom:8}}>회원 전환</div>
            <div style={{fontSize:13,color:"#7a6e60",marginBottom:18,lineHeight:1.7}}><b>{convertModal.onedayName}</b>님을 정식 회원으로 추가하려면<br/>회원 관리 탭 → <b>+ 회원 추가</b>를 눌러주세요 🙏</div>
            <button style={{...S.saveBtn,width:"100%"}} onClick={()=>setConvertModal(null)}>확인</button>
          </div>
        </div>
      )}

      {showClosureMgr&&(
        <div style={S.overlay} onClick={()=>setShowClosureMgr(false)}>
          <div style={{...S.modal,maxWidth:360}} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}><span style={{fontSize:20}}>🔕</span><div style={S.modalTitle}>휴강 설정</div></div>
            <div style={S.fg}><label style={S.lbl}>날짜</label><input style={S.inp} type="date" value={closureForm.date} onChange={e=>setClosureForm(f=>({...f,date:e.target.value}))}/></div>
            <div style={S.fg}><label style={S.lbl}>타임 (비우면 전체 휴강)</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                <button onClick={()=>setClosureForm(f=>({...f,timeSlot:""}))} style={{padding:"8px 0",borderRadius:8,border:"1.5px solid",cursor:"pointer",fontSize:12,fontFamily:FONT,borderColor:closureForm.timeSlot===""?"#8e3030":"#e0d8cc",background:closureForm.timeSlot===""?"#fdf3e3":"#faf8f5",color:closureForm.timeSlot===""?"#8e3030":"#9a8e80",fontWeight:closureForm.timeSlot===""?700:400}}>전체</button>
                {TIME_SLOTS.map(sl=>(
                  <button key={sl.key} onClick={()=>setClosureForm(f=>({...f,timeSlot:sl.key}))} style={{padding:"8px 0",borderRadius:8,border:"1.5px solid",cursor:"pointer",fontSize:12,fontFamily:FONT,borderColor:closureForm.timeSlot===sl.key?"#8e3030":"#e0d8cc",background:closureForm.timeSlot===sl.key?"#fdf3e3":"#faf8f5",color:closureForm.timeSlot===sl.key?"#8e3030":"#9a8e80",fontWeight:closureForm.timeSlot===sl.key?700:400}}>{sl.icon} {sl.label}</button>
                ))}
              </div>
            </div>
            <div style={S.fg}><label style={S.lbl}>사유</label><input style={S.inp} value={closureForm.reason} onChange={e=>setClosureForm(f=>({...f,reason:e.target.value}))} placeholder="예: 강사 사정, 시설 공사 등"/></div>
            {!closureForm.timeSlot&&(
              <div style={S.fg}>
                <label style={S.lbl}>휴강 유형</label>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:8}}>
                  {[
                    {type:"regular",     label:"정기휴강",         desc:"연장없음"},
                    {type:"regular_ext", label:"정기휴강",         desc:"추가연장"},
                    {type:"special",     label:"별도휴강",         desc:"공사·개인사유"},
                  ].map(({type,label,desc})=>{
                    const sel=closureForm.closureType===type;
                    const colors={regular:{sel:"#4a6a4a",bg:"#eef5ee",txt:"#2e5c3e",border:"#7aaa7a"},regular_ext:{sel:"#9a5a10",bg:"#fdf3e3",txt:"#7a4a08",border:"#e8a44a"},special:{sel:"#8e3030",bg:"#fff0f0",txt:"#6e2020",border:"#e8a0a0"}};
                    const c=colors[type];
                    return(
                      <button key={type} onClick={()=>setClosureForm(f=>({...f,closureType:type,extensionOverride:type==="regular"?0:f.extensionOverride||1}))}
                        style={{padding:"10px 4px",borderRadius:9,border:`1.5px solid ${sel?c.border:"#e0d8cc"}`,
                          background:sel?c.bg:"#faf8f5",color:sel?c.txt:"#9a8e80",
                          cursor:"pointer",fontFamily:FONT,
                          display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                        <span style={{fontSize:12,fontWeight:sel?700:400}}>{label}</span>
                        <span style={{fontSize:10,opacity:.75}}>{desc}</span>
                      </button>
                    );
                  })}
                </div>
                {closureForm.closureType==="regular"&&(
                  <div style={{fontSize:11,color:"#5a7a5a",padding:"6px 10px",background:"#eef5ee",borderRadius:6}}>
                    월 20일 수업 내 포함 — 연장 없음
                  </div>
                )}
                {closureForm.closureType==="regular_ext"&&(
                  <div style={{fontSize:11,color:"#9a5a10",padding:"6px 10px",background:"#fdf3e3",borderRadius:6}}>
                    연속 정기휴강 추가 연장 — 기간 내 전체 회원 +1일 연장 + 공지 자동생성
                  </div>
                )}
                {closureForm.closureType==="special"&&(
                  <div style={{fontSize:11,color:"#8e3030",padding:"6px 10px",background:"#fff0f0",borderRadius:6}}>
                    별도 사유 휴강 — 기간 내 전체 회원 +1일 연장 + 공지 자동생성
                  </div>
                )}
              </div>
            )}
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setShowClosureMgr(false)}>취소</button>
              <button style={{...S.saveBtn,background:"#8e3030",opacity:closureForm.reason?1:0.5}} disabled={!closureForm.reason} onClick={()=>{
                const nid=Math.max(...closures.map(cl=>cl.id),0)+1;
                const extVal = closureForm.closureType==="regular" ? 0 : 1;
                const isExtra=!closureForm.timeSlot&&closureForm.closureType!=="regular";
                const newClosure={id:nid,date:closureForm.date,timeSlot:closureForm.timeSlot||null,reason:closureForm.reason,closureType:closureForm.closureType||"regular",extensionOverride:extVal};
                const newClosures=[...closures.filter(cl=>!(cl.date===closureForm.date&&cl.timeSlot===closureForm.timeSlot)),newClosure];
                setClosures(newClosures);
                // 연장있는 휴강이면 공지 자동 생성
                if(isExtra){
                  const extLabel = `${extVal}일`;
                  const typeLabel = closureForm.closureType==="special" ? "별도 휴강" : "정기휴강(추가연장)";
                  const noticeId=Math.max(...(notices||[]).map(n=>n.id),0)+1;
                  const autoNotice={
                    id:noticeId,
                    title:`📢 ${fmt(closureForm.date)} ${typeLabel} 안내`,
                    content:`${fmt(closureForm.date)} 수업이 휴강됩니다.\n사유: ${closureForm.reason}\n\n회원권 기간 내 전체 회원님의 회원권이 ${extLabel} 연장됩니다. 🙏`,
                    pinned:true,
                    createdAt:TODAY_STR
                  };
                  setNotices(p=>[autoNotice,...(p||[])]);
                }
                setShowClosureMgr(false);
              }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {quickDetailM&&(()=>{
        const qm=members.find(m=>m.id===quickDetailM.id)||quickDetailM;
        const qdl=calcDL(qm,closures);
        const qend=effEnd(qm,closures);
        const qexpired=qdl<0;
        const qrem = qexpired ? 0 : Math.max(0, Number(qm.total) - Number(qm.used));
        const qstatus=getStatus(qm,closures);
        const qsc=SC[qstatus];
        const qtc=TYPE_CFG[qm.memberType]||TYPE_CFG["1month"];
        const qpct=Math.min(100,Math.round(qm.used/Math.max(qm.total,1)*100));
        const qbarColor=qexpired?"#c97474":qstatus==="hold"?"#6a7fc8":"#5a9e6a";
        const qclosureExt=getClosureExtDays(qm,closures);
        return(
          <div style={{position:"fixed",inset:0,background:"rgba(40,35,25,.38)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px"}} onClick={()=>setQuickDetailM(null)}>
            <div style={{background:"#fff",borderRadius:16,padding:"18px 16px 14px",width:"100%",maxWidth:340,boxShadow:"0 8px 32px rgba(40,35,25,.22)"}} onClick={e=>e.stopPropagation()}>
              {/* 헤더 */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:24}}>{GE[qm.gender]}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:16,fontWeight:700,color:"#1e2e1e"}}>{qm.name}</span>
                    {qm.adminNickname&&<span style={{fontSize:10,background:"#2e3a2e",color:"#a8e6a8",borderRadius:5,padding:"1px 7px",fontWeight:700}}>{qm.adminNickname}</span>}
                    <span style={{fontSize:10,borderRadius:10,padding:"1px 7px",background:qtc.bg,color:qtc.color,fontWeight:700}}>{qtc.label}</span>
                    <span style={{fontSize:10,borderRadius:10,padding:"1px 7px",background:qsc.bg,color:qsc.color,fontWeight:700,display:"flex",alignItems:"center",gap:3}}><span style={{width:5,height:5,borderRadius:"50%",background:qsc.dot,display:"inline-block"}}/>{qsc.label}</span>
                  </div>
                  {qm.holding&&<div style={{fontSize:10,color:"#3d5494",marginTop:2}}>⏸️ 홀딩 중 ({fmt(qm.holding.startDate)}~)</div>}
                </div>
                <button onClick={()=>setQuickDetailM(null)} style={{background:"#f0ece4",border:"none",borderRadius:7,width:26,height:26,cursor:"pointer",fontSize:13,color:"#9a8e80",fontFamily:FONT}}>×</button>
              </div>
              {/* 잔여/바 */}
              {qstatus!=="off"&&(
                <div style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                    <span style={{fontSize:11,color:"#9a8e80"}}>등록 <b style={{color:"#3a4a3a"}}>{qm.total}회</b></span>
                    <span style={{fontSize:11,color:"#9a8e80"}}>사용 <b style={{color:"#3a4a3a"}}>{qm.used}</b></span>
                    <span style={{fontSize:13,fontWeight:700,color:qexpired?"#c97474":qrem===0?"#9a5a10":"#2e5c3e"}}>잔여 <span style={{fontSize:22}}>{qrem}</span>회</span>
                  </div>
                  <div style={{background:"#e8e4dc",borderRadius:8,height:16,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${qpct}%`,background:qbarColor,borderRadius:8}}/>
                  </div>
                </div>
              )}
              {/* 기간 */}
              <div style={{background:"#f7f4ef",borderRadius:9,padding:"8px 12px",fontSize:12,marginBottom:12}}>
                {qstatus==="off"?(
                  <span style={{color:"#b0a090"}}>종료 <span style={{fontWeight:600,color:"#c97474"}}>{fmt(qend)}</span></span>
                ):(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                      <span style={{color:"#7a6e60"}}>{fmt(qm.startDate)} → <span style={{fontWeight:600,color:qdl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(qend)}</span></span>
                      {qclosureExt>0&&<span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{qclosureExt}일</span>}
                      {(qm.extensionDays||0)>0&&<span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{qm.extensionDays}일</span>}
                    </div>
                    <span style={{fontWeight:700,fontSize:12,color:qdl<0?"#c97474":qdl<=7?"#9a5a10":"#4a6a4a",flexShrink:0}}>{qdl<0?`D+${Math.abs(qdl)}`:qdl===0?"D-Day":`D-${qdl}`}</span>
                  </div>
                )}
              </div>
              {/* 버튼 */}
              <button onClick={()=>setQuickDetailM(null)} style={{width:"100%",background:"#f0ece4",border:"none",borderRadius:9,padding:"9px 0",fontSize:13,color:"#7a6e60",cursor:"pointer",fontFamily:FONT,fontWeight:600}}>닫기</button>
            </div>
          </div>
        );
      })()}

      {waitPopup&&(
        <div style={S.overlay} onClick={()=>setWaitPopup(null)}>
          <div style={{...S.modal,maxWidth:320,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:28,marginBottom:8}}>⏳</div>
            <div style={{...S.modalTitle,marginBottom:6}}>대기자 처리</div>
            <div style={{fontSize:13,color:"#7a6e60",marginBottom:4}}>
              <b>{waitPopup.mem?.name||"알 수 없음"}</b>
            </div>
            <div style={{fontSize:12,color:"#9a8e80",marginBottom:20}}>
              {fmtWithDow(date)} {TIME_SLOTS.find(t=>t.key===waitPopup.slotKey)?.label} 수업
            </div>
            <div style={{display:"flex",gap:8}}>
              <button style={{flex:1,background:"#f0ece4",color:"#c97474",border:"1px solid #e8c0c0",borderRadius:9,padding:"11px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}
                onClick={()=>{
                  const slotLabel=TIME_SLOTS.find(t=>t.key===waitPopup.slotKey)?.label||"";
                  const nid=Date.now()+1;
                  setBookings(p=>p.map(b=>b.id===waitPopup.rec.id?{...b,status:"cancelled",cancelledBy:"admin"}:b));
                  if(waitPopup.mem) setNotices(prev=>[{id:nid,title:"📢 대기 취소 안내",content:`${fmt(date)} ${slotLabel} 수업 대기가 취소되었습니다.`,pinned:false,createdAt:TODAY_STR,targetMemberId:waitPopup.mem.id},...(prev||[])]);
                  setWaitPopup(null);
                }}>거절</button>
              <button style={{flex:1,background:"#4a6a4a",color:"#fff",border:"none",borderRadius:9,padding:"11px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}
                onClick={()=>{
                  const slotLabel=TIME_SLOTS.find(t=>t.key===waitPopup.slotKey)?.label||"";
                  const nid=Date.now();
                  setBookings(p=>p.map(b=>b.id===waitPopup.rec.id?{...b,status:"reserved"}:b));
                  if(waitPopup.mem) setNotices(prev=>[{id:nid,title:"📢 예약 확정 안내",content:`${fmt(date)} ${slotLabel} 수업 대기가 예약으로 확정되었습니다!`,pinned:false,createdAt:TODAY_STR,targetMemberId:waitPopup.mem.id},...(prev||[])]);
                  setWaitPopup(null);
                }}>수락</button>
            </div>
            <button style={{...S.cancelBtn,width:"100%",marginTop:10}} onClick={()=>setWaitPopup(null)}>닫기</button>
          </div>
        </div>
      )}

      {attendCheckModal&&<AttendCheckModal rec={attendCheckModal} members={members} isOpen={isOpen} bookings={bookings} setBookings={setBookings} setMembers={setMembers} notices={notices} setNotices={setNotices} onClose={()=>setAttendCheckModal(null)}/>}
      {cancelModal&&<AdminCancelModal booking={cancelModal} member={members.find(m=>m.id===cancelModal.memberId)} onClose={()=>setCancelModal(null)} onConfirm={note=>adminCancel(cancelModal.id,note)}/>}

      {showSpecialMgr&&(
        <div style={S.overlay} onClick={()=>closeSpecialMgr()}>
          <div style={{...S.modal,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={{...S.modalHead}}><span style={{fontSize:20}}>🗓️</span><div style={S.modalTitle}>수업 설정</div></div>
            {/* 수업 타입 선택 */}
            <div style={S.fg}>
              <label style={S.lbl}>수업 유형</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                {[
                  {v:"regular", label:"정규",    icon:"📅"},
                  {v:"special", label:"집중",    icon:"⚡"},
                  {v:"open",    label:"오픈클래스",icon:"🍀"},
                ].map(t=>{
                  const hasClosure=closures.some(cl=>cl.date===newSp.date&&!cl.timeSlot);
                  // 휴강 있거나, 다른 유형 등록됐으면 잠금
                  const locked=hasClosure||(originalType!==null&&originalType!==t.v);
                  const selected=newSp.type===t.v;
                  return(
                    <div key={t.v} onClick={()=>{
                      if(locked) return;
                      const regularTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};
                      // 삭제 후(originalType=null) 또는 집중/오픈: 빈 슬롯으로 시작
                      // 정규이고 originalType="regular"인 경우만 요일 슬롯 자동 세팅
                      const dowSlots=SCHEDULE[new Date(newSp.date+"T00:00:00").getDay()]||[];
                      const newSlots=(t.v==="regular"&&originalType==="regular")?(dowSlots.length?dowSlots:[]):[];
                      setNewSp(f=>({...f,type:t.v,activeSlots:newSlots,customTimes:regularTimes}));
                    }}
                      style={{border:`2px solid ${selected?"#4a6a4a":locked?"#ede8e0":"#e0d8cc"}`,borderRadius:10,padding:"7px 4px",textAlign:"center",cursor:locked?"not-allowed":"pointer",background:selected?"#eef5ee":locked?"#f5f2ee":"#faf8f5",opacity:locked?0.45:1}}>
                      <div style={{fontSize:16}}>{t.icon}</div>
                      <div style={{fontSize:11,fontWeight:700,color:selected?"#2e5c3e":"#6a6050"}}>{t.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={S.fg}>
              <label style={S.lbl}>날짜</label>
              {(()=>{
                function changeSpDate(val){
                  const dowSlots=SCHEDULE[new Date(val+"T00:00:00").getDay()]||[];
                  const regularTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};
                  const existingOnDate=specialSchedules.find(s=>s.date===val);
                  if(existingOnDate){
                    setNewSp(f=>({...f,date:val,type:existingOnDate.type,activeSlots:existingOnDate.activeSlots||[],customTimes:{...regularTimes,...(existingOnDate.customTimes||{})},label:existingOnDate.label||"",feeNote:existingOnDate.feeNote||""}));
                    setOriginalType(existingOnDate.type);
                  } else if(dowSlots.length){
                    setNewSp(f=>({...f,date:val,type:"regular",activeSlots:dowSlots,customTimes:regularTimes,label:"",feeNote:""}));
                    setOriginalType("regular");
                  } else {
                    setNewSp(f=>({...f,date:val,type:"special",activeSlots:[],customTimes:regularTimes,label:"",feeNote:""}));
                    setOriginalType(null);
                  }
                }
                const spDow=newSp.date?DOW_KO[new Date(newSp.date+"T00:00:00").getDay()]:"";
                const isToday=newSp.date===TODAY_STR;
                return(
                  <div style={{display:"flex",alignItems:"center",gap:0,background:"#fafaf7",border:"1.5px solid #ddd",borderRadius:9,overflow:"hidden"}}>
                    <button type="button" onClick={()=>changeSpDate(addDays(newSp.date,-1))} style={{background:"none",border:"none",borderRight:"1px solid #e8e4dc",padding:"10px 13px",fontSize:15,color:"#7a6e60",cursor:"pointer",fontFamily:FONT,flexShrink:0}}>‹</button>
                    <label style={{flex:1,position:"relative",cursor:"pointer"}}>
                      <input type="date" value={newSp.date} onChange={e=>changeSpDate(e.target.value)} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%"}}/>
                      <div style={{padding:"10px 0",textAlign:"center",fontSize:14,fontWeight:700,color:"#1e2e1e",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                        <span>{newSp.date?`${newSp.date.replace(/-/g,".")} (${spDow})`:""}</span>
                        {isToday&&<span style={{fontSize:10,background:"#4a6a4a",color:"#fff",borderRadius:5,padding:"2px 6px",fontWeight:700}}>오늘</span>}
                      </div>
                    </label>
                    <button type="button" onClick={()=>changeSpDate(addDays(newSp.date,1))} style={{background:"none",border:"none",borderLeft:"1px solid #e8e4dc",padding:"10px 13px",fontSize:15,color:"#7a6e60",cursor:"pointer",fontFamily:FONT,flexShrink:0}}>›</button>
                  </div>
                );
              })()}
            </div>
            <div style={S.fg}><label style={S.lbl}>메모 <span style={{fontWeight:400,color:"#9a8e80"}}>(선택)</span></label><input style={S.inp} value={newSp.label} onChange={e=>setNewSp(f=>({...f,label:e.target.value}))} placeholder={newSp.type==="open"?"예: 연말 무료수업":newSp.type==="regular"?"예: 관리자 메모":"예: 어린이날 집중수업"}/></div>
            {/* 공지 토글 - 정규/집중/오픈 공통 */}
            <div style={S.fg}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none",marginBottom:8}} onClick={()=>setNewSp(f=>({...f,dailyNote:f.dailyNote!==undefined&&f.dailyNote!==null?undefined:""}))}>
                <div style={{width:36,height:20,borderRadius:10,background:newSp.dailyNote!==undefined&&newSp.dailyNote!==null?"#c97474":"#ddd",position:"relative",transition:"background .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:2,left:(newSp.dailyNote!==undefined&&newSp.dailyNote!==null)?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </div>
                <span style={{fontSize:12,color:"#4a4a4a"}}>🔔 이 날 공지 띄우기</span>
              </label>
              {newSp.dailyNote!==undefined&&newSp.dailyNote!==null&&(
                <textarea style={{...S.inp,height:70,resize:"vertical",fontSize:12}} value={newSp.dailyNote} onChange={e=>setNewSp(f=>({...f,dailyNote:e.target.value}))} placeholder="예: 오전 수업 08:30 → 08:20 변경 / 방송 촬영 있어요 📹 / 매트 지참 부탁드려요"/>
              )}
            </div>
            {/* 운영 수업 - 휴강 있으면 숨김 */}
            {!closures.some(cl=>cl.date===newSp.date&&!cl.timeSlot)&&(
              <div style={S.fg}>
                <label style={S.lbl}>운영 수업</label>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {TIME_SLOTS.map(sl=>{
                    const on=newSp.activeSlots.includes(sl.key);
                    const defTime={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"}[sl.key]||sl.time;
                    const curTime=newSp.customTimes[sl.key]||defTime;
                    const isChanged=on&&newSp.type==="regular"&&defTime&&curTime!==defTime;
                    return(
                      <div key={sl.key} style={{border:`1.5px solid ${on?sl.color:"#e0d8cc"}`,borderRadius:10,padding:"8px 12px",background:on?sl.bg:"#faf8f5",cursor:"pointer",display:"flex",alignItems:"center",gap:8}} onClick={()=>toggleSp(sl.key)}>
                        <span style={{fontSize:15,flexShrink:0}}>{sl.icon}</span>
                        <div style={{fontWeight:700,color:sl.color,fontSize:13,width:28,flexShrink:0}}>{sl.label}</div>
                        {on
                          ? <div style={{flex:1,display:"flex",alignItems:"center",gap:6}}>
                              {isChanged&&<span style={{fontSize:11,textDecoration:"line-through",color:"#b0a0a0"}}>{defTime}</span>}
                              <input key={sl.key+"_"+curTime} type="text" style={{...S.inp,padding:"4px 8px",fontSize:12,flex:1,margin:0,color:isChanged?"#c97474":"inherit",fontWeight:isChanged?700:400}} defaultValue={curTime} onBlur={e=>{e.stopPropagation();const v=e.target.value;setNewSp(f=>({...f,customTimes:{...f.customTimes,[sl.key]:v}}));}} onClick={e=>e.stopPropagation()} onFocus={e=>{e.stopPropagation();e.target.select();}} placeholder="HH:MM"/>
                            </div>
                          : <span style={{fontSize:11,color:"#b0a090",flex:1}}>{defTime||"직접 입력"}</span>
                        }
                        <span style={{fontSize:12,color:on?sl.color:"#c0b8b0",flexShrink:0}}>{on?"✓":"—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* 휴강 설정 - 휴강 있을 때만: 삭제만 표시 / 없을 때: 추가 버튼 */}
            <div style={S.fg}>
              {closures.some(cl=>cl.date===newSp.date&&!cl.timeSlot)?(
                <>
                  <label style={S.lbl}>휴강 설정</label>
                  <div style={{background:"#fff0f0",border:"1px solid #e8a0a0",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#8e3030",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>🔕 {closures.filter(cl=>cl.date===newSp.date).map(cl=>cl.timeSlot?`${({dawn:"새벽",morning:"오전",lunch:"점심",afternoon:"오후",evening:"저녁"}[cl.timeSlot])} 휴강`:"전체 휴강").join(" · ")}</span>
                    <button onClick={e=>{
                      e.stopPropagation();
                      const nc=closures.filter(cl=>cl.date!==newSp.date);
                      setClosures(nc);
                      setMembers(prev=>prev.map(m=>m.memberType==="3month"?{...m,endDate:calc3MonthEnd(m.startDate,nc)}:m));
                      // 휴강 삭제 후 → 선택 없는 상태로 초기화 (직접 선택하게)
                      const regularTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};
                      setNewSp(f=>({...f,type:"regular",activeSlots:[],customTimes:regularTimes,label:"",feeNote:""}));
                      setOriginalType(null);
                    }} style={{background:"none",border:"none",color:"#c97474",cursor:"pointer",fontSize:12,fontFamily:FONT,fontWeight:700}}>삭제</button>
                  </div>
                </>
              ):(
                <>
                  <label style={S.lbl}>휴강 설정 <span style={{fontWeight:400,color:"#9a8e80"}}>(선택)</span></label>
                  <button onClick={e=>{e.stopPropagation();closeSpecialMgr();setClosureForm({date:newSp.date,timeSlot:"",reason:"",closureType:"regular",extensionOverride:0});setShowClosureMgr(true);}} style={{width:"100%",background:"#fff0f0",border:"1px solid #e8a0a0",borderRadius:10,padding:"12px 0",fontSize:13,fontWeight:600,color:"#8e3030",cursor:"pointer",fontFamily:FONT,textAlign:"center"}}>
                    🔕 휴강 추가
                  </button>
                </>
              )}
            </div>
            {/* 수업 삭제 버튼 - 휴강 없을 때만, originalType 있을 때만 */}
            {originalType!==null&&!closures.some(cl=>cl.date===newSp.date&&!cl.timeSlot)&&(()=>{
              const typeLabel=originalType==="open"?"오픈클래스":originalType==="regular"?"정규수업":"집중수업";
              return(
                <button onClick={()=>{
                  const spOnDate=specialSchedules.find(s=>s.date===newSp.date);
                  if(spOnDate) setSpecialSchedules(p=>p.filter(s=>s.date!==newSp.date));
                  setOriginalType(null);
                  // 삭제 후 → 슬롯 전부 비활성, 유형 선택 없는 상태
                  const regularTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};
                  setNewSp(f=>({...f,type:"regular",activeSlots:[],customTimes:regularTimes,label:"",feeNote:""}));
                }} style={{background:"#f5eeee",color:"#c97474",border:"none",borderRadius:8,padding:"8px 14px",fontSize:12,cursor:"pointer",fontFamily:FONT,fontWeight:700,marginBottom:12,width:"100%"}}>
                  🗑️ 이 날 {typeLabel} 삭제
                </button>
              );
            })()}
            <div style={S.modalBtns}><button style={S.cancelBtn} onClick={()=>closeSpecialMgr()}>취소</button><button style={{...S.saveBtn,opacity:(newSp.type==="regular"||newSp.label)?1:0.5}} onClick={addSpecial} disabled={newSp.type!=="regular"&&!newSp.label}>저장</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function HoldingModal({member,onClose,onSave}){
  const hasH=!!member.holding;
  const [start,setStart]=useState(hasH?member.holding.startDate:TODAY_STR);
  const [resumeDate,setResumeDate]=useState(TODAY_STR);

  const elapsed=start?Math.max(0,Math.ceil((TODAY-parseLocal(start))/86400000)):0;
  const resumeDays=resumeDate&&start?Math.max(0,Math.ceil((parseLocal(resumeDate)-parseLocal(start))/86400000)):elapsed;
  const newEnd=addDays(member.endDate,(member.extensionDays||0)+resumeDays);

  function handleResume(){
    onSave({startDate:start,endDate:resumeDate||TODAY_STR,workdays:resumeDays,resumed:true});
  }
  function handleStart(){
    onSave({startDate:start,endDate:null,workdays:0,resumed:false});
  }
  function handleCancel(){ onSave(null); }

  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>⏸️</span><div><div style={S.modalTitle}>홀딩 관리</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>

        {/* 홀딩 중 */}
        {hasH&&<>
          <div style={{background:"#edf0f8",borderRadius:12,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,color:"#3d5494",marginBottom:10}}>⏸️ 홀딩 진행 중</div>
            <div style={{display:"flex",gap:12,marginBottom:10}}>
              <div style={{flex:1}}>
                <label style={S.lbl}>시작일</label>
                <input style={S.inp} type="date" value={start} onChange={e=>setStart(e.target.value)} max={TODAY_STR}/>
              </div>
              <div style={{flex:1}}>
                <label style={S.lbl}>복귀일</label>
                <input style={S.inp} type="date" value={resumeDate} onChange={e=>setResumeDate(e.target.value)} min={start} max={TODAY_STR}/>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#4a4a6a",marginBottom:6}}>
              <span>경과</span><span style={{fontWeight:700,color:"#3d5494"}}>{elapsed}일</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#7a6e60",background:"#f0f4f0",borderRadius:8,padding:"8px 12px"}}>
              <span>연장 후 종료일</span><span style={{fontWeight:700,color:"#2e5c3e"}}>{fmt(newEnd)} (+{resumeDays}일)</span>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleResume} style={{flex:2,background:"#4a7a5a",color:"#fff",border:"none",borderRadius:9,padding:"12px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>✅ 복귀 처리</button>
            <button onClick={handleCancel} style={{flex:1,background:"#fdf0f0",color:"#c97474",border:"1px solid #f0d0d0",borderRadius:9,padding:"12px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT}}>🗑️ 홀딩 취소</button>
          </div>
        </>}

        {/* 홀딩 시작 */}
        {!hasH&&<>
          <div style={{marginBottom:12}}>
            <label style={S.lbl}>홀딩 시작일</label>
            <input style={S.inp} type="date" value={start} onChange={e=>setStart(e.target.value)} max={TODAY_STR}/>
          </div>
          {start&&<div style={{background:"#f5f3ef",borderRadius:10,padding:"12px",marginBottom:14,fontSize:12,color:"#9a8e80"}}>
            오늘까지 {elapsed}일 경과 · 복귀 처리 시 기간만큼 종료일이 자동 연장됩니다
          </div>}
          <div style={S.modalBtns}>
            <button style={S.cancelBtn} onClick={onClose}>닫기</button>
            <button style={S.saveBtn} onClick={handleStart} disabled={!start}>홀딩 시작</button>
          </div>
        </>}
      </div>
    </div>
  );
}

function RenewalModal({member,onClose,onSave}){
  const closures=useClosures();
  const [form,setForm]=useState({startDate:TODAY_STR,endDate:"",total:member.memberType==="3month"?24:10,memberType:member.memberType,payment:""});
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>🔄</span><div><div style={S.modalTitle}>회원권 갱신</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>
        <div style={S.fg}><label style={S.lbl}>갱신 타입</label>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            {[["1month","1개월"],["3month","3개월"]].map(([v,l])=>(<button key={v} onClick={()=>{const autoEnd=v==="3month"?calc3MonthEnd(form.startDate,closures):endOfMonth(form.startDate);setForm(f=>({...f,memberType:v,total:v==="3month"?24:10,endDate:autoEnd}));}} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:14,fontFamily:FONT,borderColor:form.memberType===v?"#4a7a5a":"#e0d8cc",background:form.memberType===v?"#eef5ee":"#faf8f5",color:form.memberType===v?"#2e5c3e":"#9a8e80",fontWeight:form.memberType===v?700:400}}>{l}</button>))}
          </div>
          <div style={{display:"flex",gap:8}}>
            {[["카드","#edf0f8","#3d5494"],["현금","#fdf3e3","#8a5510"],["네이버","#e8f4e8","#2e6e44"]].map(([v,bg,color])=>(<button key={v} onClick={()=>setForm(f=>({...f,payment:f.payment===v?"":v}))} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:13,fontFamily:FONT,borderColor:form.payment===v?color:"#e0d8cc",background:form.payment===v?bg:"#faf8f5",color:form.payment===v?color:"#9a8e80",fontWeight:form.payment===v?700:400}}>{v}</button>))}
          </div>
        </div>
        <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>시작일</label><input style={S.inp} type="date" value={form.startDate} onChange={e=>{const s=e.target.value;const autoEnd=form.memberType==="3month"?calc3MonthEnd(s,closures):endOfMonth(s);setForm(f=>({...f,startDate:s,endDate:autoEnd}));}}/></div><div style={{...S.fg,flex:1}}><label style={S.lbl}>종료일</label><input style={S.inp} type="date" value={form.endDate} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/></div></div>
        <div style={S.fg}><label style={S.lbl}>총 회차</label><input style={S.inp} type="number" min="1" value={form.total} onChange={e=>setForm(f=>({...f,total:+e.target.value}))}/></div>
        <div style={S.modalBtns}><button style={S.cancelBtn} onClick={onClose}>취소</button><button style={{...S.saveBtn,opacity:form.endDate?1:0.5}} disabled={!form.endDate} onClick={()=>onSave(form)}>갱신</button></div>
      </div>
    </div>
  );
}

function ExtensionModal({member,onClose,onSave}){
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

function periodRecs(member,bookings,r){
  return bookings.filter(function(b){
    return b.memberId===member.id&&b.status==="attended"&&b.date>=r.startDate&&b.date<=r.endDate;
  }).sort(function(x,y){return y.date.localeCompare(x.date);});
}
function currentRecs(member,bookings){
  return bookings.filter(function(b){
    return b.memberId===member.id&&b.status==="attended"&&b.date>=member.startDate;
  }).sort(function(x,y){return y.date.localeCompare(x.date);});
}

function AdminDetailModal({member,bookings,onClose,onRenew,onHolding,onExt,onAdjust}){
  const closures=useClosures();
  const [expandedRH,setExpandedRH]=useState(null);
  const [adjMode,setAdjMode]=useState(false);
  const [adjTotal,setAdjTotal]=useState(member.total);
  const [adjUsed,setAdjUsed]=useState(member.used);
  const status=getStatus(member,closures),sc=SC[status];
  const end=effEnd(member,closures),dl=calcDL(member,closures);
  const expired=dl<0;
  // 종료일 지나면 잔여 0 (#3)
  const dispRem=expired?0:Math.max(0,member.total-member.used);
  const tc=TYPE_CFG[member.memberType]||TYPE_CFG["1month"];
  const curRecs=currentRecs(member,bookings);
  // #5: OFF 상태(종료)면 현재 period 없음 — 모두 과거형
  const isActiveStatus=status==="on"||status==="hold";
  const reversedHistory=[...(member.renewalHistory||[])].reverse();

  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:440,maxHeight:"92vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"18px 18px 0",overflowY:"auto",flex:1}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12}}>
            <span style={{fontSize:28}}>{GE[member.gender]}</span>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontSize:18,fontWeight:700}}>{member.name}</span>
                {member.isNew&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
                <span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:tc.bg,color:tc.color,fontWeight:700}}>{tc.label}</span>
                <span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:sc.bg,color:sc.color,fontWeight:700}}>{sc.label}</span>
              </div>
              {member.adminNickname&&<div style={{marginTop:4,display:"inline-flex",alignItems:"center",gap:4,background:"#2e3a2e",borderRadius:7,padding:"2px 9px"}}><span style={{fontSize:10,color:"#7aba7a"}}>👀</span><span style={{fontSize:11,fontWeight:700,color:"#a8e6a8"}}>{member.adminNickname}</span></div>}
              {member.adminNote&&<div style={{marginTop:5,background:"#fffaeb",borderRadius:7,padding:"5px 9px",fontSize:11,color:"#7a5a10",border:"1px dashed #e8c44a"}}>📝 {member.adminNote}</div>}
            </div>
            <button onClick={onClose} style={{background:"#f0ece4",border:"none",borderRadius:7,width:28,height:28,cursor:"pointer",fontSize:14,color:"#9a8e80",fontFamily:FONT,flexShrink:0}}>×</button>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:12}}>
            {[
              {l:"이번기수출석",v:curRecs.length+"/"+member.total,c:"#3d5494"},
              {l:"잔여 회차",v:dispRem+"회",c:expired?"#c97474":dispRem===0?"#9a5a10":"#2e6e44"},
              {l:"D-day",v:dl<0?Math.abs(dl)+"일초과":dl===0?"오늘":"D-"+dl,c:dl<0?"#c97474":dl<=7?"#9a5a10":"#4a4a4a"}
            ].map(function(item){return(
              <div key={item.l} style={{background:"#f7f4ef",borderRadius:9,padding:"9px",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#9a8e80",marginBottom:3}}>{item.l}</div>
                <div style={{fontSize:13,fontWeight:700,color:item.c}}>{item.v}</div>
              </div>
            );})}
          </div>

          {/* 잔여 횟수 직접 수정 */}
          {!adjMode&&(
            <div style={{marginBottom:10,textAlign:"right"}}>
              <button onClick={()=>{setAdjTotal(member.total);setAdjUsed(member.used);setAdjMode(true);}} style={{fontSize:11,background:"#fdf3e3",color:"#9a5a10",border:"1px solid #e8c44a",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontFamily:FONT,fontWeight:600}}>✏️ 잔여 횟수 수정</button>
            </div>
          )}
          {adjMode&&(
            <div style={{background:"#fffaeb",border:"1px solid #e8c44a",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#7a5a10",marginBottom:10}}>✏️ 잔여 횟수 직접 수정</div>
              <div style={{display:"flex",gap:14,marginBottom:10,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>등록 횟수 (total)</div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button onClick={()=>setAdjTotal(t=>Math.max(0,t-1))} style={{...S.stepper}}>−</button>
                    <span style={{fontSize:16,fontWeight:700,minWidth:28,textAlign:"center"}}>{adjTotal}</span>
                    <button onClick={()=>setAdjTotal(t=>t+1)} style={{...S.stepper}}>+</button>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>사용 횟수 (used)</div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button onClick={()=>setAdjUsed(u=>Math.max(0,u-1))} style={{...S.stepper}}>−</button>
                    <span style={{fontSize:16,fontWeight:700,minWidth:28,textAlign:"center"}}>{adjUsed}</span>
                    <button onClick={()=>setAdjUsed(u=>u+1)} style={{...S.stepper}}>+</button>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                  <div style={{fontSize:13,color:"#2e6e44",fontWeight:700}}>→ 잔여 {Math.max(0,adjTotal-adjUsed)}회</div>
                </div>
              </div>
              <div style={{display:"flex",gap:7}}>
                <button onClick={()=>setAdjMode(false)} style={S.cancelBtn}>취소</button>
                <button onClick={()=>{onAdjust&&onAdjust(adjTotal,adjUsed);setAdjMode(false);}} style={{...S.saveBtn,background:"#e8a44a",fontSize:12}}>저장</button>
              </div>
            </div>
          )}

          <div style={{background:"#f7f4ef",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12}}>
            {[["최초등록",fmt(member.firstDate||member.startDate),"#7a6e60"],["현재시작",fmt(member.startDate),"#7a6e60"],["종료일",fmt(end),dl<0?"#c97474":dl<=7?"#9a5a10":"#3a4a3a"]].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#9a8e80"}}>{l}</span><span style={{color:c,fontWeight:700}}>{v}</span></div>
            ))}
          </div>

          {member.holding&&<div style={{background:"#edf0f8",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12}}><div style={{fontWeight:700,color:"#3d5494",marginBottom:3}}>⏸️ 홀딩 중</div><div style={{color:"#5a5a7a"}}>{fmt(member.holding.startDate)} ~ 복귀 미정 ({holdingElapsed(member.holding)}일 경과)</div></div>}

          <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
            <button onClick={onRenew} style={{...S.saveBtn,fontSize:12,padding:"7px 12px"}}>🔄 갱신</button>
            {member.memberType==="3month"&&<button onClick={onHolding} style={{background:"#edf0f8",color:"#3d5494",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>{member.holding?"⏸️ 홀딩 관리":"⏸️ 홀딩"}</button>}
          </div>

          {reversedHistory.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:"#3d4a3d",marginBottom:7}}>갱신 이력 <span style={{color:"#9a8e80",fontWeight:400}}>({reversedHistory.length}회)</span></div>
              <div style={{maxHeight:280,overflowY:"auto"}}>
                {reversedHistory.map((r,i)=>{
                  const precs=periodRecs(member,bookings,r);
                  // #5: OFF(종료)면 현재 period 없음 — 모두 과거형으로 표시
                  const isCurrent=isActiveStatus&&i===0;
                  const isOpen=expandedRH===r.id;
                  // 현재 period: 휴강연장 + 홀딩연장 반영한 실제 종료일
                  const closureExt=isCurrent?getClosureExtDays(member,closures):0;
                  const holdExt=(isCurrent&&member.extensionDays)||0;
                  const displayEndDate=(closureExt>0||holdExt>0)?addDays(r.endDate,closureExt+holdExt):r.endDate;
                  return(
                    <div key={r.id} style={{marginBottom:5,borderRadius:9,overflow:"hidden",border:`1px solid ${isCurrent?"#b8d8b8":"#e4e0d8"}`}}>
                      <div onClick={()=>setExpandedRH(isOpen?null:r.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 11px",background:isCurrent?"#f0f8f0":"#fafaf7",cursor:"pointer",userSelect:"none"}}>
                        <span style={{fontSize:14,flexShrink:0}}>{isCurrent?"🟢":"⚪"}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                            <span style={{fontSize:12,fontWeight:700,color:"#2e3e2e"}}>{fmt(r.startDate)} ~ {fmt(displayEndDate)}</span>
                            {closureExt>0&&<span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{closureExt}일</span>}
                            {holdExt>0&&<span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{holdExt}일</span>}
                          </div>
                          <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                            <span style={{fontSize:10,background:(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).bg,color:(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).color,borderRadius:4,padding:"1px 6px",fontWeight:700}}>{(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).label}</span>
                            {r.total>0&&<span style={{fontSize:10,color:"#9a8e80"}}>등록 {r.total}회</span>}
                            <span style={{fontSize:10,color:precs.length>0?"#2e6e44":"#b0a090",fontWeight:700}}>출석 {precs.length}회</span>
                            {r.payment&&<span style={{fontSize:10,background:r.payment.replace("3개월,","").includes("네이버")?"#e8f4e8":r.payment.replace("3개월,","").includes("현금")?"#fdf3e3":"#edf0f8",color:r.payment.replace("3개월,","").includes("네이버")?"#2e6e44":r.payment.replace("3개월,","").includes("현금")?"#8a5510":"#3d5494",borderRadius:4,padding:"1px 6px",fontWeight:600}}>{r.payment.replace("3개월,","")}</span>}
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                          {isCurrent&&<span style={{fontSize:10,background:"#e0f2e9",color:"#1e6040",borderRadius:5,padding:"1px 6px",fontWeight:700}}>현재</span>}
                          <span style={{fontSize:12,color:"#9a8e80"}}>{isOpen?"▴":"▾"}</span>
                        </div>
                      </div>
                      {isOpen&&(
                        <div style={{background:"#fff",borderTop:"1px solid #f0ece4",padding:"8px 11px"}}>
                          {precs.length===0?(
                            <div style={{fontSize:11,color:"#c8c0b0",textAlign:"center",padding:"8px 0"}}>이 기간 출석 기록 없음</div>
                          ):(
                            precs.map((rec,ri)=>{
                              const sl=TIME_SLOTS.find(t=>t.key===rec.timeSlot);
                              return(
                                <div key={rec.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:ri<precs.length-1?"1px solid #f8f4ef":"none"}}>
                                  <span style={{fontSize:13,width:18,textAlign:"center",flexShrink:0}}>{sl?.icon||"📍"}</span>
                                  <span style={{fontSize:11,color:"#3a4a3a",flex:1}}>{fmtWithDow(rec.date)}</span>
                                  <span style={{fontSize:10,color:sl?.color,background:sl?.bg,borderRadius:4,padding:"1px 6px",fontWeight:600}}>{sl?.label}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{padding:"10px 18px",borderTop:"1px solid #f0ece4"}}><button style={{...S.cancelBtn,width:"100%",textAlign:"center"}} onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}

function MemberCard({m,onEdit,onDel,onDetail}){
  const closures=useClosures();
  const dl=calcDL(m,closures);
  const expired=dl<0;
  const rem=expired?0:Math.max(0,m.total-m.used);
  const pct=expired?100:Math.round(m.used/m.total*100);
  const status=getStatus(m,closures),sc=SC[status];
  const end=effEnd(m,closures);
  const closureExt=getClosureExtDays(m,closures);
  const tc=TYPE_CFG[m.memberType]||TYPE_CFG["1month"];
  const barColor=expired?"#c97474":status==="hold"?"#6a7fc8":"#5a9e6a";
  // OFF이고 종료일 30일 초과: 매우 축약된 카드
  const isOff=status==="off";
  const isLongOff=isOff&&Math.abs(dl)>30;

  return(
    <div style={{...S.card,opacity:isOff?0.82:1}}>
      <div style={{...S.cardTop}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flex:1,minWidth:0}}>
          <span style={{fontSize:20,lineHeight:1,flexShrink:0}}>{GE[m.gender]}</span>
          <span style={S.memberName}>{m.name}</span>
          {m.adminNickname&&<div style={{display:"inline-flex",alignItems:"center",gap:3,background:"#2e3a2e",borderRadius:6,padding:"2px 7px",flexShrink:0}}><span style={{fontSize:10,color:"#7aba7a"}}>👀</span><span style={{fontSize:11,fontWeight:700,color:"#a8e6a8"}}>{m.adminNickname}</span></div>}
          {m.isNew&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
          {!isLongOff&&<span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:tc.bg,color:tc.color,fontWeight:700}}>{tc.label}</span>}
          {m.holding&&<span style={{fontSize:13,lineHeight:1,flexShrink:0}}>⏸️</span>}
        </div>
        <span style={{...S.statusBadge,background:sc.bg,color:sc.color,flexShrink:0}}><span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,display:"inline-block",marginRight:4}}/>{sc.label}</span>
      </div>
      {m.adminNote&&<div style={{fontSize:11,color:"#9a5a10",background:"#fffaeb",borderRadius:6,padding:"3px 8px",marginBottom:7,border:"1px dashed #e8c44a"}}>📝 {m.adminNote}</div>}

      {/* OFF: 종료일 한 줄 표시 (30일 초과 여부 무관, 동일 레이아웃) */}
      {isOff?(
        <div style={{fontSize:11,color:"#b0a090",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          <span>종료</span>
          <span style={{fontWeight:600,color:"#c97474"}}>{fmt(end)}</span>
        </div>
      ):(
        <>
          {/* ON/HOLD: 등록/사용/잔여/바 표시 */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
              <span style={{fontSize:11,color:"#9a8e80"}}>등록 <b style={{color:"#3a4a3a"}}>{m.total}회</b></span>
              <span style={{fontSize:11,color:"#9a8e80"}}>사용 <b style={{color:"#3a4a3a"}}>{m.used}</b></span>
              <span style={{fontSize:13,fontWeight:700,color:rem===0?"#9a5a10":"#2e5c3e"}}>잔여 <span style={{fontSize:20}}>{rem}</span>회</span>
            </div>
            <div style={{background:"#e8e4dc",borderRadius:8,height:20,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",transition:"width .4s"}}>
                {pct>15&&<span style={{fontSize:10,fontWeight:700,color:"#fff"}}>{m.used}회</span>}
              </div>
            </div>
          </div>
          <div style={S.dateRow}>
            <div style={{display:"flex",flexDirection:"column",gap:1}}><span style={S.dateLabel}>등록일</span><span style={S.dateVal}>{fmt(m.startDate)}</span></div>
            <span style={{color:"#c8c0b0",fontSize:13,marginTop:9}}>→</span>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              <span style={S.dateLabel}>종료일</span>
              <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                <span style={{...S.dateVal,color:dl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(end)}</span>
                {closureExt>0&&<span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{closureExt}일</span>}
                {(m.extensionDays||0)>0&&<span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{m.extensionDays}일</span>}
              </div>
            </div>
            <div style={{...S.dChip,background:dl<0?"#f5eeee":dl<=7?"#fdf3e3":"#eef4ee",color:dl<0?"#c97474":dl<=7?"#9a5a10":"#2e6e44"}}>{dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`}</div>
          </div>
        </>
      )}

      <div style={S.actions}>
        <button style={S.detailBtn} onClick={onDetail}>상세보기</button>
        <button style={S.editBtn} onClick={onEdit}>수정</button>
        <button style={S.delBtn} onClick={onDel}>삭제</button>
      </div>
    </div>
  );
}

function AdminApp({members,setMembers,bookings,setBookings,notices,setNotices,specialSchedules,setSpecialSchedules,closures,setClosures,onLogout}){
  const [tab,setTab]=useState("attendance");
  const [filter,setFilter]=useState("on");
  const [search,setSearch]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({});
  const [detailM,setDetailM]=useState(null);
  const [renewT,setRenewT]=useState(null);
  const [holdT,setHoldT]=useState(null);
  const [delT,setDelT]=useState(null);
  const [showNotices,setShowNotices]=useState(false);

  const counts={all:members.length,on:members.filter(m=>getStatus(m,closures)==="on").length,hold:members.filter(m=>getStatus(m,closures)==="hold").length,off:members.filter(m=>getStatus(m,closures)==="off").length};
  const filtered=useMemo(()=>members.filter(m=>{if(filter!=="all"&&getStatus(m,closures)!==filter)return false;if(search&&!m.name.includes(search))return false;return true;}).sort((a,b)=>a.name.localeCompare(b.name,"ko")),[members,filter,search,closures]);

  function openAdd(){
    const autoEnd=endOfNextMonth(TODAY_STR);
    setEditId(null);
    setForm({gender:"F",name:"",adminNickname:"",adminNote:"",cardColor:"",phone4:"",firstDate:TODAY_STR,memberType:"1month",isNew:true,total:6,used:0,startDate:TODAY_STR,endDate:autoEnd,extensionDays:0,holdingDays:0,holding:null,renewalHistory:[]});
    setShowForm(true);
  }
  function openEdit(m){setEditId(m.id);setForm({...m});setShowForm(true);}
  function saveForm(){
    if(!form.name||!form.startDate)return;
    let autoEnd = form.endDate;
    if(!autoEnd){autoEnd = form.memberType==="3month"?calc3MonthEnd(form.startDate, closures):endOfNextMonth(form.startDate);}
    const e={...form,endDate:autoEnd,total:+form.total,used:+form.used,extensionDays:+(form.extensionDays||0),holdingDays:+(form.holdingDays||0),isNew:!!form.isNew};
    if(editId)setMembers(p=>p.map(m=>m.id===editId?{...m,...e}:m));
    else{const id=Math.max(...members.map(m=>m.id),0)+1;setMembers(p=>[...p,{id,...e,renewalHistory:[{id:1,startDate:e.startDate,endDate:autoEnd,total:e.total,memberType:e.memberType,payment:e.payment||""}]}]);}
    setShowForm(false);
  }
  function applyRenewal(mid,rf){setMembers(p=>p.map(m=>{if(m.id!==mid)return m;return{...m,startDate:rf.startDate,endDate:rf.endDate,total:rf.total,used:0,memberType:rf.memberType,extensionDays:0,holdingDays:0,holding:null,renewalHistory:[...(m.renewalHistory||[]),{id:(m.renewalHistory?.length||0)+1,...rf}]};}));setRenewT(null);setDetailM(null);}
  function applyHolding(mid,hd){setMembers(p=>p.map(m=>{if(m.id!==mid)return m;if(!hd)return{...m,holding:null,holdingDays:0};
if(hd.resumed){
  // 복귀: holdingHistory에 이력 저장, holding 해제
  const histEntry={startDate:m.holding?.startDate||hd.startDate,endDate:hd.endDate||TODAY_STR,workdays:hd.workdays};
  const newHistory=[...(m.holdingHistory||[]),histEntry];
  return{...m,holding:null,holdingDays:0,extensionDays:(m.extensionDays||0)+hd.workdays,holdingHistory:newHistory};
}
// 홀딩 시작
return{...m,holding:{startDate:hd.startDate,endDate:null,workdays:0},holdingDays:0};}));setHoldT(null);setDetailM(null);}
  function applyAdjust(mid,newTotal,newUsed){setMembers(p=>p.map(m=>m.id!==mid?m:{...m,total:newTotal,used:newUsed}));}
  const {dateTimeStr}=useClock();

  return(
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.logoRow}>
            <span style={{fontSize:20,color:"#5a7a5a"}}>ॐ</span>
            <span style={S.studioName}>요가피안</span>
            <span style={{fontSize:11,background:"#2e3a2e",color:"#7a9a7a",borderRadius:5,padding:"2px 7px",fontWeight:700,marginLeft:4}}>관리자</span>
          </div>
          <div style={S.sub}>{dateTimeStr}</div>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
          <button style={{...S.navBtn,fontSize:12,padding:"7px 11px",color:"#92610a",background:"#fef3c7",border:"1px solid #e8c44a",fontWeight:600}} onClick={()=>setShowNotices(true)}>📢 공지관리</button>
          <button onClick={onLogout} style={{background:"#f0ece4",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#7a6e60",cursor:"pointer",fontFamily:FONT}}>로그아웃</button>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:0,background:"#e8e4dc",borderRadius:11,padding:3}}>
          {[["attendance","📋 출석"],["members","🧘🏻 회원 관리"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{border:"none",borderRadius:9,padding:"9px 14px",fontSize:13,fontWeight:tab===k?700:400,background:tab===k?"#fff":"transparent",color:tab===k?"#1e2e1e":"#9a8e80",boxShadow:tab===k?"0 1px 5px rgba(60,50,40,.12)":"none",cursor:"pointer",fontFamily:FONT,whiteSpace:"nowrap"}}>{l}</button>
          ))}
        </div>
        {tab==="members"&&<button style={{...S.addBtn,marginLeft:"auto"}} onClick={openAdd}>+ 회원 추가</button>}
      </div>

      {tab==="attendance"&&<AttendanceBoard members={members} bookings={bookings} setBookings={setBookings} setMembers={setMembers} specialSchedules={specialSchedules} setSpecialSchedules={setSpecialSchedules} closures={closures} setClosures={setClosures} notices={notices} setNotices={setNotices} onMemberClick={(m)=>setDetailM(m)}/>}

      {tab==="members"&&(<>
        <div style={S.pillRow}>
          {[["all","전체"],["on","ON"],["hold","HOLD"],["off","OFF"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{...S.pill,background:filter===k?"#4a6a4a":"#e8e4dc",color:filter===k?"#fff":"#7a6e60",fontWeight:filter===k?700:400}}>{l} <span style={{opacity:.75,fontSize:11}}>{counts[k]??0}</span></button>
          ))}
        </div>
        <div style={S.toolbar}>
          <div style={S.searchBox}><span style={{color:"#a09080",marginRight:5}}>🔍</span><input style={S.searchInput} placeholder="이름 검색" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </div>
        <div style={S.grid}>
          {filtered.length===0&&<div style={S.empty}>조건에 맞는 회원이 없습니다.</div>}
          {filtered.map(m=><MemberCard key={m.id} m={m} onDetail={()=>setDetailM(m)} onEdit={()=>openEdit(m)} onDel={()=>setDelT(m.id)}/>)}
        </div>
      </>)}

      {detailM&&<AdminDetailModal member={members.find(m=>m.id===detailM.id)||detailM} bookings={bookings} onClose={()=>setDetailM(null)} onRenew={()=>setRenewT(detailM.id)} onHolding={()=>setHoldT(detailM.id)} onAdjust={(t,u)=>applyAdjust(detailM.id,t,u)}/>}
      {renewT&&<RenewalModal member={members.find(m=>m.id===renewT)} onClose={()=>setRenewT(null)} onSave={rf=>applyRenewal(renewT,rf)}/>}
      {holdT&&<HoldingModal member={members.find(m=>m.id===holdT)} onClose={()=>setHoldT(null)} onSave={hd=>applyHolding(holdT,hd)}/>}
      {showNotices&&<NoticeManager notices={notices} setNotices={setNotices} onClose={()=>setShowNotices(false)}/>}

      {showForm&&(
        <div style={S.overlay} onClick={()=>setShowForm(false)}>
          <div style={{...S.modal,maxWidth:460,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}><span>{editId?"✏️":"🌱"}</span><span style={S.modalTitle}>{editId?"회원 수정":"신규 회원 추가"}</span></div>
            <div style={S.fg}><label style={S.lbl}>성별</label><div style={{display:"flex",gap:10}}>{[["F","🧘🏻‍♀️","여성"],["M","🧘🏻‍♂️","남성"]].map(([v,emoji,label])=>(<button key={v} onClick={()=>setForm(f=>({...f,gender:v}))} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",borderColor:form.gender===v?"#4a7a5a":"#e0d8cc",background:form.gender===v?"#eef5ee":"#faf8f5",color:form.gender===v?"#2e5c3e":"#9a8e80",fontSize:22,display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:FONT}}><span>{emoji}</span><span style={{fontSize:11,fontWeight:600}}>{label}</span></button>))}</div></div>
            <div style={S.fg}><label style={S.lbl}>이름</label><input style={S.inp} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="회원 이름"/></div>
            <div style={S.fg}><label style={S.lbl}>전화번호 뒷 4자리</label><input style={S.inp} value={form.phone4||""} onChange={e=>setForm(f=>({...f,phone4:e.target.value.replace(/\D/g,"").slice(0,4)}))} placeholder="0000" maxLength={4} type="tel"/></div>
            <div style={{background:"#f5f9f5",borderRadius:10,padding:"12px 14px",marginBottom:12,border:"1px dashed #b8d8b8"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#3d6e45",marginBottom:7}}>👀 어드민 전용</div>
              <div style={S.fg}><label style={S.lbl}>별명 (구별용)</label><input style={S.inp} value={form.adminNickname||""} onChange={e=>setForm(f=>({...f,adminNickname:e.target.value}))} placeholder="예: 1호/저녁반"/></div>
              <div style={S.fg}>
                <label style={S.lbl}>카드 색상 <span style={{fontWeight:400,color:"#9a8e80"}}>(동명이인 구별용)</span></label>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <input type="color" value={form.cardColor||"#cccccc"} onChange={e=>setForm(f=>({...f,cardColor:e.target.value}))} style={{width:44,height:36,border:"1.5px solid #e0d8cc",borderRadius:8,cursor:"pointer",padding:2,background:"none"}}/>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {["#e05050","#2255cc","#e8820a","#9b30d0","#1a8a5a","#d4387a","#3d7ab5","#c0922a"].map(c=>(
                      <div key={c} onClick={()=>setForm(f=>({...f,cardColor:c}))} style={{width:22,height:22,borderRadius:"50%",background:c,cursor:"pointer",border:form.cardColor===c?"3px solid #333":"2px solid transparent"}}/>
                    ))}
                  </div>
                  {form.cardColor&&<button onClick={()=>setForm(f=>({...f,cardColor:""}))} style={{background:"none",border:"none",fontSize:11,color:"#9a8e80",cursor:"pointer",fontFamily:FONT}}>초기화</button>}
                </div>
              </div>
              <div style={{marginBottom:0}}><label style={S.lbl}>메모</label><input style={S.inp} value={form.adminNote||""} onChange={e=>setForm(f=>({...f,adminNote:e.target.value}))} placeholder="특이사항"/></div>
            </div>
            <div style={S.fg}><label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}><div onClick={()=>setForm(f=>({...f,isNew:!f.isNew}))} style={{width:36,height:20,borderRadius:10,background:form.isNew?"#4a6a4a":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}><div style={{position:"absolute",top:2,left:form.isNew?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></div><span style={{color:"#4a4a4a"}}>신규 회원 (N 표시)</span></label></div>
            <div style={S.fg}><label style={S.lbl}>회원권</label><div style={{display:"flex",gap:10}}>{[["1month","1개월"],["3month","3개월"]].map(([v,l])=>(<button key={v} onClick={()=>setForm(f=>{const newEnd=v==="1month"?endOfNextMonth(f.startDate||TODAY_STR):calc3MonthEnd(f.startDate||TODAY_STR,closures);return{...f,memberType:v,total:v==="3month"?24:f.total,endDate:newEnd};})} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:14,fontFamily:FONT,borderColor:form.memberType===v?"#4a7a5a":"#e0d8cc",background:form.memberType===v?"#eef5ee":"#faf8f5",color:form.memberType===v?"#2e5c3e":"#9a8e80",fontWeight:form.memberType===v?700:400}}>{l}</button>))}</div></div>
            <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>총 회차</label><input style={S.inp} type="number" min="1" value={form.total||""} onChange={e=>setForm(f=>({...f,total:e.target.value}))}/></div><div style={{...S.fg,flex:1}}><label style={S.lbl}>사용 회차</label><input style={S.inp} type="number" min="0" value={form.used||0} onChange={e=>setForm(f=>({...f,used:e.target.value}))}/></div></div>
            <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>최초 등록일</label><input style={S.inp} type="date" value={form.firstDate||""} onChange={e=>setForm(f=>({...f,firstDate:e.target.value}))}/></div></div>
            <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>현재 시작일</label><input style={S.inp} type="date" value={form.startDate||""} onChange={e=>{const sd=e.target.value;setForm(f=>({...f,startDate:sd,endDate:f.memberType==="1month"?endOfNextMonth(sd):calc3MonthEnd(sd,closures)}));}}/></div>
              <div style={{...S.fg,flex:1}}>
                <label style={S.lbl}>종료일{form.memberType==="3month"&&<span style={{fontSize:10,color:"#7a9a7a",marginLeft:4}}>자동계산</span>}</label>
                {form.memberType==="3month"?(
                  <div style={{...S.inp,background:"#f0f8f0",color:"#3a4a3a",cursor:"default",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span>{form.endDate?fmt(form.endDate):"-"}</span>
                    <span style={{fontSize:10,color:"#7a9a7a"}}>60평일 기준</span>
                  </div>
                ):(
                  <input style={S.inp} type="date" value={form.endDate||""} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/>
                )}
              </div>
            </div>
            <div style={S.modalBtns}><button style={S.cancelBtn} onClick={()=>setShowForm(false)}>취소</button><button style={S.saveBtn} onClick={saveForm}>저장</button></div>
          </div>
        </div>
      )}

      {delT&&(
        <div style={S.overlay} onClick={()=>setDelT(null)}>
          <div style={{...S.modal,maxWidth:280,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:28,marginBottom:8}}>🌿</div>
            <div style={{...S.modalTitle,marginBottom:6}}>회원을 삭제할까요?</div>
            <div style={{color:"#9a8e80",fontSize:13,marginBottom:18}}>삭제 후에는 복구가 어렵습니다.</div>
            <div style={S.modalBtns}><button style={S.cancelBtn} onClick={()=>setDelT(null)}>취소</button><button style={{...S.saveBtn,background:"#c97474"}} onClick={()=>{setMembers(p=>p.filter(m=>m.id!==delT));setDelT(null);}}>삭제</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function InstallPrompt(){
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

function MemberLoginPage({members,onLogin,onGoAdmin}){
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

  // 동명이인 선택 화면
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
      {/* 로고 */}
      <div style={{textAlign:"center",marginBottom:20}}>
        <img src={LOGO_B64} alt="요가피안" style={{width:140,height:140,objectFit:"contain",display:"block",margin:"0 auto"}}/>
      </div>
      {/* 로그인 카드 */}
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
      {/* 하단 연락처 */}
      <ContactBar/>
      <InstallPrompt/>
      <button onClick={onGoAdmin} style={{marginTop:12,background:"none",border:"none",fontSize:11,color:"#9a8e80",cursor:"pointer",fontFamily:FONT}}>관리자 페이지 →</button>
    </div>
  );
}

function AdminLoginPage({onLogin,onGoMember}){
  const [pin,setPin]=useState("");
  const [error,setError]=useState("");
  function tryLogin(){if(pin===ADMIN_PIN)onLogin();else{setError("PIN이 올바르지 않습니다.");setPin("");}}
  return(
    <div style={{minHeight:"100vh",background:"#2e3a2e",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:FONT}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <img src={LOGO_B64} alt="요가피안" style={{width:130,height:130,objectFit:"contain",display:"block",margin:"0 auto"}}/>
        <div style={{fontSize:14,fontWeight:600,color:"#a0b8a0",marginTop:8,letterSpacing:1}}>관리자 페이지</div>
      </div>
      <div style={{background:"rgba(255,255,255,.07)",borderRadius:18,padding:"24px 22px",width:"100%",maxWidth:280,border:"1px solid rgba(255,255,255,.1)"}}>
        <div style={{marginBottom:12}}><label style={{display:"block",fontSize:12,fontWeight:700,color:"#7a9a7a",marginBottom:5}}>관리자 PIN</label><input type="password" style={{width:"100%",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:10,padding:"12px 14px",fontSize:18,color:"#e8f0e8",background:"rgba(255,255,255,.05)",fontFamily:FONT,letterSpacing:6,textAlign:"center"}} placeholder="••••" maxLength={4} value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()}/></div>
        {error&&<div style={{fontSize:12,color:"#e8a0a0",marginBottom:10,textAlign:"center"}}>{error}</div>}
        <button onClick={tryLogin} style={{width:"100%",background:"#4a7a4a",color:"#fff",border:"none",borderRadius:12,padding:13,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>로그인</button>
      </div>
      <button onClick={onGoMember} style={{marginTop:18,background:"none",border:"none",fontSize:12,color:"#5a7a5a",cursor:"pointer",fontFamily:FONT}}>← 회원 페이지로</button>
    </div>
  );
}

// ── 구 단일 JSON 방식 (더 이상 사용하지 않음 - 개별 테이블로 전환됨) ──
// const STORE_KEY = "yogapian_v3";
// const AUTO_LOGIN_KEY = "yogapian_autologin";
// async function storeSave(key, data) { ... }
// async function storeLoad(key) { ... }

const _supabase = createClient(
  "https://bgrgmrxlahtrpgrnigid.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncmdtcnhsYWh0cnBncm5pZ2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjUzOTQsImV4cCI6MjA4OTU0MTM5NH0.-HRgZaFoWuXWizdHe4ANaRfuo3QCQlP7aYUasofNj4s"
);

// ============================================================
// DB 헬퍼 함수들 (storeSave/storeLoad 대체)
// 각 테이블에 직접 select/insert/update/delete
// ============================================================

// camelCase ↔ snake_case 변환 헬퍼
function toSnake(m) {
  return {
    id:               m.id,
    gender:           m.gender,
    name:             m.name,
    admin_nickname:   m.adminNickname ?? "",
    admin_note:       m.adminNote ?? "",
    phone4:           m.phone4 ?? "",
    first_date:       m.firstDate ?? null,
    member_type:      m.memberType ?? null,
    is_new:           m.isNew ?? false,
    total:            m.total ?? 0,
    used:             m.used ?? 0,
    start_date:       m.startDate ?? null,
    end_date:         m.endDate ?? null,
    extension_days:   m.extensionDays ?? 0,
    holding_days:     m.holdingDays ?? 0,
    holding:          m.holding ?? null,
    renewal_history:  m.renewalHistory ?? [],
    updated_at:       new Date().toISOString(),
  };
}
function fromSnakeMember(r) {
  return {
    id:             r.id,
    gender:         r.gender,
    name:           r.name,
    adminNickname:  r.admin_nickname ?? "",
    adminNote:      r.admin_note ?? "",
    phone4:         r.phone4 ?? "",
    firstDate:      r.first_date ?? null,
    memberType:     r.member_type ?? null,
    isNew:          r.is_new ?? false,
    total:          r.total ?? 0,
    used:           r.used ?? 0,
    startDate:      r.start_date ?? null,
    endDate:        r.end_date ?? null,
    extensionDays:  r.extension_days ?? 0,
    holdingDays:    r.holding_days ?? 0,
    holding:        r.holding ?? null,
    renewalHistory: r.renewal_history ?? [],
  };
}
function bookingToSnake(b) {
  return {
    id:               b.id,
    date:             b.date,
    member_id:        b.memberId ?? null,
    oneday_name:      b.onedayName ?? null,
    time_slot:        b.timeSlot,
    walk_in:          b.walkIn ?? false,
    status:           b.status,
    confirmed_attend: b.confirmedAttend ?? null,
    cancel_note:      b.cancelNote ?? "",
    cancelled_by:     b.cancelledBy ?? "",
    updated_at:       new Date().toISOString(),
  };
}
function fromSnakeBooking(r) {
  return {
    id:              r.id,
    date:            r.date,
    memberId:        r.member_id ?? null,
    onedayName:      r.oneday_name ?? null,
    timeSlot:        r.time_slot,
    walkIn:          r.walk_in ?? false,
    status:          r.status,
    confirmedAttend: r.confirmed_attend ?? null,
    cancelNote:      r.cancel_note ?? "",
    cancelledBy:     r.cancelled_by ?? "",
  };
}
function noticeToSnake(n) {
  return {
    id:               n.id,
    title:            n.title,
    content:          n.content ?? "",
    pinned:           n.pinned ?? false,
    created_at:       n.createdAt ?? TODAY_STR,
    target_member_id: n.targetMemberId ?? null,
    updated_at:       new Date().toISOString(),
  };
}
function fromSnakeNotice(r) {
  return {
    id:             r.id,
    title:          r.title,
    content:        r.content ?? "",
    pinned:         r.pinned ?? false,
    createdAt:      r.created_at ?? TODAY_STR,
    targetMemberId: r.target_member_id ?? null,
  };
}
function specialToSnake(s) {
  return {
    id:           s.id,
    date:         s.date,
    label:        s.label ?? "",
    type:         s.type ?? null,
    fee_note:     s.feeNote ?? "",
    active_slots: s.activeSlots ?? [],
    custom_times: s.customTimes ?? {},
    updated_at:   new Date().toISOString(),
  };
}
function fromSnakeSpecial(r) {
  return {
    id:           r.id,
    date:         r.date,
    label:        r.label ?? "",
    type:         r.type ?? null,
    feeNote:      r.fee_note ?? "",
    activeSlots:  r.active_slots ?? [],
    customTimes:  r.custom_times ?? {},
  };
}
function closureToSnake(c) {
  return {
    id:                 c.id,
    date:               c.date,
    time_slot:          c.timeSlot ?? null,
    reason:             c.reason ?? "",
    closure_type:       c.closureType ?? null,
    extension_override: c.extensionOverride ?? 0,
    updated_at:         new Date().toISOString(),
  };
}
function fromSnakeClosure(r) {
  return {
    id:                r.id,
    date:              r.date,
    timeSlot:          r.time_slot ?? null,
    reason:            r.reason ?? "",
    closureType:       r.closure_type ?? null,
    extensionOverride: r.extension_override ?? 0,
  };
}

// ---------- DB 직접 조작 함수들 ----------

async function dbLoadAll() {
  const [mRes, bRes, nRes, sRes, cRes] = await Promise.all([
    _supabase.from("members").select("*").order("id"),
    _supabase.from("bookings").select("*").order("id"),
    _supabase.from("notices").select("*").order("id", { ascending: false }),
    _supabase.from("special_schedules").select("*").order("date"),
    _supabase.from("closures").select("*").order("date"),
  ]);
  return {
    members:          (mRes.data || []).map(fromSnakeMember),
    bookings:         (bRes.data || []).map(fromSnakeBooking),
    notices:          (nRes.data || []).map(fromSnakeNotice),
    specialSchedules: (sRes.data || []).map(fromSnakeSpecial),
    closures:         (cRes.data || []).map(fromSnakeClosure),
  };
}

// 단건 upsert 헬퍼들
async function dbUpsertMember(m) {
  const { error } = await _supabase.from("members").upsert(toSnake(m));
  if (error) console.error("member upsert:", error);
}
async function dbUpsertBooking(b) {
  const { error } = await _supabase.from("bookings").upsert(bookingToSnake(b));
  if (error) console.error("booking upsert:", error);
}
async function dbUpsertNotice(n) {
  const { error } = await _supabase.from("notices").upsert(noticeToSnake(n));
  if (error) console.error("notice upsert:", error);
}
async function dbUpsertSpecial(s) {
  const { error } = await _supabase.from("special_schedules").upsert(specialToSnake(s));
  if (error) console.error("special upsert:", error);
}
async function dbUpsertClosure(c) {
  const { error } = await _supabase.from("closures").upsert(closureToSnake(c));
  if (error) console.error("closure upsert:", error);
}

async function dbDeleteBooking(id) {
  const { error } = await _supabase.from("bookings").delete().eq("id", id);
  if (error) console.error("booking delete:", error);
}
async function dbDeleteNotice(id) {
  const { error } = await _supabase.from("notices").delete().eq("id", id);
  if (error) console.error("notice delete:", error);
}
async function dbDeleteSpecial(id) {
  const { error } = await _supabase.from("special_schedules").delete().eq("id", id);
  if (error) console.error("special delete:", error);
}
async function dbDeleteClosure(id) {
  const { error } = await _supabase.from("closures").delete().eq("id", id);
  if (error) console.error("closure delete:", error);
}

// 자동로그인 (appdata 테이블 유지 - 가벼운 단건이므로 그대로 사용)
async function saveAutoLogin(memberId) {
  try {
    await _supabase.from("appdata").upsert({
      key: "yogapian_autologin",
      value: JSON.stringify({ memberId }),
      updated_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("autologin save:", e); }
}
async function loadAutoLogin() {
  try {
    const { data } = await _supabase.from("appdata")
      .select("value").eq("key", "yogapian_autologin").maybeSingle();
    return data ? JSON.parse(data.value) : null;
  } catch(e) { return null; }
}

// ============================================================
// App 컴포넌트 - 개별 테이블 직접 읽기/쓰기
// ============================================================
export default function App(){
  const [screen,setScreen]=useState("memberLogin");
  const [loggedMember,setLoggedMember]=useState(null);
  const [members,setMembersState]=useState([]);
  const [bookings,setBookingsState]=useState([]);
  const [notices,setNoticesState]=useState([]);
  const [specialSchedules,setSpecialSchedulesState]=useState([]);
  const [closures,setClosuresState]=useState([]);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const loadedRef = useRef(false);

  // ── 최초 로드: 모든 테이블에서 직접 select ──
  useEffect(()=>{
    (async()=>{
      try {
        const all = await dbLoadAll();
        if(all.members.length)   setMembersState(all.members);
        if(all.bookings.length){
          const processed = all.bookings.map(b=>{
            if(b.status==="attended" && b.date<TODAY_STR && b.confirmedAttend==null)
              return {...b, confirmedAttend:true};
            return b;
          });
          setBookingsState(processed);
        }
        if(all.notices.length)          setNoticesState(all.notices);
        if(all.specialSchedules.length) setSpecialSchedulesState(all.specialSchedules);
        if(all.closures.length)         setClosuresState(all.closures);

        // 자동로그인
        try {
          const autoLogin = await loadAutoLogin();
          if(autoLogin?.memberId && all.members.length){
            const m = all.members.find(mb=>mb.id===autoLogin.memberId);
            if(m){ setLoggedMember(m); setScreen("memberView"); }
          }
        } catch(e){}
      } catch(e){ console.warn("DB 로드 실패:", e); }
      loadedRef.current = true;
      setLoading(false);
    })();
  }, []);

  // ── setMembers: state 반영 + 변경된 멤버만 DB upsert ──
  const setMembers = useCallback((updater) => {
    setMembersState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      // 변경된 항목만 upsert (id 기준 비교)
      const prevMap = new Map(prev.map(m=>[m.id, m]));
      const changed = next.filter(m => {
        const old = prevMap.get(m.id);
        return !old || JSON.stringify(old) !== JSON.stringify(m);
      });
      // 삭제된 항목은 여기서는 처리 안 함 (회원 삭제 시 별도 처리 필요)
      changed.forEach(m => dbUpsertMember(m));
      return next;
    });
  }, []);

  // ── setBookings: state 반영 + 변경/추가된 예약 upsert, 없어진 예약 delete ──
  const setBookings = useCallback((updater) => {
    setBookingsState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      setSaving(true);
      const prevMap = new Map(prev.map(b=>[b.id, b]));
      const nextMap = new Map(next.map(b=>[b.id, b]));
      // upsert 변경/추가
      const toUpsert = next.filter(b => {
        const old = prevMap.get(b.id);
        return !old || JSON.stringify(old) !== JSON.stringify(b);
      });
      // delete 제거된 것
      const toDelete = prev.filter(b => !nextMap.has(b.id));
      Promise.all([
        ...toUpsert.map(b => dbUpsertBooking(b)),
        ...toDelete.map(b => dbDeleteBooking(b.id)),
      ]).finally(()=>setSaving(false));
      return next;
    });
  }, []);

  // ── setNotices ──
  const setNotices = useCallback((updater) => {
    setNoticesState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      const prevMap = new Map(prev.map(n=>[n.id, n]));
      const nextMap = new Map(next.map(n=>[n.id, n]));
      next.filter(n => {
        const old = prevMap.get(n.id);
        return !old || JSON.stringify(old) !== JSON.stringify(n);
      }).forEach(n => dbUpsertNotice(n));
      prev.filter(n => !nextMap.has(n.id)).forEach(n => dbDeleteNotice(n.id));
      return next;
    });
  }, []);

  // ── setSpecialSchedules ──
  const setSpecialSchedules = useCallback((updater) => {
    setSpecialSchedulesState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      const prevMap = new Map(prev.map(s=>[s.id, s]));
      const nextMap = new Map(next.map(s=>[s.id, s]));
      next.filter(s => {
        const old = prevMap.get(s.id);
        return !old || JSON.stringify(old) !== JSON.stringify(s);
      }).forEach(s => dbUpsertSpecial(s));
      prev.filter(s => !nextMap.has(s.id)).forEach(s => dbDeleteSpecial(s.id));
      return next;
    });
  }, []);

  // ── setClosures ──
  const setClosures = useCallback((updater) => {
    setClosuresState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      const prevMap = new Map(prev.map(c=>[c.id, c]));
      const nextMap = new Map(next.map(c=>[c.id, c]));
      next.filter(c => {
        const old = prevMap.get(c.id);
        return !old || JSON.stringify(old) !== JSON.stringify(c);
      }).forEach(c => dbUpsertClosure(c));
      prev.filter(c => !nextMap.has(c.id)).forEach(c => dbDeleteClosure(c.id));
      return next;
    });
  }, []);

  const SaveBadge = ()=>(
    <div style={{position:"fixed",bottom:16,right:16,zIndex:999,display:"flex",alignItems:"center",gap:5,
      background:saving?"#fdf3e3":"#eef5ee",
      border:`1px solid ${saving?"#e8c44a":"#a0d0a0"}`,
      borderRadius:20,padding:"5px 12px",fontSize:11,
      color:saving?"#9a5a10":"#2e6e44",fontFamily:FONT,
      boxShadow:"0 2px 8px rgba(0,0,0,.08)"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:saving?"#e8a44a":"#5a9e6a",display:"inline-block"}}/>
      {saving?"저장 중…":"저장됨 ✓"}
    </div>
  );

  if(loading) return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f3ef",fontFamily:FONT,color:"#9a8e80",fontSize:14}}>
      불러오는 중…
    </div>
  );

  if(screen==="memberLogin") return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f5f3ef;font-family:${FONT}}button,input{font-family:${FONT};outline:none;-webkit-appearance:none}button:active{opacity:.72}@media(max-width:390px){html{font-size:14px}}`}</style>
      <MemberLoginPage members={members} onLogin={m=>{setLoggedMember(m);setScreen("memberView");}} onGoAdmin={()=>setScreen("adminLogin")}/>
    </div>
    </ClosuresContext.Provider>
  );
  if(screen==="memberView"&&loggedMember) return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f5f3ef;font-family:${FONT}}button,input{font-family:${FONT};outline:none;-webkit-appearance:none}button:active{opacity:.72;transform:scale(.97)}@media(max-width:390px){html{font-size:14px}}.member-header{flex-wrap:wrap;gap:8px!important}`}</style>
      <MemberView member={members.find(m=>m.id===loggedMember.id)||loggedMember} bookings={bookings} setBookings={setBookings} setMembers={setMembers} specialSchedules={specialSchedules} closures={closures} notices={notices} setNotices={setNotices} onLogout={()=>{setLoggedMember(null);setScreen("memberLogin");saveAutoLogin(null);}}/>
    </div>
    </ClosuresContext.Provider>
  );
  if(screen==="adminLogin") return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}body{background:#2e3a2e}button,input{font-family:${FONT};outline:none;-webkit-appearance:none}button:active{opacity:.72}`}</style>
      <AdminLoginPage onLogin={()=>setScreen("admin")} onGoMember={()=>setScreen("memberLogin")}/>
    </div>
    </ClosuresContext.Provider>
  );
  if(screen==="admin") return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f5f3ef;font-family:${FONT}}button,input,select,textarea{font-family:${FONT};outline:none;-webkit-appearance:none}.card{transition:box-shadow .2s,transform .15s}@media(hover:hover){.card:hover{box-shadow:0 6px 24px rgba(60,50,30,.14);transform:translateY(-2px)}}.pill:hover{opacity:.78}button:active{opacity:.72}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#c8c0b0;border-radius:4px}@media(max-width:600px){html{font-size:14px}.admin-grid{grid-template-columns:1fr!important}.admin-pillrow{gap:5px!important}.admin-toolbar{flex-direction:column!important}}`}</style>
      <SaveBadge/>
      <AdminApp members={members} setMembers={setMembers} bookings={bookings} setBookings={setBookings} notices={notices} setNotices={setNotices} specialSchedules={specialSchedules} setSpecialSchedules={setSpecialSchedules} closures={closures} setClosures={setClosures} onLogout={()=>setScreen("memberLogin")}/>
    </div>
    </ClosuresContext.Provider>
  );
  return null;
}


const S={
  page:{minHeight:"100vh",background:"#f5f3ef",fontFamily:FONT,padding:"max(16px, env(safe-area-inset-top)) 12px 80px",maxWidth:980,margin:"0 auto"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,gap:8},
  logoRow:{display:"flex",alignItems:"center",gap:7,marginBottom:3},
  studioName:{fontSize:21,fontWeight:700,color:"#1e2e1e"},
  sub:{fontSize:11,color:"#a09080"},
  addBtn:{background:"#4a6a4a",color:"#fff",border:"none",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,whiteSpace:"nowrap"},
  pillRow:{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"},
  pill:{border:"none",borderRadius:20,padding:"6px 14px",fontSize:12,cursor:"pointer",fontFamily:FONT},
  toolbar:{display:"flex",gap:10,marginBottom:18},
  searchBox:{background:"#fff",border:"1.5px solid #ddd",borderRadius:10,padding:"9px 12px",display:"flex",alignItems:"center",flex:1},
  searchInput:{border:"none",background:"transparent",fontSize:14,color:"#3a3a3a",width:"100%",fontFamily:FONT},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:12},
  empty:{color:"#b0a090",fontSize:14,padding:"36px 0",textAlign:"center",gridColumn:"1/-1"},
  card:{background:"#fff",borderRadius:13,padding:"14px 14px 12px",border:"1px solid #e4e0d8",boxShadow:"0 2px 8px rgba(60,50,30,.06)",position:"relative"},
  cardTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9,flexWrap:"wrap",gap:4},
  memberName:{fontSize:15,fontWeight:700,color:"#1e2e1e"},
  statusBadge:{display:"flex",alignItems:"center",fontSize:11,borderRadius:20,padding:"3px 8px",fontWeight:600},
  dateRow:{display:"flex",alignItems:"center",gap:7,marginBottom:10,flexWrap:"wrap"},
  dateLabel:{fontSize:10,color:"#b0a090"},
  dateVal:{fontSize:11,color:"#4a4a4a",fontWeight:600},
  dChip:{marginLeft:"auto",fontSize:11,fontWeight:700,borderRadius:7,padding:"3px 8px"},
  actions:{display:"flex",gap:5},
  detailBtn:{flex:1,background:"#eef4ee",color:"#2e6e44",border:"none",borderRadius:7,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT},
  editBtn:{background:"#f0ece4",color:"#6a6050",border:"none",borderRadius:7,padding:"7px 9px",fontSize:11,cursor:"pointer",fontFamily:FONT},
  delBtn:{background:"#f5eeee",color:"#c97474",border:"none",borderRadius:7,padding:"7px 8px",fontSize:11,cursor:"pointer",fontFamily:FONT},
  navBtn:{background:"#fff",border:"1.5px solid #ddd",borderRadius:8,padding:"7px 11px",fontSize:13,color:"#4a4a4a",cursor:"pointer",fontFamily:FONT},
  overlay:{position:"fixed",inset:0,background:"rgba(40,35,25,.42)",backdropFilter:"blur(4px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100,padding:"0 0 0 0"},
  modal:{background:"#fff",borderRadius:"16px 16px 0 0",padding:"20px 16px 32px",width:"100%",maxWidth:520,boxShadow:"0 -8px 40px rgba(40,35,25,.18)",maxHeight:"90vh",overflowY:"auto"},
  modalHead:{display:"flex",alignItems:"center",gap:9,marginBottom:14},
  modalTitle:{fontSize:16,fontWeight:700,color:"#1e2e1e"},
  fg:{marginBottom:12},
  lbl:{display:"block",fontSize:11,color:"#9a8e80",marginBottom:4,fontWeight:600},
  inp:{width:"100%",border:"1.5px solid #ddd",borderRadius:9,padding:"10px 11px",fontSize:14,color:"#3a3a3a",background:"#fafaf7",fontFamily:FONT},
  modalBtns:{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10},
  cancelBtn:{background:"#f0ece4",color:"#9a8e80",border:"none",borderRadius:9,padding:"9px 16px",fontSize:13,cursor:"pointer",fontFamily:FONT},
  saveBtn:{background:"#4a6a4a",color:"#fff",border:"none",borderRadius:9,padding:"9px 20px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT},
  stepper:{width:28,height:28,borderRadius:7,border:"1.5px solid #ddd",background:"#fafaf7",color:"#4a4a4a",fontSize:15,cursor:"pointer",fontFamily:FONT},
};
