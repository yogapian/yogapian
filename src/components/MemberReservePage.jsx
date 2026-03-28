import { useState } from "react";
import { Agentation } from "agentation";
import { FONT, TODAY_STR, TIME_SLOTS, SCHEDULE, DOW_KO, KR_HOLIDAYS } from "../constants.js";
import { parseLocal, fmt, fmtWithDow, addDays, toDateStr } from "../utils.js";
import { calcDL, getClosureExtDays, usedAsOf, getSlotCapacity, holdingElapsed } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";

const DEFAULT_TIMES = {dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};

// ─── 인라인 달력 컴포넌트 ───────────────────────────────────────────────────
function InlineCalendar({selDate, onSelect, onMonthChange, bookings, member, closures, specialSchedules}){
  const [year, setYear] = useState(parseLocal(TODAY_STR).getFullYear());
  const [month, setMonth] = useState(parseLocal(TODAY_STR).getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth}, (_,i) => i+1)];
  const ymStr = `${year}-${String(month+1).padStart(2,'0')}`;

  const myMonthBookings = bookings.filter(b => b.memberId===member.id && b.date.startsWith(ymStr));
  const attendedSet = new Set(myMonthBookings.filter(b=>b.status==="attended"||b.status==="reserved").map(b=>parseLocal(b.date).getDate()));
  const waitingSet  = new Set(myMonthBookings.filter(b=>b.status==="waiting").map(b=>parseLocal(b.date).getDate()));
  const closureSet  = new Set(closures.filter(cl=>cl.date.startsWith(ymStr)&&!cl.timeSlot).map(cl=>parseLocal(cl.date).getDate()));
  const partialSet  = new Set(closures.filter(cl=>cl.date.startsWith(ymStr)&&cl.timeSlot).map(cl=>parseLocal(cl.date).getDate()));

  // 월 이동 시 날짜 선택 초기화
  const prevM = () => { if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); onMonthChange(); };
  const nextM = () => { if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); onMonthChange(); };

  return (
    // ─── 달력 카드 컨테이너 ───
    <div style={{background:"#fff",borderRadius:13,border:"1px solid #e4e0d8",boxShadow:"0 2px 8px rgba(60,50,30,.06)",margin:"6px 14px 8px",overflow:"hidden"}}>

      {/* 월 네비게이션 */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px 6px"}}>
        <button onClick={prevM} style={{background:"none",border:"none",fontSize:22,color:"#555",cursor:"pointer",padding:"4px 10px",lineHeight:1}}>‹</button>{/* ← 이전달 버튼 크기/색상 */}
        <span style={{fontSize:15,fontWeight:700,color:"#1e2e1e"}}>{year}년 {month+1}월</span>{/* ← 년월 텍스트 크기 */}
        <button onClick={nextM} style={{background:"none",border:"none",fontSize:22,color:"#555",cursor:"pointer",padding:"4px 10px",lineHeight:1}}>›</button>{/* ← 다음달 버튼 크기/색상 */}
      </div>

      {/* 요일 헤더 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"0 6px 2px"}}>
        {DOW_KO.map((d,i) => (
          <div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,
            color:i===0?"#e05050":i===6?"#4a70d0":"#9a8e80", /* ← 일=빨강 / 토=파랑 / 평일=회색 */
            padding:"2px 0"}}>{d}</div>
        ))}
      </div>

      {/* 날짜 셀 그리드 */}
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
          const unselectable = isPast; // 과거 날짜만 클릭 불가 — 주말/휴강도 클릭해 안내 표시
          const isAtt = attendedSet.has(day);
          const isWait = waitingSet.has(day) && !isAtt;
          const isOpen = !isPast && !isClosure && sp?.type==="open";
          const isSpecialDay = !isPast && !isClosure && sp?.type==="special";
          const hasDailyNote = !isPast && !isClosure && sp?.dailyNote?.trim();

          // 날짜 숫자 색상 결정
          let numColor = "#1e2e1e";
          if(isToday)            numColor = "#035529";      // ← 오늘 (최우선)
          else if(isClosure)     numColor = "#c97474";   // ← 휴강일 빨강 (선택돼도 유지)
          else if(isPast)        numColor = "#c8c0b0";   // ← 지난날 회색
          else if(isHol||dow===0) numColor = "#e05050";  // ← 공휴일/일요일
          else if(dow===6)       numColor = "#4a70d0";   // ← 토요일 파랑
          else if(noClass)       numColor = "#c8c0b0";   // ← 수업없는날 회색
          else if(isSel)         numColor = "#000000";    // ← 선택된 날

          return (
            <div key={i} onClick={() => !unselectable && onSelect(ds)}
              style={{
                display:"flex",flexDirection:"column",alignItems:"center",
                padding:"0.1px 1px",margin:"1px auto",                              /* ← 셀 크기 조절: padding/margin */
                borderRadius:7,                                               /* ← 셀 라운드 */
                width:"80%",
                background:isSel?"#8989895c":isToday&&!isSel?"#84bf977a":"transparent", /* ← 선택=회색 / 오늘=진초록 */
                cursor:unselectable?"default":"pointer",userSelect:"none"
              }}>

              {/* 날짜 숫자 */}
              <span style={{
                display:"inline-flex",alignItems:"center",justifyContent:"center",
                minWidth:24,height:22,padding:"0 3px",
                fontSize:13,fontWeight:isSel||isToday?700:400,
                color:numColor,lineHeight:1,
                background:isAtt&&!isSel&&!isToday?"#f1faeb":"transparent", /* ← 출석한날만 연노랑 유지 */
                borderRadius:5,
                textDecoration:isClosure?"line-through":"none"               /* ← 휴강일 취소선 (선택돼도 유지) */
              }}>
                {day}
              </span>

              {/* 날짜 아래 인디케이터 뱃지 */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0,marginTop:-3,minHeight:10}}>
                {isToday    && <span style={{fontSize:8,color:"#284f36",fontWeight:600,lineHeight:0.8}}>오늘</span>}
                {isWait     && <span style={{fontSize:8,color:"#e8a020",lineHeight:1.2}}>▲</span>}
                {isClosure && <span style={{fontSize:8,color:"#a83030",background:"#fde8e8",borderRadius:3,padding:"0.2px 0.5px",fontWeight:700,lineHeight:0.8}}>휴강</span>}{/* ← 휴강 뱃지 텍스트/배경색 */}
                {isPartial  && <span style={{fontSize:8,color:"#c97050",background:"#fdf0ec",borderRadius:3,padding:"0px 3px",fontWeight:700,lineHeight:0.8}}>부분</span>}
                {isOpen     && <span style={{fontSize:8,color:"#1a6e4a",background:"#d8f5ec",borderRadius:3,padding:"0px 3px",fontWeight:700,lineHeight:0.8}}>오픈</span>}
                {isSpecialDay && <span style={{fontSize:8,color:"#5a3a9a",background:"#ede8fa",borderRadius:3,padding:"0px 3px",fontWeight:700,lineHeight:0.8}}>집중</span>}
                {hasDailyNote && <span style={{fontSize:9,lineHeight:1}}>📢</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 회원 예약 페이지 ────────────────────────────────────────────────────────
export default function MemberReservePage({member,bookings,setBookings,setMembers,setNotices,specialSchedules,closures,scheduleTemplate}){
  const [selDate, setSelDate] = useState(null); // null = 날짜 미선택 상태 (슬롯 숨김)
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [pendingSlot, setPendingSlot] = useState(null);
  const [renewPopup, setRenewPopup] = useState(null);

  const closuresCxt = useClosures();

  // selDate가 있을 때만 계산 (null이면 기본값)
  const dow         = selDate ? parseLocal(selDate).getDay() : -1;
  const special     = selDate ? specialSchedules.find(s => s.date===selDate) : null;
  const isWeekend   = dow===0||dow===6;
  const isSpecial   = !!special;
  const isOpen      = special?.type==="open";
  const isRegular   = special?.type==="regular";
  const dayClosure  = selDate ? closures.find(cl=>cl.date===selDate&&!cl.timeSlot) : null;
  const getSlotClosure = k => selDate ? closures.find(cl=>cl.date===selDate&&cl.timeSlot===k) : null;
  const hasTimeChange  = isRegular && special?.activeSlots?.some(k=>special.customTimes?.[k]&&special.customTimes[k]!==DEFAULT_TIMES[k]);

  const memberDl      = calcDL(member, closuresCxt);
  const memberExpired = memberDl < 0;
  const usedCnt       = usedAsOf(member.id, TODAY_STR, bookings, [member]);
  const rem           = memberExpired ? 0 : Math.max(0, member.total - usedCnt);

  // 다가오는 예약 — 취소되지 않은, 오늘 이후(오늘 출석완료 제외)의 가장 빠른 예약
  const upcomingBooking = [...bookings]
    .filter(b =>
      b.memberId===member.id &&
      b.status!=="cancelled" &&
      b.date>=TODAY_STR &&
      !(b.status==="attended" && b.date===TODAY_STR) // 오늘 이미 출석한 건 제외
    )
    .sort((a,b) => a.date.localeCompare(b.date)||(a.id-b.id))[0];
  const upcomingSlot = upcomingBooking ? TIME_SLOTS.find(t=>t.key===upcomingBooking.timeSlot) : null;
  const upcomingText = upcomingBooking ? `${fmtWithDow(upcomingBooking.date)} ${upcomingSlot?.label||''} ${upcomingSlot?.time||''}`.trim() : null;
  const upcomingCap = upcomingBooking ? getSlotCapacity(upcomingBooking.date,upcomingBooking.timeSlot,specialSchedules,scheduleTemplate) : 0;
  const upcomingCnt = upcomingBooking ? bookings.filter(b=>b.date===upcomingBooking.date&&b.timeSlot===upcomingBooking.timeSlot&&(b.status==="attended"||b.status==="reserved")).length : 0;
  const upcomingWaitRank = (upcomingBooking?.status==="waiting") ? (()=>{const ws=bookings.filter(b=>b.date===upcomingBooking.date&&b.timeSlot===upcomingBooking.timeSlot&&b.status==="waiting").sort((a,b)=>a.id-b.id);return ws.findIndex(b=>b.id===upcomingBooking.id)+1;})() : 0;

  const getSlots = () => {
    if(!selDate) return [];
    if(isSpecial) return TIME_SLOTS.filter(s=>special.activeSlots.includes(s.key)).map(s=>({...s, time:special.customTimes?.[s.key]||s.time}));
    if(isWeekend) return [];
    if(Array.isArray(scheduleTemplate)&&scheduleTemplate.length>0){
      const active=scheduleTemplate.filter(e=>e.days.includes(dow)&&(!e.startDate||selDate>=e.startDate)&&(!e.endDate||selDate<=e.endDate));
      if(active.length) return active.map(e=>{const base=TIME_SLOTS.find(t=>t.key===e.slotKey)||TIME_SLOTS[1];return{...base,time:e.time||base.time};});
    }
    if(selDate<"2026-05-01") return TIME_SLOTS.filter(s=>SCHEDULE[dow]?.includes(s.key));
    return [];
  };
  const slots    = getSlots();
  const dayActive = selDate ? bookings.filter(b=>b.date===selDate&&b.status!=="cancelled") : [];

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
    setBookings(p=>[...p,{id:nid,date:selDate,memberId:member.id,timeSlot:slotKey,walkIn:false,status:isWaiting?"waiting":"reserved",cancelNote:"",cancelledBy:"",...(renewalPending?{renewalPending:true}:{})}]);
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
    // ─── 페이지 최외곽 컨테이너 ───
    <div style={{maxWidth:520,margin:"0 auto",width:"100%",fontFamily:FONT,paddingBottom:80}}>

      {/* ─── 홀딩 배너 ─────────────────────────────────────── */}
      {member.holding&&(
        <div style={{margin:"0 14px 9px",borderRadius:12,background:"#edf0f8",border:"1.5px solid #a0b0d0",padding:"12px 14px"}}>{/* ← 홀딩 카드: 배경/테두리색 */}
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20,flexShrink:0}}>⏸️</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:"#3d5494"}}>홀딩 중</div>{/* ← 홀딩 타이틀 색상 */}
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

      {/* ─── 다가오는 예약 카드 (항상 표시) ────────────────── */}
      <div style={{margin:"0 14px 8px",borderRadius:12,background:"#fff8ee",border:"1.5px solid #f0c888",padding:"7px 14px"}}>{/* ← 카드 배경(연한주황)/테두리색 */}
        <div style={{fontSize:13,fontWeight:700,color:"#a06010",marginBottom:1}}>ℹ️ 다가오는 예약</div>{/* ← 타이틀 크기/색상 */}
        {upcomingBooking ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
            <div style={{flex:1,minWidth:0}}>
              {/* ← 날짜·슬롯 + 잔여석/대기: 한 줄, 이탤릭·색상·크기 */}
              <div style={{fontSize:11,color:"#7a5010",fontStyle:"italic",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {upcomingText}{" ———— "}{upcomingBooking.status==="waiting"?`대기 ${upcomingWaitRank}번째`:`잔여 ${Math.max(0,upcomingCap-upcomingCnt)}/${upcomingCap}명`}
              </div>
            </div>
            {/* ← 예약취소 버튼 색상/크기 */}
            <button onClick={()=>setConfirmCancel(upcomingBooking.id)} style={{flexShrink:0,background:"none",border:"1px solid #e8a0a0",borderRadius:8,padding:"5px 14px",fontSize:11,fontWeight:700,color:"#c97474",cursor:"pointer",fontFamily:FONT,alignSelf: "flex-start",marginTop: -10}}>예약취소</button>
          </div>
        ) : (
          /* ← 예약 없을 때 안내 텍스트 색상 */
          <div style={{fontSize:11,color:"#c0a870",fontStyle:"italic"}}>예약이 없습니다.</div>
        )}
      </div>

      {/* ─── 인라인 달력 ────────────────────────────────────── */}
      <InlineCalendar
        selDate={selDate}
        onSelect={setSelDate}
        onMonthChange={()=>setSelDate(null)}
        bookings={bookings}
        member={member}
        closures={closures}
        specialSchedules={specialSchedules}
      />

      {/* ─── 날짜 선택 시에만 표시 (슬롯 영역) ─────────────── */}
      {selDate&&(
        <div style={{padding:"0 14px 8px"}}>

          {/* 수업 없는 날 (주말 또는 슬롯 0개인 날) */}
          {!dayClosure&&!isOpen&&!(isSpecial&&special?.type==="special")&&slots.length===0&&(
            <div style={{textAlign:"center",padding:"32px 0",color:"#b0a090"}}>
              <div style={{fontSize:28,marginBottom:8}}>🌿</div>
              <div style={{fontSize:13}}>이 날은 수업이 없습니다.</div>
            </div>
          )}

          {/* 오픈클래스 안내 */}
          {isOpen&&(
            <div style={{background:"#d8f5ec",border:"1.5px solid #7acca0",borderRadius:12,padding:"11px 14px",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:20}}>🍀</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#1a6e4a"}}>오픈클래스</div>
                <div style={{fontSize:11,color:"#1a5a3a",marginTop:2}}>{special.label}</div>
                {special.feeNote&&<div style={{fontSize:11,color:"#1a5a3a"}}>{special.feeNote}</div>}
              </div>
            </div>
          )}

          {/* 집중수련 안내 */}
          {isSpecial&&!isOpen&&special?.type==="special"&&(
            <div style={{background:"linear-gradient(135deg,#f0edff,#e8e2ff)",border:"1.5px solid #a090d0",borderRadius:12,padding:"11px 14px",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:20}}>⚡️</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#4a2e8a"}}>집중수련</div>
                <div style={{fontSize:11,color:"#7a5aaa",marginTop:2}}>{special.label}</div>
                {special.feeNote&&<div style={{fontSize:11,color:"#6a4aaa"}}>{special.feeNote}</div>}
              </div>
            </div>
          )}

          {/* 전체 휴강 안내 */}
          {dayClosure&&(
            <div style={{background:"#fff3f0",border:"1px solid #f0b0a0",borderRadius:12,padding:"12px 16px",display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:20}}>🔕</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#8e3030"}}>전체 휴강</div>
                <div style={{fontSize:12,color:"#9a5a50",marginTop:2}}>{dayClosure.reason}</div>
              </div>
            </div>
          )}

          {/* ─── 타임슬롯 가로 나열 ───────────────────────────── */}
          {!member.holding&&!dayClosure&&(
            <div style={{display:"flex",flexDirection:"row",gap:6,overflowX:"auto",paddingBottom:4}}>{/* ← 가로 나열, 스크롤 가능 */}
            {slots.filter(slot=>{
              if(selDate!==TODAY_STR) return true;
              const now=new Date();
              const H={dawn:6,morning:8,lunch:11,afternoon:14,evening:19}[slot.key]||0;
              const M={dawn:30,morning:30,lunch:50,afternoon:0,evening:30}[slot.key]||0;
              return now.getHours()*60+now.getMinutes()<H*60+M;
            }).map(slot=>{
              const slCl     = getSlotClosure(slot.key);
              const cnt      = slotActiveCount(slot.key);
              const waitCnt  = slotWaitCount(slot.key);
              const cap      = getSlotCapacity(selDate,slot.key,specialSchedules,scheduleTemplate);
              const remaining = cap-cnt;
              const myB      = mySlot(slot.key);
              const isMyWait = myB?.status==="waiting";
              const isMyRes  = myB&&!isMyWait;
              const isFull   = remaining<=0;
              const myRank   = isMyWait?waitingRank(slot.key):0;
              const isChg    = isRegular&&DEFAULT_TIMES[slot.key]&&slot.time!==DEFAULT_TIMES[slot.key];

              return (
                // ─── 타임슬롯 카드 ───
                <div key={slot.key} style={{
                  flex: "0 0 calc(25% - 5px)",                          /* ← 항상 4타임 기준 폭 고정 */
                  width: "calc(25% - 5px)",                             /* ← 수업 수 무관하게 고정 폭 */
                  background:  slCl?"#f5f0ee":"#ffffffb8",              /* ← 카드 배경: 휴강=연회색 / 기본=슬롯 고유색 */
                  borderRadius: 11,                                     /* ← 카드 모서리 둥글기 */
                  border: `1.5px solid ${slCl?"#f0b0a0":isMyRes?"#2e6e44":isMyWait?"#e8c44a":"#e8e4dc"}`, /* ← 테두리: 휴강/내예약/대기/기본 */
                  overflow: "hidden",
                  boxShadow: isMyRes?"0 0 0 2px rgba(46,110,68,.1)":isMyWait?"0 0 0 2px rgba(232,196,74,.15)":"none" /* ← 예약됨·대기 강조 그림자 */
                }}>
                  <div style={{padding:"10px 6px 8px"}}>{/* ← 카드 내부 패딩 */}

                    {/* 줄 1: 이모지 + 시간 한 줄 */}
                    <div style={{textAlign:"center",marginBottom:-1}}>
                      <span style={{fontSize:14,lineHeight:1,marginRight:3}}>{/* ← 이모지 크기 */}{slot.icon}</span>
                      <span style={{fontSize:14,fontWeight:700,color:slCl?"#9a8e80":"#3f3f3f"}}>{/* ← 시간 색상·크기 */}
                        {isChg
                          ? <><s style={{color:"#c0b0b0",fontWeight:400}}>{DEFAULT_TIMES[slot.key]}</s><span style={{color:"#c97474"}}> {slot.time}</span></>
                          : slot.time
                        }
                      </span>
                    </div>

                    {/* 줄 2: 잔여석 or 내예약/대기 뱃지 */}
                    <div style={{textAlign:"center",marginBottom:6}}>
                      {isMyRes
                        ? <span style={{fontSize:9,background:"#e8f5ee",color:"#2e6e44",borderRadius:6,padding:"2px 6px",fontWeight:700}}>내 예약</span>/* ← 내예약 뱃지 색상 */
                        : isMyWait
                        ? <span style={{fontSize:9,background:"#fffaeb",color:"#9a5a10",borderRadius:6,padding:"2px 6px",fontWeight:700}}>대기 {myRank}번</span>/* ← 대기 뱃지 색상 */
                        : <span style={{fontSize:9,color:slCl?"#b0a090":isFull?"#c97474":remaining<=2?"#9a5a10":"#a0988e", padding: "2px 4px"}}>{/* ← 잔여석: 마감=빨강/촉박=주황/여유=회색 */}
                            {slCl?`🔕 휴강`:isFull?`마감·대기 ${waitCnt}명`:`잔여 ${remaining}/${cap}명`}
                          </span>
                      }
                    </div>

                    {/* 줄 3: 액션 버튼 */}
                    {slCl?(
                      <span style={{fontSize:10,color:"#9a8e80",fontWeight:700,display:"block",textAlign:"center"}}>휴강</span>
                    ):isMyRes?(
                      <button onClick={()=>setConfirmCancel(myB.id)} style={{width:"100%",background:"none",border:"1px solid #e8a0a0",borderRadius:7,padding:"6px 0",fontSize:12,fontWeight:700,color:"#c97474",cursor:"pointer",fontFamily:FONT}}>예약취소</button>/* ← 취소버튼 */
                    ):isMyWait?(
                      <button onClick={()=>setConfirmCancel(myB.id)} style={{width:"100%",background:"none",border:"1px solid #e8c44a",borderRadius:7,padding:"6px 0",fontSize:12,fontWeight:700,color:"#9a5a10",cursor:"pointer",fontFamily:FONT}}>대기취소</button>
                    ):isFull?(
                      <button onClick={()=>tryReserve(slot.key,true)} style={{width:"100%",background:"#fdf3e3",border:"1px solid #e8c44a",borderRadius:7,padding:"6px 0",fontSize:12,fontWeight:700,color:"#9a5a10",cursor:"pointer",fontFamily:FONT}}>대기</button>/* ← 대기버튼 */
                    ):(
                      <button onClick={()=>tryReserve(slot.key)} style={{width:"100%",background:"#5a6a8a",border:"none",borderRadius:7,padding:"6px 0",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:FONT}}>예약하기</button>/* ← 예약버튼 배경색 */
                    )}
                  </div>

                  {/* 진행률 바 */}
                  {!slCl&&(
                    <div style={{height:2,background:"rgba(0,0,0,0.06)"}}>{/* ← 진행바 트랙 높이/색 */}
                      <div style={{height:"100%",width:`${Math.min(100,cnt/cap*100)}%`,
                        background:isFull?"#c97474":remaining<=2?"#e8c44a":"#4a9e68", /* ← 마감=빨강 / 촉박=노랑 / 여유=초록 */
                        transition:"width .3s",borderRadius:"0 2px 2px 0"}}/>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* ─── 예약 취소 확인 모달 ────────────────────────────── */}
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

      {/* ─── 마지막 1회 팝업 ────────────────────────────────── */}
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

      {/* ─── 잔여 0회/만료 팝업 ─────────────────────────────── */}
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
