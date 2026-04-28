// ─── MemberReservePage.jsx ───────────────────────────────────────────────────
// 회원이 보는 예약 페이지 (로그인한 회원 전용 화면)
// 구성: 홀딩 배너 → 다가오는 예약 카드 → 인라인 달력 → 타임슬롯 카드 → 모달들
//
// 슬롯 카드 액션 버튼 흐름:
//   예약하기 → tryReserve → (잔여0이면 needRenewal팝업, 잔여1이면 last1팝업, 정상이면) doReserve
//   예약취소 → setConfirmCancel → cancelBooking → 대기자 자동 승격
//   대기 → tryReserve(isWaiting=true) → doReserve(status="waiting")
//
// 달력 날짜 선택 → selDate 변경 → 슬롯 영역 표시
// 월 이동 → selDate 초기화 (슬롯 숨김)

import { useState } from "react";
import { Agentation } from "agentation";
import { FONT, TODAY_STR, TIME_SLOTS, SCHEDULE, DOW_KO, KR_HOLIDAYS } from "../constants.js";
// broadcastAdminNotif는 App.jsx에서 onBookingNotif prop으로 전달받음 (채널 단일 인스턴스 유지)
import { parseLocal, fmt, fmtWithDow, addDays, toDateStr } from "../utils.js";
import { calcDL, getClosureExtDays, usedAsOf, activePeriodTotal, getSlotCapacity, holdingElapsed } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";

// 슬롯 기본 시간 (수업설정으로 변경된 경우와 비교해 취소선 표시에 사용)
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
  // attendedSet: 실제 출석 완료된 날짜 (과거 원형 표시에 사용)
  const attendedSet = new Set(myMonthBookings.filter(b=>b.status==="attended").map(b=>parseLocal(b.date).getDate()));
  // reservedSet: 예약됐으나 아직 출석 전인 날짜 (미래 초록 점 표시에 사용)
  const reservedSet = new Set(myMonthBookings.filter(b=>b.status==="reserved").map(b=>parseLocal(b.date).getDate()));
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
          const isAtt  = attendedSet.has(day);                   // 출석 완료 (과거)
          const isRes  = reservedSet.has(day) && !isAtt;        // 예약됨 + 아직 출석 전 (미래 초록 점)
          const isWait = waitingSet.has(day) && !isAtt && !isRes; // 대기 중 (삼각형)
          const isOpen = !isPast && !isClosure && sp?.type==="open";
          const isSpecialDay = !isPast && !isClosure && sp?.type==="special";
          const hasDailyNote = !isPast && !isClosure && sp?.dailyNote?.trim();

          // 날짜 숫자 색상 결정
          let numColor = "#1e2e1e";
          if(isToday)            numColor = "#ffffff";      // ← 오늘: solid 초록 배경 위 흰 글씨
          else if(isPast)        numColor = "#c8c0b0";   // ← 지난날 회색
          else if(isClosure)     numColor = "#939393";   // ← 휴강일 회색 
          else if(isHol||dow===0) numColor = "#e05050";  // ← 공휴일/일요일
          else if(dow===6)       numColor = "#4a70d0";   // ← 토요일 파랑
          else if(noClass)       numColor = "#c8c0b0";   // ← 수업없는날 회색
          else if(isSel)         numColor = "#1a3a8a";    // ← 선택된 날: 블루톤

          return (
            <div key={i} onClick={() => !unselectable && onSelect(ds)}
              style={{
                display:"flex",flexDirection:"column",alignItems:"center",
                padding:"0.1px 1px",margin:"1px auto",                              /* ← 셀 크기 조절: padding/margin */
                borderRadius:7,                                               /* ← 셀 라운드 */
                width:"80%",
                // 오늘=solid진초록(선택여부 무관) / 선택=연파랑 / 나머지=transparent
                background: isToday?"#2e6e44":isSel?"#dce8ff":"transparent",
                cursor:unselectable?"default":"pointer",userSelect:"none"
              }}>

              {/* 날짜 숫자 + 출석 이모지 오버레이 */}
              <div style={{
                position:"relative",
                display:"inline-flex",alignItems:"center",justifyContent:"center",
                width:24,height:24,
              }}>
                <span style={{
                  fontSize:13,fontWeight:isSel||isToday?700:400,
                  color:numColor,lineHeight:1,
                  textDecoration:isClosure?"line-through":"none"
                }}>
                  {day}
                </span>
                {/* 출석 이모지: 숫자 뒤에 겹쳐서 표시 / opacity로 투명도 조절 */}
                {isAtt && (
                  <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,opacity:0.3,pointerEvents:"none"}}>🌀</span>
                )}
              </div>

              {/* 날짜 아래 인디케이터
                  - 배지 세로정렬: height+alignItems:"center"로 고정 (lineHeight:1+marginTop 핵 제거)
                  - "오늘": 다른 상태 배지가 없을 때만 흰 글씨로 표시 */}
              <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,minHeight:11}}>

                {/* 출석 완료: 숫자 위 오버레이로 이동 — 여기선 표시 안 함 */}
                {isWait     && <span style={{fontSize:6,color:"#e8a020",marginTop:-1}}>▲</span>}
                {isRes      && <span style={{fontSize:6,color:"#5a86e5",marginTop:-1}}>●</span>}
                {/* 📢: 다른 상태 배지 없을 때만 표시 (배지와 중복 시 제거) */}
                {hasDailyNote&&!isClosure&&!isPartial&&!isOpen&&!isSpecialDay&&<span style={{fontSize:8,marginTop:-5}}>📢</span>}
                {/* 오늘: 다른 상태 배지 없을 때만 흰 글씨 */}
                {isToday&&!isClosure&&!isPartial&&!isOpen&&!isSpecialDay&&!hasDailyNote&&(
                  <span style={{fontSize:7,color:"rgba(255,255,255,0.88)",fontWeight:700,height:10,marginTop:-2}}>오늘</span>
                )}

                {/* 상태 배지: fontSize 오늘과 동일하게 7로 통일 */}
                {isClosure  && <span style={{fontSize:7,color:"#a83030",background:"#fde8e8",borderRadius:3,padding:"0 3px",fontWeight:700,height:10,marginTop:-2}}>휴강</span>}
                {isPartial  && <span style={{fontSize:7,color:"#c97050",background:"#fdf0ec",borderRadius:3,padding:"0 3px",fontWeight:700,height:10,marginTop:-2}}>부분</span>}
                {isOpen     && <span style={{fontSize:7,color:"#1a6e4a",background:"#d8f5ec",borderRadius:3,padding:"0 3px",fontWeight:700,height:10,marginTop:-2}}>오픈</span>}
                {isSpecialDay&&<span style={{fontSize:7,color:"#5a3a9a",background:"#ede8fa",borderRadius:3,padding:"0 3px",fontWeight:700,height:10,marginTop:-2}}>집중</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 회원 예약 페이지 ────────────────────────────────────────────────────────
export default function MemberReservePage({member,bookings,setBookings,setMembers,setNotices,specialSchedules,closures,scheduleTemplate,onBookingNotif}){
  // ── State ──────────────────────────────────────────────────────────────────
  const [selDate, setSelDate] = useState(TODAY_STR);  // 로그인 시 오늘 날짜 자동 선택 (달력 월 이동 시 null로 리셋)
  const [confirmCancel, setConfirmCancel] = useState(null); // 취소 확인 모달: null 또는 bookingId
  const [pendingSlot, setPendingSlot] = useState(null);     // 팝업 확인 후 예약할 slotKey 임시 저장
  const [renewPopup, setRenewPopup] = useState(null); // "last1"=마지막1회 / "needRenewal"=잔여0/만료

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
  // activePeriodTotal: 이월 배분 포함 유효 기수 총 횟수 (사전 갱신 시 다음 기수 자동 반영)
  const periodTotal   = activePeriodTotal(member, TODAY_STR, bookings, [member]);
  const rem           = memberExpired ? 0 : Math.max(0, periodTotal - usedCnt);

  // 현재 KST 시각 (분 단위) — 오늘 지난 슬롯 필터에 사용
  const _kstNow = new Date(new Date().getTime()+9*3600*1000);
  const _nowMin = _kstNow.getUTCHours()*60+_kstNow.getUTCMinutes();

  // 다가오는 예약 — 취소되지 않은, 오늘 이후(오늘 출석완료·지난 슬롯 제외)의 가장 빠른 예약
  const upcomingBooking = [...bookings]
    .filter(b => {
      if(b.memberId!==member.id||b.status==="cancelled"||b.date<TODAY_STR) return false;
      if(b.status==="attended"&&b.date===TODAY_STR) return false; // 오늘 출석 완료 제외
      // 오늘 수업이면 슬롯 시간이 지났는지 확인 — 지난 슬롯은 제외
      if(b.date===TODAY_STR){
        const slotTime=TIME_SLOTS.find(t=>t.key===b.timeSlot)?.time;
        if(slotTime){const[sh,sm]=slotTime.split(":").map(Number);if(sh*60+sm<=_nowMin)return false;}
      }
      return true;
    })
    .sort((a,b) => a.date.localeCompare(b.date)||(a.id-b.id))[0];
  const upcomingSlot = upcomingBooking ? TIME_SLOTS.find(t=>t.key===upcomingBooking.timeSlot) : null;
  const upcomingText = upcomingBooking ? `${fmtWithDow(upcomingBooking.date)} ${upcomingSlot?.label||''} ${upcomingSlot?.time||''}`.trim() : null;
  const upcomingCap = upcomingBooking ? getSlotCapacity(upcomingBooking.date,upcomingBooking.timeSlot,specialSchedules,scheduleTemplate) : 0;
  const upcomingCnt = upcomingBooking ? bookings.filter(b=>b.date===upcomingBooking.date&&b.timeSlot===upcomingBooking.timeSlot&&(b.status==="attended"||b.status==="reserved")).length : 0;
  // 대기 포함 총 인원 (정원 초과 시 11/10석 표시용)
  const upcomingWaitCnt = upcomingBooking ? bookings.filter(b=>b.date===upcomingBooking.date&&b.timeSlot===upcomingBooking.timeSlot&&b.status==="waiting").length : 0;
  const upcomingWaitRank = (upcomingBooking?.status==="waiting") ? (()=>{const ws=bookings.filter(b=>b.date===upcomingBooking.date&&b.timeSlot===upcomingBooking.timeSlot&&b.status==="waiting").sort((a,b)=>a.id-b.id);return ws.findIndex(b=>b.id===upcomingBooking.id)+1;})() : 0;

  // 날짜에 매칭되는 템플릿 항목 (endDate null=무기한 제외, startDate/endDate 모두 명시된 항목만 "등록됨"으로 간주)
  const activeTemplate = selDate && Array.isArray(scheduleTemplate) && scheduleTemplate.length>0
    ? scheduleTemplate.filter(e=>e.days.includes(dow)&&(!e.startDate||selDate>=e.startDate)&&(!e.endDate||selDate<=e.endDate))
    : [];
  // 미래 날짜(>=LEGACY_END)에서 "스케줄 미등록" 여부: 명시적 endDate 없는 무기한 항목만 매칭되는 경우도 미등록으로 처리
  const hasExplicitCoverage = activeTemplate.some(e=>e.endDate&&selDate<=e.endDate);
  const isUnscheduled = selDate && selDate>="2026-05-01" && !isWeekend && !isSpecial && !dayClosure
    && (!Array.isArray(scheduleTemplate)||scheduleTemplate.length===0||!hasExplicitCoverage);

  const getSlots = () => {
    if(!selDate) return [];
    if(isSpecial) return TIME_SLOTS.filter(s=>special.activeSlots.includes(s.key)).map(s=>({...s, time:special.customTimes?.[s.key]||s.time}));
    if(isWeekend) return [];
    if(activeTemplate.length) return activeTemplate.map(e=>{const base=TIME_SLOTS.find(t=>t.key===e.slotKey)||TIME_SLOTS[1];return{...base,time:e.time||base.time};});
    if(selDate<"2026-05-01") return TIME_SLOTS.filter(s=>SCHEDULE[dow]?.includes(s.key));
    return [];
  };
  const slots    = getSlots();
  const dayActive = selDate ? bookings.filter(b=>b.date===selDate&&b.status!=="cancelled") : [];
  // 내 예약이 있는데 시간표에 없는 슬롯 → 시간표 변경으로 사라지지 않도록 보정해서 표시
  const myOrphanSlots = selDate ? dayActive
    .filter(b=>b.memberId===member.id&&!slots.some(s=>s.key===b.timeSlot))
    .map(b=>TIME_SLOTS.find(t=>t.key===b.timeSlot)).filter(Boolean) : [];
  const allSlots = [...slots, ...myOrphanSlots];

  function slotActiveCount(k){ return dayActive.filter(b=>b.timeSlot===k&&(b.status==="attended"||b.status==="reserved")).length; }
  function slotWaitCount(k){ return dayActive.filter(b=>b.timeSlot===k&&b.status==="waiting").length; }
  function mySlot(k){ return dayActive.find(b=>b.memberId===member.id&&b.timeSlot===k); }
  function waitingRank(k){
    const waiters = dayActive.filter(b=>b.timeSlot===k&&b.status==="waiting").sort((a,b)=>a.id-b.id);
    const idx = waiters.findIndex(b=>b.memberId===member.id);
    return idx>=0?idx+1:0;
  }

  // ── tryReserve: 예약하기/대기 버튼 클릭 시 진입점 ───────────────────────
  // 이미 예약됨 / 슬롯휴강 / 전일휴강이면 무시
  // 정원 초과이면서 isWaiting=false이면 무시 (대기 버튼만 통과)
  // 잔여 0 or 만료 → needRenewal 팝업 / 잔여 1 → last1 팝업 / 정상 → doReserve 바로 호출
  function tryReserve(slotKey, isWaiting=false){
    if(mySlot(slotKey)||getSlotClosure(slotKey)||dayClosure) return;
    if(!isWaiting && slotActiveCount(slotKey)>=getSlotCapacity(selDate,slotKey,specialSchedules,scheduleTemplate)) return;
    if(isWaiting){ doReserve(slotKey,true,false); return; }
    // 예약 날짜(selDate) 기준 잔여 계산 — 이월 배분으로 미래 기수 자동 반영
    const selDateUsed = usedAsOf(member.id, selDate, bookings, [member]);
    const selDateTotal = activePeriodTotal(member, selDate, bookings, [member]);
    const selDateRem = memberExpired ? 0 : Math.max(0, selDateTotal - selDateUsed);
    if(selDateRem===0||memberExpired){ setPendingSlot(slotKey); setRenewPopup("needRenewal"); return; }
    if(selDateRem===1){ setPendingSlot(slotKey); setRenewPopup("last1"); return; }
    doReserve(slotKey,false,false);
  }

  // ── doReserve: booking을 실제로 생성 ─────────────────────────────────────
  // renewalPending=true면 갱신 필요 임시예약 (관리자가 갱신 처리할 때까지 표시됨)
  // nid는 updater 내부(p)에서 계산 → 동시 예약 시 stale closure로 인한 ID 충돌 방지
  function doReserve(slotKey, isWaiting, renewalPending){
    setBookings(p=>{
      const nid = Math.max(Date.now(), Math.max(...p.map(b=>b.id),0)+1); // Date.now()로 ID 충돌 방지
      return [...p,{id:nid,date:selDate,memberId:member.id,timeSlot:slotKey,walkIn:false,status:isWaiting?"waiting":"reserved",cancelNote:"",cancelledBy:"",...(renewalPending?{renewalPending:true}:{})}];
    });
    // 관리자 알림 브로드캐스트 — slots(커스텀시간 포함) 우선, 없으면 TIME_SLOTS 기본값
    const _slotObj = slots.find(s=>s.key===slotKey) || TIME_SLOTS.find(s=>s.key===slotKey);
    onBookingNotif?.({
      event: isWaiting ? "waiting" : "reserve",
      memberName: member.name,
      slotKey,
      slotIcon:  TIME_SLOTS.find(s=>s.key===slotKey)?.icon || "📍",
      slotLabel: TIME_SLOTS.find(s=>s.key===slotKey)?.label || slotKey,
      slotTime:  _slotObj?.time  || "",
      date: selDate,
    });
    setPendingSlot(null); setRenewPopup(null);
  }

  // ── cancelBooking: 예약 취소 + 대기자 자동 승격 ──────────────────────────
  // reserved/attended 취소 시 대기 1번 → status="reserved"로 자동 변경 + 공지 생성
  // (attended가 아닌 reserved: 미래 수업은 출석 미완료 상태로 승격해야 usedAsOf 집계 오류 방지)
  function cancelBooking(bId){
    const cancelled = bookings.find(b=>b.id===bId);
    if(!cancelled) return;
    const slotKey = cancelled.timeSlot;
    // 공지에 날짜+슬롯명+시간 모두 포함하기 위해 슬롯 객체 전체 사용
    const slotObj = TIME_SLOTS.find(t=>t.key===slotKey);
    const slotLabel = slotObj?.label||"";
    const slotTime  = slotObj?.time||"";
    const isConfirmed = cancelled.status==="attended"||cancelled.status==="reserved";
    const firstWaiter = isConfirmed
      ? bookings.filter(b=>b.date===cancelled.date&&b.timeSlot===slotKey&&b.status==="waiting"&&b.id!==bId).sort((a,b)=>a.id-b.id)[0]
      : null;
    setBookings(p=>{
      const next = p.map(b=>b.id===bId?{...b,status:"cancelled",cancelledBy:"member"}:b);
      return firstWaiter?next.map(b=>b.id===firstWaiter.id?{...b,status:"reserved"}:b):next;
    });
    // 관리자 알림 브로드캐스트 (App.jsx 단일 채널 인스턴스 사용)
    const _slotObj2 = TIME_SLOTS.find(s=>s.key===cancelled.timeSlot);
    onBookingNotif?.({
      event: "cancel",
      memberName: member.name,
      slotKey: cancelled.timeSlot,
      slotIcon:  _slotObj2?.icon  || "📍",
      slotLabel: _slotObj2?.label || cancelled.timeSlot,
      slotTime:  _slotObj2?.time  || "",
      date: cancelled.date,
    });
    if(firstWaiter){
      // 공지: 날짜 줄바꿈 후 메시지 (팝업 2줄 표시용)
      setNotices(prev=>[{id:Date.now(),title:`✅예약확정✅`,content:`${fmtWithDow(cancelled.date)}\n수업 예약이 확정되었습니다.`,pinned:false,createdAt:TODAY_STR,targetMemberId:firstWaiter.memberId},...(prev||[])]);
    }
    setConfirmCancel(null);
  }

  // ── resumeHolding: 홀딩 복귀 버튼 클릭 시 (3개월권만 가능) ──────────────
  // 홀딩 종료일 = 첫 수업일(selDate) 전날 — 버튼 누른 날 기준이 아님
  // ex) 4/14에 버튼 눌러 4/15 예약 → endDate=4/14 / 4/15 당일 예약 → endDate=4/14
  function resumeHolding(){
    if(!member.holding||!setMembers) return;
    const startStr = member.holding.startDate;
    // 홀딩 일수: 시작일 ~ (selDate 전날)까지 평일수
    const holdEnd = selDate ? addDays(selDate, -1) : addDays(TODAY_STR, -1);
    let count = 0;
    let cur = parseLocal(startStr);
    const end = parseLocal(holdEnd);
    while(cur <= end){ const dow=cur.getDay(); if(dow!==0&&dow!==6) count++; cur.setDate(cur.getDate()+1); }
    setMembers(p=>p.map(m=>{
      if(m.id!==member.id) return m;
      const hist={startDate:m.holding.startDate,endDate:holdEnd,workdays:count};
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
              {/* 대기 상태: "대기 신청 N번" / 예약 상태: "잔여 N/M명" */}
              {/* ← 날짜·슬롯 텍스트 + 구분자 + 잔여석/대기순번 */}
              <div style={{fontSize:11,color:"#7a5010",fontStyle:"italic",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {upcomingText}{" —— "}{upcomingBooking.status==="waiting"?`대기 신청 ${upcomingWaitRank}번`:`${upcomingCnt+upcomingWaitCnt}/${upcomingCap}석`}
              </div>
            </div>
            {/* 취소 버튼: 예약/대기 구분 없이 "취소"로 통일 / 그레이톤 — border #c0bdb8 / color #8a8480 */}
            <button onClick={()=>setConfirmCancel(upcomingBooking.id)} style={{flexShrink:0,background:"none",border:"1px solid #c0bdb8",borderRadius:8,padding:"5px 14px",fontSize:11,fontWeight:700,color:"#8a8480",cursor:"pointer",fontFamily:FONT,alignSelf: "flex-start",marginTop: -10}}>취소</button>
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

          {/* 날짜 헤더: 선택된 날짜 + 상태 뱃지 (오늘/휴강/오픈/집중/부분) */}
          <div style={{fontSize:14,fontWeight:700,color:"#3a4a3a",padding:"6px 2px 6px",display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
            <span style={{color:"#9a8e80",fontSize:12,fontWeight:400}}>📅</span>
            {fmt(selDate)}<span style={{fontSize:12,color:"#9a8e80",fontWeight:400}}>({DOW_KO[parseLocal(selDate).getDay()]})</span>
            {/* 상태 배지: 달력 인디케이터와 동일 소형 스타일 */}
            {selDate===TODAY_STR && <span style={{fontSize:7,background:"#2e6e44",color:"#fff",borderRadius:3,padding:"6px 5px",fontWeight:700,display:"inline-flex",alignItems:"center",height:10}}>오늘</span>}
            {dayClosure && <span style={{fontSize:7,background:"#fde8e8",color:"#a83030",borderRadius:3,padding:"6px 5px",fontWeight:700,display:"inline-flex",alignItems:"center",height:10}}>휴강</span>}
            {!dayClosure&&isOpen && <span style={{fontSize:7,background:"#d8f5ec",color:"#1a6e4a",borderRadius:3,padding:"6px 5px",fontWeight:700,display:"inline-flex",alignItems:"center",height:10}}>오픈</span>}
            {!dayClosure&&isSpecial&&!isOpen&&special?.type==="special" && <span style={{fontSize:7,background:"#ede8fa",color:"#5a3a9a",borderRadius:3,padding:"6px 5px",fontWeight:700,display:"inline-flex",alignItems:"center",height:10}}>집중</span>}
            {!dayClosure&&closures.some(cl=>cl.date===selDate&&cl.timeSlot) && <span style={{fontSize:7,background:"#fdf0ec",color:"#c97050",borderRadius:3,padding:"6px 5px",fontWeight:700,display:"inline-flex",alignItems:"center",height:10}}>부분</span>}
          </div>

          {/* 수업 없는 날 (주말=스케줄없음) */}
          {!dayClosure&&!isOpen&&!(isSpecial&&special?.type==="special")&&!isUnscheduled&&allSlots.length===0&&(
            <div style={{textAlign:"center",padding:"32px 0",color:"#b0a090"}}>
              <div style={{fontSize:28,marginBottom:8}}>🌿</div>
              <div style={{fontSize:13}}>이 날은 수업이 없습니다.</div>
            </div>
          )}
          {/* 미래 평일 스케줄 미등록 안내 */}
          {isUnscheduled&&(
            <div style={{textAlign:"center",padding:"32px 0",color:"#b0a090"}}>
              <div style={{fontSize:28,marginBottom:8}}>📋</div>
              <div style={{fontSize:13}}>수업이 아직 등록되지 않았습니다.</div>
            </div>
          )}

          {/* 오픈클래스 안내 */}
          {isOpen&&(
            <div style={{background:"#d8f5ec",border:"1.5px solid #7acca0",borderRadius:12,padding:"5px 10px",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:15}}>🍀</span>
              <div style={{lineHeight:0.1}}>
                <span style={{fontSize:13,fontWeight:700,color:"#1a6e4a"}}>오픈클래스</span>
                {special.label&&<span style={{fontSize:11,color:"#1a5a3a"}}>{` - ${special.label}`}</span>}
                {special.feeNote&&<span style={{fontSize:11,color:"#1a5a3a"}}>{` · ${special.feeNote}`}</span>}
              </div>
            </div>
          )}

          {/* 집중수련 안내 */}
          {isSpecial&&!isOpen&&special?.type==="special"&&(
            <div style={{background:"linear-gradient(135deg,#f0edff,#e8e2ff)",border:"1.5px solid #a090d0",borderRadius:12,padding:"5px 10px",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:15}}>⚡️</span>
              <div style={{lineHeight:0.1}}>
                <span style={{fontSize:13,fontWeight:700,color:"#4a2e8a"}}>집중수련</span>
                {special.label&&<span style={{fontSize:11,color:"#7a5aaa"}}>{` - ${special.label}`}</span>}
                {special.feeNote&&<span style={{fontSize:11,color:"#6a4aaa"}}>{` · ${special.feeNote}`}</span>}
              </div>
            </div>
          )}

          {/* 오늘의 공지 (dailyNote) — 📢 배지 클릭 시 표시 */}
          {!dayClosure&&special?.dailyNote?.trim()&&(
            <div style={{background:"#fffbec",border:"1.5px solid #e8c44a",borderRadius:12,padding:"8px 12px",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:15,flexShrink:0,lineHeight:1}}>📢</span>
              <span style={{fontSize:12,color:"#7a5a10",lineHeight:1.5,whiteSpace:"pre-wrap"}}>{special.dailyNote.trim()}</span>
            </div>
          )}

          {/* 전체 휴강 안내 */}
          {dayClosure&&(
            <div style={{background:"#fff3f0",border:"1px solid #f0b0a0",borderRadius:12,padding:"5px 10px",display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:15}}>🔕</span>
              <div style={{lineHeight:0.1}}>
                <span style={{fontSize:13,fontWeight:700,color:"#8e3030"}}>전체 휴강</span>
                {dayClosure.reason&&<span style={{fontSize:12,color:"#9a5a50"}}>{` - ${dayClosure.reason}`}</span>}
              </div>
            </div>
          )}

          {/* ─── 타임슬롯 가로 나열 ───────────────────────────── */}
          {!member.holding&&!dayClosure&&(
            <div style={{display:"flex",flexDirection:"row",gap:6,overflowX:"auto",paddingBottom:4}}>{/* ← 가로 나열, 스크롤 가능 */}
            {allSlots.filter(slot=>{
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
                  background: slCl?"#f5f0ee":isMyRes?"#f0f8f4":isMyWait?"#fffaeb":"#ffffffb8", /* ← 내예약=연초록 / 대기=연노랑 / 기본=흰색 */
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
                            {slCl?`🔕 휴강`:isFull?`마감·대기 ${waitCnt}명`:`${remaining}자리 남음`}
                          </span>
                      }
                    </div>

                    {/* 줄 3: 액션 버튼 */}
                    {slCl?(
                      <span style={{fontSize:10,color:"#9a8e80",fontWeight:700,display:"block",textAlign:"center"}}>휴강</span>
                    ):isMyRes?(
                      /* 취소 버튼(내예약): border #a8d8b8 / color #2e6e44 */
                      <button onClick={()=>setConfirmCancel(myB.id)} style={{width:"100%",background:"none",border:"1px solid #a8d8b8",borderRadius:7,padding:"4px 0",fontSize:11,fontWeight:700,color:"#2e6e44",cursor:"pointer",fontFamily:FONT}}>취소</button>
                    ):isMyWait?(
                      /* 대기취소 버튼: border #e8c44a / color #9a5a10 */
                      <button onClick={()=>setConfirmCancel(myB.id)} style={{width:"100%",background:"none",border:"1px solid #e8c44a",borderRadius:7,padding:"6px 0",fontSize:12,fontWeight:700,color:"#9a5a10",cursor:"pointer",fontFamily:FONT}}>대기취소</button>
                    ):isFull?(
                      <button onClick={()=>tryReserve(slot.key,true)} style={{width:"100%",background:"#fdf3e3",border:"1px solid #e8c44a",borderRadius:7,padding:"6px 0",fontSize:12,fontWeight:700,color:"#9a5a10",cursor:"pointer",fontFamily:FONT}}>대기</button>
                    ):(
                      <button onClick={()=>tryReserve(slot.key)} style={{width:"100%",background:"#5a6a8a",border:"none",borderRadius:7,padding:"6px 0",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:FONT}}>예약</button>/* ← 예약버튼 */
                    )}
                  </div>

                  {/* 진행률 바 + N명: flex row로 겹침 없이 배치 */}
                  {/* barBg: 마감=red / ≥70%=amber / 미만=green */}
                  {!slCl&&(()=>{
                    const ratio = cap>0?cnt/cap:0;
                    const barBg = isFull?"#E24B4A":ratio>=0.7?"#EF9F27":"#2d6a4f";
                    const barW  = `${Math.min(100,cnt/Math.max(cap,1)*100)}%`;
                    return (
                      <div style={{display:"flex",alignItems:"center",gap:4,padding:"2px 6px 4px"}}>
                        {/* 바 트랙: flex:1로 남은 공간 채움 */}
                        <div style={{flex:1,height:3,background:"rgba(0,0,0,0.07)",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:barW,background:barBg,transition:"width .3s"}}/>
                        </div>
                        {/* N명: 내예약=진초록 / 나머지=3차텍스트 */}
                        <span style={{fontSize:9,color:isMyRes?"#27500A":"#9a8e80",fontWeight:isMyRes?700:400,flexShrink:0}}>{cnt}명</span>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* ─── 예약 취소 확인 모달 ────────────────────────────── */}
      {/* 취소 대상 booking 조회 → 날짜·슬롯 정보 표시 / 유지하기(좌) 취소하기(우·강조) */}
      {confirmCancel&&(()=>{
        const cb  = bookings.find(b=>b.id===confirmCancel);
        const slotObj = cb && TIME_SLOTS.find(t=>t.key===cb.timeSlot);
        const cancelDay = cb ? `${fmt(cb.date)}(${DOW_KO[parseLocal(cb.date).getDay()]})` : "";
        const cancelTime = slotObj ? `${slotObj.label} ${slotObj.time}` : "";
        return (
          <div style={{...S.overlay,alignItems:"center"}} onClick={()=>setConfirmCancel(null)}>
            <div style={{...S.modal,maxWidth:320,textAlign:"center",borderRadius:16}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e",marginBottom:12}}>예약을 취소할까요?</div>
              {cb&&(
                <div style={{fontSize:13,color:"#5a5a5a",background:"#f7f4ef",borderRadius:10,padding:"10px 14px",marginBottom:16,lineHeight:1.9,textAlign:"left"}}>
                  <div style={{fontWeight:600,color:"#1e2e1e"}}>{cancelDay} {cancelTime}</div>
                  <div style={{fontSize:11,color:"#9a8e80",marginTop:3}}>취소하면 자리가 반납됩니다.</div>
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button style={{...S.cancelBtn,flex:1}} onClick={()=>setConfirmCancel(null)}>유지하기</button>
                <button style={{...S.saveBtn,flex:1,background:"#c97474"}} onClick={()=>cancelBooking(confirmCancel)}>취소하기</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── 마지막 1회 팝업 ────────────────────────────────── */}
      {renewPopup==="last1"&&(
        <div style={{...S.overlay,alignItems:"center"}} onClick={()=>{setRenewPopup(null);setPendingSlot(null);}}>
          <div style={{...S.modal,maxWidth:320,textAlign:"center",borderRadius:16}} onClick={e=>e.stopPropagation()}>
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
        <div style={{...S.overlay,alignItems:"center"}} onClick={()=>{setRenewPopup(null);setPendingSlot(null);}}>
          <div style={{...S.modal,maxWidth:320,textAlign:"center",borderRadius:16}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:34,marginBottom:10}}>🔄</div>
            <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e",marginBottom:8}}>회원권이 만료됐어요</div>{/* 만료/횟수소진 구분 없이 통일 */}
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
