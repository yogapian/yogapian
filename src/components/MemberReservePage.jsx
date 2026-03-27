import { useState } from "react";
import { Agentation } from "agentation";
import { FONT, TODAY_STR, TIME_SLOTS, SCHEDULE, DOW_KO, KR_HOLIDAYS } from "../constants.js";
import { parseLocal, fmt, fmtWithDow, addDays, toDateStr } from "../utils.js";
import { calcDL, getClosureExtDays, usedAsOf, getSlotCapacity, holdingElapsed } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";

const DEFAULT_TIMES = {dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};

// 인라인 풀 달력
function InlineCalendar({selDate, onSelect, bookings, member, closures, specialSchedules}){
  const init = parseLocal(selDate||TODAY_STR);
  const [year, setYear] = useState(init.getFullYear());
  const [month, setMonth] = useState(init.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth}, (_,i) => i+1)];
  const ymStr = `${year}-${String(month+1).padStart(2,'0')}`;

  const myMonthBookings = bookings.filter(b => b.memberId===member.id && b.date.startsWith(ymStr));
  const attendedSet = new Set(myMonthBookings.filter(b=>b.status==="attended"||b.status==="reserved").map(b=>parseLocal(b.date).getDate()));
  const waitingSet  = new Set(myMonthBookings.filter(b=>b.status==="waiting").map(b=>parseLocal(b.date).getDate()));
  const closureSet  = new Set(closures.filter(cl=>cl.date.startsWith(ymStr)&&!cl.timeSlot).map(cl=>parseLocal(cl.date).getDate()));
  const partialSet  = new Set(closures.filter(cl=>cl.date.startsWith(ymStr)&&cl.timeSlot).map(cl=>parseLocal(cl.date).getDate()));

  const prevM = () => { if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); };
  const nextM = () => { if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); };

  return (
    <div style={{background:"#fff",borderRadius:13,border:"1px solid #e4e0d8",boxShadow:"0 2px 8px rgba(60,50,30,.06)",margin:"10px 14px 12px",overflow:"hidden"}}>
      {/* 월 네비 */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px 6px"}}>
        <button onClick={prevM} style={{background:"none",border:"none",fontSize:22,color:"#555",cursor:"pointer",padding:"4px 10px",lineHeight:1}}>‹</button>
        <span style={{fontSize:15,fontWeight:700,color:"#1e2e1e"}}>{year}년 {month+1}월</span>
        <button onClick={nextM} style={{background:"none",border:"none",fontSize:22,color:"#555",cursor:"pointer",padding:"4px 10px",lineHeight:1}}>›</button>
      </div>
      {/* 요일 헤더 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"0 6px 2px"}}>
        {DOW_KO.map((d,i) => (
          <div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:i===0?"#e05050":i===6?"#4a70d0":"#9a8e80",padding:"2px 0"}}>{d}</div>
        ))}
      </div>
      {/* 날짜 셀 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"0 4px 10px"}}>
        {cells.map((day, i) => {
          if(!day) return <div key={i}/>;
          const ds = toDateStr(year, month, day);
          const dow = new Date(year, month, day).getDay();
          const isPast = ds < TODAY_STR;
          const isToday = ds === TODAY_STR;
          const isSel = ds === selDate;
          const isClosure = closureSet.has(day);
          const isPartial = partialSet.has(day) && !isClosure;
          const isHol = !!KR_HOLIDAYS[ds];
          const sp = specialSchedules.find(s=>s.date===ds);
          const hasSlots = sp ? sp.activeSlots?.length > 0 : (dow!==0 && dow!==6);
          const noClass = !isPast && !hasSlots && !isClosure;
          const unselectable = isClosure || noClass || isPast;
          const isAtt = attendedSet.has(day);
          const isWait = waitingSet.has(day) && !isAtt;
          const isOpen = !isPast && !isClosure && sp?.type==="open";
          const isSpecialDay = !isPast && !isClosure && sp?.type==="special";
          const hasDailyNote = !isPast && !isClosure && sp?.dailyNote?.trim();

          let numColor = "#1e2e1e";
          if(isSel) numColor = "#fff";
          else if(isPast) numColor = "#c8c0b0";
          else if(isClosure) numColor = "#c97474";
          else if(isHol||dow===0) numColor = "#e05050";
          else if(dow===6) numColor = "#4a70d0";
          else if(noClass) numColor = "#c8c0b0";

          return (
            <div key={i} onClick={() => !unselectable && onSelect(ds)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"3px 1px 2px",cursor:unselectable?"default":"pointer",userSelect:"none"}}>
              {/* 날짜 숫자 — 선택/오늘/출석 상태에 따라 배경 */}
              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:26,height:26,padding:"0 2px",borderRadius:"50%",fontSize:13,fontWeight:isSel||isToday?700:400,color:numColor,lineHeight:1,background:isSel?"#2e6e44":isAtt&&!isSel?"#e4f5eb":"transparent",border:isToday&&!isSel?"1.5px solid #2e6e44":"1.5px solid transparent"}}>
                {day}
              </span>
              {/* 오늘 라벨 + 인디케이터 — 같은 위치 */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0,marginTop:1,minHeight:10}}>
                {isToday && <span style={{fontSize:8,color:"#2e6e44",fontWeight:600,lineHeight:1.2}}>오늘</span>}
                {isWait && <span style={{fontSize:8,color:"#e8a020",lineHeight:1.2}}>▲</span>}
                {isClosure && !isSel && <span style={{fontSize:7,color:"#c97474",fontWeight:700,lineHeight:1.2}}>휴강</span>}
                {isPartial && <span style={{fontSize:7,color:"#e07050",fontWeight:700,lineHeight:1.2}}>부분</span>}
                {isOpen && <span style={{fontSize:7,color:"#1a6e4a",fontWeight:700,lineHeight:1.2}}>오픈</span>}
                {isSpecialDay && <span style={{fontSize:7,color:"#5a3a9a",fontWeight:700,lineHeight:1.2}}>집중</span>}
                {hasDailyNote && <span style={{fontSize:9,lineHeight:1}}>📢</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MemberReservePage({member,bookings,setBookings,setMembers,setNotices,specialSchedules,closures,scheduleTemplate}){
  const [selDate, setSelDate] = useState(TODAY_STR);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [pendingSlot, setPendingSlot] = useState(null);
  const [renewPopup, setRenewPopup] = useState(null);

  const closuresCxt = useClosures();
  const dow = parseLocal(selDate).getDay();
  const special = specialSchedules.find(s => s.date===selDate);
  const isWeekend = dow===0||dow===6;
  const isSpecial = !!special;
  const isOpen = special?.type==="open";
  const isRegular = special?.type==="regular";
  const isFuture = selDate >= TODAY_STR;
  const dayClosure = closures.find(cl=>cl.date===selDate&&!cl.timeSlot);
  const getSlotClosure = k => closures.find(cl=>cl.date===selDate&&cl.timeSlot===k);
  const hasTimeChange = isRegular && special?.activeSlots?.some(k=>special.customTimes?.[k]&&special.customTimes[k]!==DEFAULT_TIMES[k]);

  const memberDl = calcDL(member, closuresCxt);
  const memberExpired = memberDl < 0;
  const usedCnt = usedAsOf(member.id, TODAY_STR, bookings, [member]);
  const rem = memberExpired ? 0 : Math.max(0, member.total - usedCnt);

  const getSlots = () => {
    if(isSpecial) return TIME_SLOTS.filter(s=>special.activeSlots.includes(s.key)).map(s=>({...s, time:special.customTimes?.[s.key]||s.time}));
    if(isWeekend) return [];
    if(Array.isArray(scheduleTemplate)&&scheduleTemplate.length>0){
      const active=scheduleTemplate.filter(e=>e.days.includes(dow)&&(!e.startDate||selDate>=e.startDate)&&(!e.endDate||selDate<=e.endDate));
      if(active.length) return active.map(e=>{const base=TIME_SLOTS.find(t=>t.key===e.slotKey)||TIME_SLOTS[1];return{...base,time:e.time||base.time};});
    }
    if(selDate<"2026-05-01") return TIME_SLOTS.filter(s=>SCHEDULE[dow]?.includes(s.key));
    return [];
  };
  const slots = getSlots();
  const dayActive = bookings.filter(b=>b.date===selDate&&b.status!=="cancelled");

  function slotActiveCount(k){ return dayActive.filter(b=>b.timeSlot===k&&(b.status==="attended"||b.status==="reserved")).length; }
  function slotWaitCount(k){ return dayActive.filter(b=>b.timeSlot===k&&b.status==="waiting").length; }
  function mySlot(k){ return dayActive.find(b=>b.memberId===member.id&&b.timeSlot===k); }
  function waitingRank(k){
    const waiters = dayActive.filter(b=>b.timeSlot===k&&b.status==="waiting").sort((a,b)=>a.id-b.id);
    const idx = waiters.findIndex(b=>b.memberId===member.id);
    return idx>=0?idx+1:0;
  }

  function tryReserve(slotKey, isWaiting=false){
    if(mySlot(slotKey)||getSlotClosure(slotKey)||dayClosure) return;
    if(!isWaiting && slotActiveCount(slotKey)>=getSlotCapacity(selDate,slotKey,specialSchedules,scheduleTemplate)) return;
    if(isWaiting){ doReserve(slotKey,true,false); return; }
    if(rem===0||memberExpired){ setPendingSlot(slotKey); setRenewPopup("needRenewal"); return; }
    if(rem===1){ setPendingSlot(slotKey); setRenewPopup("last1"); return; }
    doReserve(slotKey,false,false);
  }

  function doReserve(slotKey, isWaiting, renewalPending){
    const nid = Math.max(...bookings.map(b=>b.id),0)+1;
    setBookings(p=>[...p,{id:nid,date:selDate,memberId:member.id,timeSlot:slotKey,walkIn:false,status:isWaiting?"waiting":"attended",cancelNote:"",cancelledBy:"",...(renewalPending?{renewalPending:true}:{})}]);
    setPendingSlot(null); setRenewPopup(null);
  }

  function cancelBooking(bId){
    const cancelled = bookings.find(b=>b.id===bId);
    if(!cancelled) return;
    const slotKey = cancelled.timeSlot;
    const slotLabel = TIME_SLOTS.find(t=>t.key===slotKey)?.label||"";
    const isConfirmed = cancelled.status==="attended"||cancelled.status==="reserved";
    const firstWaiter = isConfirmed
      ? bookings.filter(b=>b.date===cancelled.date&&b.timeSlot===slotKey&&b.status==="waiting"&&b.id!==bId).sort((a,b)=>a.id-b.id)[0]
      : null;
    setBookings(p=>{
      const next = p.map(b=>b.id===bId?{...b,status:"cancelled",cancelledBy:"member"}:b);
      return firstWaiter?next.map(b=>b.id===firstWaiter.id?{...b,status:"attended"}:b):next;
    });
    if(firstWaiter){
      setNotices(prev=>[{id:Date.now(),title:"📢 예약 확정 안내",content:`${fmt(cancelled.date)} ${slotLabel} 수업 대기가 예약으로 확정되었습니다!`,pinned:false,createdAt:TODAY_STR,targetMemberId:firstWaiter.memberId},...(prev||[])]);
    }
    setConfirmCancel(null);
  }

  function resumeHolding(){
    if(!member.holding||!setMembers) return;
    const startStr = member.holding.startDate;
    let count = 0;
    let cur = parseLocal(startStr);
    const end = parseLocal(TODAY_STR);
    while(cur < end){ const dow=cur.getDay(); if(dow!==0&&dow!==6) count++; cur.setDate(cur.getDate()+1); }
    setMembers(p=>p.map(m=>{
      if(m.id!==member.id) return m;
      const hist={startDate:m.holding.startDate,endDate:TODAY_STR,workdays:count};
      return{...m,holding:null,holdingDays:0,extensionDays:(m.extensionDays||0)+count,holdingHistory:[...(m.holdingHistory||[]),hist]};
    }));
  }

  return (
    <div style={{maxWidth:520,margin:"0 auto",width:"100%",fontFamily:FONT,paddingBottom:80}}>

      {/* 홀딩 배너 */}
      {member.holding&&(
        <div style={{margin:"0 14px 12px",borderRadius:12,background:"#edf0f8",border:"1.5px solid #a0b0d0",padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20,flexShrink:0}}>⏸️</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:"#3d5494"}}>홀딩 중</div>
              <div style={{fontSize:11,color:"#5a5a7a",marginTop:2}}>{fmt(member.holding.startDate)} 시작 · {holdingElapsed(member.holding)}일 경과</div>
            </div>
            {member.memberType==="3month"?(
              <button onClick={resumeHolding} style={{background:"#3d5494",color:"#fff",border:"none",borderRadius:9,padding:"7px 13px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT,flexShrink:0}}>복귀하기</button>
            ):(
              <span style={{fontSize:11,color:"#c97474",fontWeight:600,flexShrink:0}}>1개월권은 홀딩 불가</span>
            )}
          </div>
        </div>
      )}

      {/* 풀 달력 */}
      <InlineCalendar
        selDate={selDate}
        onSelect={setSelDate}
        bookings={bookings}
        member={member}
        closures={closures}
        specialSchedules={specialSchedules}
      />

      {/* 선택 날짜 헤더 */}
      <div style={{margin:"0 14px 10px",borderRadius:12,background:"#fff",border:`1.5px solid ${dayClosure?"#f0b0a0":isOpen?"#7acca0":special?.type==="special"?"#a090d0":"#e4e0d8"}`,overflow:"hidden"}}>
        <div style={{padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"center",gap:7,flexWrap:"wrap"}}>
          <span style={{fontSize:15,fontWeight:700,color:"#1e2e1e"}}>{fmtWithDow(selDate)}</span>
          {selDate===TODAY_STR&&<span style={{fontSize:11,background:"#2e6e44",color:"#fff",borderRadius:10,padding:"2px 8px",fontWeight:700}}>오늘</span>}
          {dayClosure&&<span style={{fontSize:11,background:"#fde8e8",color:"#a83030",borderRadius:10,padding:"2px 8px",fontWeight:700}}>휴강</span>}
          {!dayClosure&&isOpen&&<span style={{fontSize:11,background:"#d8f5ec",color:"#1a6e4a",borderRadius:10,padding:"2px 8px",fontWeight:700}}>오픈</span>}
          {!dayClosure&&isSpecial&&special?.type==="special"&&<span style={{fontSize:11,background:"#ede8fa",color:"#5a3a9a",borderRadius:10,padding:"2px 8px",fontWeight:700}}>집중</span>}
          {!dayClosure&&isRegular&&hasTimeChange&&<span style={{fontSize:11,background:"#fdf0d8",color:"#9a5a10",borderRadius:10,padding:"2px 8px",fontWeight:700}}>변경</span>}
        </div>
      </div>

      <div style={{padding:"0 14px 12px"}}>
        {/* 과거 날짜 */}
        {!isFuture&&<div style={{textAlign:"center",padding:"32px 0",color:"#b0a090"}}><div style={{fontSize:28,marginBottom:8}}>📅</div><div style={{fontSize:13}}>과거 날짜는 예약할 수 없어요.</div></div>}

        {/* 수업 없는 날 */}
        {isFuture&&isWeekend&&(!isSpecial||(special&&special.type==="regular"))&&!dayClosure&&<div style={{textAlign:"center",padding:"32px 0",color:"#b0a090"}}><div style={{fontSize:28,marginBottom:8}}>🌿</div><div style={{fontSize:13}}>이 날은 수업이 없습니다.</div></div>}
        {isFuture&&isOpen&&<div style={{background:"#d8f5ec",border:"1.5px solid #7acca0",borderRadius:12,padding:"11px 14px",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:20}}>🍀</span><div><div style={{fontSize:13,fontWeight:700,color:"#1a6e4a"}}>오픈클래스</div><div style={{fontSize:11,color:"#1a5a3a",marginTop:2}}>{special.label}</div>{special.feeNote&&<div style={{fontSize:11,color:"#1a5a3a"}}>{special.feeNote}</div>}</div></div>}
        {isFuture&&isSpecial&&!isOpen&&special?.type==="special"&&<div style={{background:"linear-gradient(135deg,#f0edff,#e8e2ff)",border:"1.5px solid #a090d0",borderRadius:12,padding:"11px 14px",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:20}}>⚡️</span><div><div style={{fontSize:13,fontWeight:700,color:"#4a2e8a"}}>집중수련</div><div style={{fontSize:11,color:"#7a5aaa",marginTop:2}}>{special.label}</div>{special.feeNote&&<div style={{fontSize:11,color:"#6a4aaa"}}>{special.feeNote}</div>}</div></div>}
        {isFuture&&dayClosure&&<div style={{background:"#fff3f0",border:"1px solid #f0b0a0",borderRadius:12,padding:"12px 16px",display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:20}}>🔕</span><div><div style={{fontSize:13,fontWeight:700,color:"#8e3030"}}>전체 휴강</div><div style={{fontSize:12,color:"#9a5a50",marginTop:2}}>{dayClosure.reason}</div></div></div>}

        {/* 홀딩 중 예약 불가 안내 */}
        {isFuture&&member.holding&&!dayClosure&&<div style={{textAlign:"center",padding:"24px 0",color:"#5a5a7a"}}><div style={{fontSize:24,marginBottom:6}}>⏸️</div><div style={{fontSize:13}}>홀딩 기간 중 예약할 수 없어요.</div><div style={{fontSize:11,color:"#9a8e80",marginTop:4}}>위 배너에서 복귀하기 버튼을 눌러주세요.</div></div>}

        {/* 타임슬롯 카드 */}
        {isFuture&&!member.holding&&!dayClosure&&slots.filter(slot=>{
          if(selDate!==TODAY_STR) return true;
          const now=new Date();
          const H={dawn:6,morning:8,lunch:11,afternoon:14,evening:19}[slot.key]||0;
          const M={dawn:30,morning:30,lunch:50,afternoon:0,evening:30}[slot.key]||0;
          return now.getHours()*60+now.getMinutes()<H*60+M;
        }).map(slot=>{
          const slCl = getSlotClosure(slot.key);
          const cnt = slotActiveCount(slot.key);
          const waitCnt = slotWaitCount(slot.key);
          const cap = getSlotCapacity(selDate,slot.key,specialSchedules,scheduleTemplate);
          const remaining = cap-cnt;
          const myB = mySlot(slot.key);
          const isMyWait = myB?.status==="waiting";
          const isMyRes = myB&&!isMyWait;
          const isFull = remaining<=0;
          const myRank = isMyWait?waitingRank(slot.key):0;
          const isChg = isRegular&&DEFAULT_TIMES[slot.key]&&slot.time!==DEFAULT_TIMES[slot.key];

          return (
            <div key={slot.key} style={{background:"#fff",borderRadius:12,marginBottom:8,border:`1.5px solid ${slCl?"#f0b0a0":isMyRes?"#2e6e44":isMyWait?"#e8c44a":"#e8e4dc"}`,overflow:"hidden",boxShadow:isMyRes?"0 0 0 3px rgba(46,110,68,.08)":isMyWait?"0 0 0 3px rgba(232,196,74,.12)":"none"}}>
              <div style={{padding:"10px 12px",display:"flex",alignItems:"center",gap:9}}>
                <div style={{width:36,height:36,borderRadius:10,background:slCl?"#f5f0ee":slot.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{slot.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:2}}>
                    <span style={{fontSize:14,fontWeight:700,color:slCl?"#9a8e80":slot.color}}>{slot.label}</span>
                    {isChg?<span style={{fontSize:11}}><s style={{color:"#c0b0b0"}}>{DEFAULT_TIMES[slot.key]}</s><span style={{color:"#c97474"}}> → {slot.time}</span></span>:<span style={{fontSize:11,color:"#9a8e80"}}>{slot.time}</span>}
                    {isMyRes&&<span style={{fontSize:10,background:"#e8f5ee",color:"#2e6e44",borderRadius:10,padding:"1px 7px",fontWeight:700}}>내 예약</span>}
                    {isMyWait&&<span style={{fontSize:10,background:"#fffaeb",color:"#9a5a10",borderRadius:10,padding:"1px 7px",fontWeight:700}}>대기 {myRank}번째</span>}
                  </div>
                  <div style={{fontSize:11,color:slCl?"#b0a090":isFull&&!myB?"#c97474":remaining<=2&&!myB?"#9a5a10":"#a0988e"}}>
                    {slCl?`🔕 ${slCl.reason}`:isFull&&!myB?`마감 · 대기 ${waitCnt}명`:`잔여 ${remaining}석 / ${cap}석`}
                  </div>
                </div>
                <div style={{flexShrink:0}}>
                  {slCl?(<span style={{fontSize:11,background:"#f5f0ee",color:"#9a8e80",borderRadius:7,padding:"5px 9px",fontWeight:700}}>휴강</span>)
                  :isMyRes?(<button onClick={()=>setConfirmCancel(myB.id)} style={{background:"none",border:"1.5px solid #e8a0a0",borderRadius:9,padding:"6px 11px",fontSize:12,fontWeight:700,color:"#c97474",cursor:"pointer",fontFamily:FONT}}>취소</button>)
                  :isMyWait?(<button onClick={()=>setConfirmCancel(myB.id)} style={{background:"none",border:"1.5px solid #e8c44a",borderRadius:9,padding:"6px 11px",fontSize:12,fontWeight:700,color:"#9a5a10",cursor:"pointer",fontFamily:FONT}}>대기취소</button>)
                  :isFull?(<button onClick={()=>tryReserve(slot.key,true)} style={{background:"#fdf3e3",border:"1.5px solid #e8c44a",borderRadius:9,padding:"6px 11px",fontSize:12,fontWeight:700,color:"#9a5a10",cursor:"pointer",fontFamily:FONT}}>대기</button>)
                  :(<button onClick={()=>tryReserve(slot.key)} style={{background:"#2e6e44",border:"none",borderRadius:9,padding:"6px 15px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:FONT}}>예약</button>)}
                </div>
              </div>
              {!slCl&&<div style={{height:3,background:"#f0ece4"}}><div style={{height:"100%",width:`${Math.min(100,cnt/cap*100)}%`,background:isFull?"#c97474":remaining<=2?"#e8c44a":"#4a9e68",transition:"width .3s",borderRadius:"0 3px 3px 0"}}/></div>}
            </div>
          );
        })}
      </div>

      {/* 예약 취소 확인 */}
      {confirmCancel&&(
        <div style={S.overlay} onClick={()=>setConfirmCancel(null)}>
          <div style={{...S.modal,maxWidth:320,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:30,marginBottom:10}}>🌿</div>
            <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e",marginBottom:6}}>예약을 취소할까요?</div>
            <div style={{fontSize:13,color:"#9a8e80",marginBottom:20}}>취소해도 횟수는 차감되지 않아요.</div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...S.cancelBtn,flex:1}} onClick={()=>setConfirmCancel(null)}>아니요</button>
              <button style={{...S.saveBtn,flex:1,background:"#c97474"}} onClick={()=>cancelBooking(confirmCancel)}>취소하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 마지막 1회 팝업 */}
      {renewPopup==="last1"&&(
        <div style={S.overlay} onClick={()=>{setRenewPopup(null);setPendingSlot(null);}}>
          <div style={{...S.modal,maxWidth:320,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:34,marginBottom:10}}>🌱</div>
            <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e",marginBottom:8}}>마지막 1회 남았어요</div>
            <div style={{fontSize:13,color:"#7a6e60",lineHeight:1.8,marginBottom:20}}>이번 예약 후 횟수를 다 사용해요.<br/><span style={{color:"#9a8e80",fontSize:12}}>다음 예약 시 갱신이 필요합니다.</span></div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...S.cancelBtn,flex:1}} onClick={()=>{setRenewPopup(null);setPendingSlot(null);}}>취소</button>
              <button style={{...S.saveBtn,flex:1}} onClick={()=>doReserve(pendingSlot,false,false)}>예약하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 잔여 0회/만료 팝업 */}
      {renewPopup==="needRenewal"&&(
        <div style={S.overlay} onClick={()=>{setRenewPopup(null);setPendingSlot(null);}}>
          <div style={{...S.modal,maxWidth:320,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:34,marginBottom:10}}>🔄</div>
            <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e",marginBottom:8}}>{memberExpired?"회원권이 만료됐어요":"횟수를 다 사용했어요"}</div>
            <div style={{fontSize:13,color:"#7a6e60",lineHeight:1.8,marginBottom:20}}>임시 예약을 하시겠어요?<br/><span style={{color:"#9a8e80",fontSize:12}}>관리자에게 갱신 요청이 전달돼요.</span></div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...S.cancelBtn,flex:1}} onClick={()=>{setRenewPopup(null);setPendingSlot(null);}}>취소</button>
              <button style={{...S.saveBtn,flex:1,background:"#9a5a10"}} onClick={()=>doReserve(pendingSlot,false,true)}>임시 예약</button>
            </div>
          </div>
        </div>
      )}

      {process.env.NODE_ENV === "development" && <Agentation />}
    </div>
  );
}
