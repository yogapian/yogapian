import { useState } from "react";
import { Agentation } from "agentation";
import { FONT, TODAY_STR, TIME_SLOTS, SCHEDULE } from "../constants.js";
import { parseLocal, fmt, fmtWithDow, addDays } from "../utils.js";
import { calcDL, getClosureExtDays, usedAsOf, getSlotCapacity } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";
import CalendarPicker from "./CalendarPicker.jsx";
import MiniCalendar from "./MiniCalendar.jsx";

const DOW_SHORT = ["일","월","화","수","목","금","토"];
const DEFAULT_TIMES = {dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};

export default function MemberReservePage({member,bookings,setBookings,setMembers,setNotices,specialSchedules,closures,notices,scheduleTemplate,onBack}){
  const [tab, setTab] = useState("reserve");
  const [selDate, setSelDate] = useState(TODAY_STR);
  const [showCal, setShowCal] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [pendingSlot, setPendingSlot] = useState(null);
  const [renewPopup, setRenewPopup] = useState(null); // "last1" | "needRenewal"

  const closuresCxt = useClosures();
  const dow = parseLocal(selDate).getDay();
  const special = specialSchedules.find(s => s.date === selDate);
  const isWeekend = dow === 0 || dow === 6;
  const isSpecial = !!special;
  const isOpen = special?.type === "open";
  const isRegular = special?.type === "regular";
  const isFuture = selDate >= TODAY_STR;
  const dayClosure = closures.find(cl => cl.date === selDate && !cl.timeSlot);
  const getSlotClosure = k => closures.find(cl => cl.date === selDate && cl.timeSlot === k);
  const hasTimeChange = isRegular && special?.activeSlots?.some(k => special.customTimes?.[k] && special.customTimes[k] !== DEFAULT_TIMES[k]);

  const memberDl = calcDL(member, closuresCxt);
  const memberExpired = memberDl < 0;
  const usedCnt = usedAsOf(member.id, TODAY_STR, bookings, [member]);
  const rem = memberExpired ? 0 : Math.max(0, member.total - usedCnt);

  const getSlots = () => {
    if (isSpecial) return TIME_SLOTS.filter(s => special.activeSlots.includes(s.key)).map(s => ({...s, time: special.customTimes?.[s.key] || s.time}));
    if (isWeekend) return [];
    return TIME_SLOTS.filter(s => SCHEDULE[dow]?.includes(s.key));
  };
  const slots = getSlots();
  const dayActive = bookings.filter(b => b.date === selDate && b.status !== "cancelled");

  function slotActiveCount(k) { return dayActive.filter(b => b.timeSlot === k && (b.status === "attended" || b.status === "reserved")).length; }
  function slotWaitCount(k) { return dayActive.filter(b => b.timeSlot === k && b.status === "waiting").length; }
  function mySlot(k) { return dayActive.find(b => b.memberId === member.id && b.timeSlot === k); }
  function waitingRank(k) {
    const waiters = dayActive.filter(b => b.timeSlot === k && b.status === "waiting").sort((a,b) => a.id - b.id);
    const idx = waiters.findIndex(b => b.memberId === member.id);
    return idx >= 0 ? idx + 1 : 0;
  }

  function tryReserve(slotKey, isWaiting = false) {
    if (mySlot(slotKey) || getSlotClosure(slotKey) || dayClosure) return;
    if (!isWaiting && slotActiveCount(slotKey) >= getSlotCapacity(selDate, slotKey, specialSchedules, scheduleTemplate)) return;
    if (isWaiting) { doReserve(slotKey, true, false); return; }
    if (rem === 0 || memberExpired) { setPendingSlot(slotKey); setRenewPopup("needRenewal"); return; }
    if (rem === 1) { setPendingSlot(slotKey); setRenewPopup("last1"); return; }
    doReserve(slotKey, false, false);
  }

  function doReserve(slotKey, isWaiting, renewalPending) {
    const nid = Math.max(...bookings.map(b => b.id), 0) + 1;
    setBookings(p => [...p, {
      id: nid, date: selDate, memberId: member.id,
      timeSlot: slotKey, walkIn: false,
      status: isWaiting ? "waiting" : "attended",
      cancelNote: "", cancelledBy: "",
      ...(renewalPending ? {renewalPending: true} : {})
    }]);
    setPendingSlot(null); setRenewPopup(null);
  }

  function cancelBooking(bId) {
    const cancelled = bookings.find(b => b.id === bId);
    if (!cancelled) return;
    const slotKey = cancelled.timeSlot;
    const slotLabel = TIME_SLOTS.find(t => t.key === slotKey)?.label || "";
    const isConfirmed = cancelled.status === "attended" || cancelled.status === "reserved";
    const firstWaiter = isConfirmed
      ? bookings.filter(b => b.date === cancelled.date && b.timeSlot === slotKey && b.status === "waiting" && b.id !== bId).sort((a,b) => a.id - b.id)[0]
      : null;
    setBookings(p => {
      const next = p.map(b => b.id === bId ? {...b, status:"cancelled", cancelledBy:"member"} : b);
      return firstWaiter ? next.map(b => b.id === firstWaiter.id ? {...b, status:"attended"} : b) : next;
    });
    if (firstWaiter) {
      setNotices(prev => [{id:Date.now(), title:"📢 예약 확정 안내", content:`${fmt(cancelled.date)} ${slotLabel} 수업 대기가 예약으로 확정되었습니다!`, pinned:false, createdAt:TODAY_STR, targetMemberId:firstWaiter.memberId}, ...(prev||[])]);
    }
    setConfirmCancel(null);
  }

  const myUpcoming = bookings
    .filter(b => b.memberId === member.id && b.date >= TODAY_STR && (b.status === "attended" || b.status === "reserved" || b.status === "waiting"))
    .sort((a,b) => a.date.localeCompare(b.date) || a.id - b.id);
  const myHistory = bookings
    .filter(b => b.memberId === member.id && b.status === "attended")
    .sort((a,b) => b.date.localeCompare(a.date));

  // 날짜 스트립 (오늘 기준 7일)
  const dateStrip = Array.from({length: 7}, (_, i) => addDays(TODAY_STR, i));

  // 잔여 상태
  const remColor = memberExpired || rem === 0 ? "#c97474" : rem === 1 ? "#9a5a10" : "#2e6e44";
  const remBg = memberExpired || rem === 0 ? "#fef5f5" : rem === 1 ? "#fffaeb" : "#f5fbf5";

  return (
    <div style={{maxWidth:520,margin:"0 auto",width:"100%",fontFamily:FONT}}>

      {/* 탭 */}
      <div style={{display:"flex",borderBottom:"1.5px solid #e8e4dc",background:"#fff"}}>
        {[["reserve","수업 예약"],["history","예약 내역"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{flex:1,border:"none",background:"none",padding:"14px 0",fontSize:14,fontWeight:tab===k?700:400,color:tab===k?"#2e6e44":"#9a8e80",cursor:"pointer",fontFamily:FONT,borderBottom:tab===k?"2px solid #2e6e44":"2px solid transparent",marginBottom:-1.5}}>
            {l}
          </button>
        ))}
      </div>

      {tab === "reserve" && (
        <div style={{paddingBottom:80}}>

          {/* 날짜 선택 영역 */}
          <div style={{background:"#fff",borderBottom:"1px solid #f0ece4"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"14px 16px 10px"}}>
              <button onClick={() => { if(selDate > TODAY_STR) setSelDate(d => addDays(d,-1)); }} style={{background:"none",border:"none",fontSize:22,color:"#555",cursor:"pointer",padding:"4px 6px",opacity:selDate<=TODAY_STR?0.25:1,lineHeight:1}}>‹</button>
              <div style={{flex:1,position:"relative"}}>
                <button onClick={() => setShowCal(s => !s)} style={{width:"100%",background:"none",border:"none",cursor:"pointer",fontFamily:FONT,padding:0,textAlign:"left",display:"flex",alignItems:"center",gap:7}}>
                  <span style={{fontSize:16,fontWeight:700,color:"#1e2e1e"}}>{fmtWithDow(selDate)}</span>
                  {selDate === TODAY_STR && <span style={{fontSize:11,background:"#2e6e44",color:"#fff",borderRadius:10,padding:"2px 8px",fontWeight:700}}>오늘</span>}
                  {dayClosure && <span style={{fontSize:11,background:"#fde8e8",color:"#a83030",borderRadius:10,padding:"2px 8px",fontWeight:700}}>휴강</span>}
                  {!dayClosure && isOpen && <span style={{fontSize:11,background:"#d8f5ec",color:"#1a6e4a",borderRadius:10,padding:"2px 8px",fontWeight:700}}>오픈</span>}
                  {!dayClosure && isSpecial && special?.type==="special" && <span style={{fontSize:11,background:"#ede8fa",color:"#5a3a9a",borderRadius:10,padding:"2px 8px",fontWeight:700}}>집중</span>}
                  {!dayClosure && isRegular && hasTimeChange && <span style={{fontSize:11,background:"#fdf0d8",color:"#9a5a10",borderRadius:10,padding:"2px 8px",fontWeight:700}}>변경</span>}
                  <span style={{fontSize:12,color:"#b0a090"}}>▾</span>
                </button>
                {showCal && (<>
                  <div style={{position:"fixed",inset:0,zIndex:150}} onClick={() => setShowCal(false)}/>
                  <CalendarPicker value={selDate} onChange={v => {setSelDate(v); setShowCal(false);}} onClose={() => setShowCal(false)} closures={closures} specialSchedules={specialSchedules}/>
                </>)}
              </div>
              <button onClick={() => setSelDate(d => addDays(d,1))} style={{background:"none",border:"none",fontSize:22,color:"#555",cursor:"pointer",padding:"4px 6px",lineHeight:1}}>›</button>
            </div>

            {/* 7일 날짜 스트립 */}
            <div style={{display:"flex",gap:0,padding:"0 10px 12px",overflowX:"auto"}}>
              {dateStrip.map(ds => {
                const d = parseLocal(ds);
                const dw = d.getDay();
                const isSel = ds === selDate;
                const isTod = ds === TODAY_STR;
                const hasCl = closures.some(cl => cl.date === ds && !cl.timeSlot);
                const myDayB = bookings.find(b => b.memberId === member.id && b.date === ds && (b.status==="attended"||b.status==="reserved"));
                const myDayW = !myDayB && bookings.find(b => b.memberId === member.id && b.date === ds && b.status==="waiting");
                const dotColor = hasCl ? "#e05050" : myDayB ? (isSel?"rgba(255,255,255,.9)":"#2e6e44") : myDayW ? "#e8c44a" : "transparent";
                return (
                  <button key={ds} onClick={() => setSelDate(ds)} style={{flex:"0 0 auto",width:46,padding:"8px 0 6px",border:"none",borderRadius:12,cursor:"pointer",fontFamily:FONT,background:isSel?"#2e6e44":"transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <span style={{fontSize:11,color:isSel?"rgba(255,255,255,.7)":dw===0?"#e05050":dw===6?"#4a70d0":"#9a8e80",fontWeight:500}}>{DOW_SHORT[dw]}</span>
                    <span style={{fontSize:15,fontWeight:700,color:isSel?"#fff":isTod?"#2e6e44":"#1e2e1e"}}>{d.getDate()}</span>
                    <span style={{width:5,height:5,borderRadius:"50%",background:dotColor,display:"block"}}/>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 잔여 횟수 배너 */}
          <div style={{background:remBg,borderBottom:"1px solid #f0ece4",padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:13,color:"#7a6e60"}}>{memberExpired?"회원권 만료":rem===0?"잔여 횟수 없음":rem===1?"마지막 1회":"잔여 횟수"}</span>
            <span style={{fontSize:15,fontWeight:700,color:remColor}}>{memberExpired?"만료":`${rem}회`}</span>
          </div>

          <div style={{padding:"14px 14px 0"}}>

            {/* 과거 날짜 안내 */}
            {!isFuture && <div style={{textAlign:"center",padding:"48px 0",color:"#b0a090"}}><div style={{fontSize:34,marginBottom:10}}>📅</div><div style={{fontSize:14}}>과거 날짜는 예약할 수 없어요.</div></div>}

            {/* 수업 없는 날 */}
            {isFuture && isWeekend && (!isSpecial||(special&&special.type==="regular")) && !dayClosure && <div style={{textAlign:"center",padding:"48px 0",color:"#b0a090"}}><div style={{fontSize:34,marginBottom:10}}>🌿</div><div style={{fontSize:14}}>이 날은 수업이 없습니다.</div></div>}

            {/* 특별 공지 */}
            {isFuture && isSpecial && (hasTimeChange||special?.dailyNote?.trim()) && (
              <div style={{background:special.type==="open"?"#d8f5ec":special.type==="special"?"#f0edff":"#fdf3e3",border:`1.5px solid ${special.type==="open"?"#1a6e4a":special.type==="special"?"#a090d0":"#e8a44a"}`,borderRadius:12,padding:"12px 14px",marginBottom:12,display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{fontSize:16}}>🔔</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:special.type==="open"?"#1a6e4a":special.type==="special"?"#5a3a9a":"#9a5a10",marginBottom:3}}>오늘의 공지</div>
                  {special.dailyNote?.trim() && <div style={{fontSize:12,color:"#5a5a5a",whiteSpace:"pre-wrap"}}>{special.dailyNote}</div>}
                </div>
              </div>
            )}

            {/* 오픈클래스 배너 */}
            {isFuture && isOpen && (
              <div style={{background:"#d8f5ec",border:"1.5px solid #7acca0",borderRadius:12,padding:"12px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:22}}>🍀</span>
                <div><div style={{fontSize:13,fontWeight:700,color:"#1a6e4a"}}>오픈클래스</div><div style={{fontSize:11,color:"#1a5a3a",marginTop:2}}>{special.label}</div>{special.feeNote&&<div style={{fontSize:12,color:"#1a5a3a",marginTop:2}}>{special.feeNote}</div>}</div>
              </div>
            )}

            {/* 집중수련 배너 */}
            {isFuture && isSpecial && !isOpen && special?.type==="special" && (
              <div style={{background:"linear-gradient(135deg,#f0edff,#e8e2ff)",border:"1.5px solid #a090d0",borderRadius:12,padding:"12px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:22}}>⚡️</span>
                <div><div style={{fontSize:13,fontWeight:700,color:"#4a2e8a"}}>집중수련</div><div style={{fontSize:11,color:"#7a5aaa",marginTop:2}}>{special.label}</div>{special.feeNote&&<div style={{fontSize:12,color:"#6a4aaa",marginTop:2}}>{special.feeNote}</div>}</div>
              </div>
            )}

            {/* 전체 휴강 배너 */}
            {isFuture && dayClosure && (
              <div style={{background:"#fff3f0",border:"1px solid #f0b0a0",borderRadius:12,padding:"14px 16px",display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:22}}>🔕</span>
                <div><div style={{fontSize:13,fontWeight:700,color:"#8e3030"}}>전체 휴강</div><div style={{fontSize:12,color:"#9a5a50",marginTop:2}}>{dayClosure.reason}</div></div>
              </div>
            )}

            {/* 슬롯 카드 */}
            {isFuture && !dayClosure && slots.filter(slot => {
              if (selDate !== TODAY_STR) return true;
              const now = new Date();
              const H = {dawn:6,morning:8,lunch:11,afternoon:14,evening:19}[slot.key]||0;
              const M = {dawn:30,morning:30,lunch:50,afternoon:0,evening:30}[slot.key]||0;
              return now.getHours()*60+now.getMinutes() < H*60+M;
            }).map(slot => {
              const slCl = getSlotClosure(slot.key);
              const cnt = slotActiveCount(slot.key);
              const waitCnt = slotWaitCount(slot.key);
              const cap = getSlotCapacity(selDate, slot.key, specialSchedules, scheduleTemplate);
              const remaining = cap - cnt;
              const myB = mySlot(slot.key);
              const isMyWait = myB?.status === "waiting";
              const isMyReserved = myB && !isMyWait;
              const isFull = remaining <= 0;
              const myRank = isMyWait ? waitingRank(slot.key) : 0;
              const isChg = isRegular && DEFAULT_TIMES[slot.key] && slot.time !== DEFAULT_TIMES[slot.key];
              const fillPct = Math.min(100, cnt / cap * 100);

              return (
                <div key={slot.key} style={{background:"#fff",borderRadius:14,marginBottom:10,border:`1.5px solid ${slCl?"#f0b0a0":isMyReserved?"#2e6e44":isMyWait?"#e8c44a":"#e8e4dc"}`,overflow:"hidden",boxShadow:isMyReserved?"0 0 0 3px rgba(46,110,68,.08)":isMyWait?"0 0 0 3px rgba(232,196,74,.12)":"none"}}>
                  <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:46,height:46,borderRadius:13,background:slCl?"#f5f0ee":slot.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{slot.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                        <span style={{fontSize:15,fontWeight:700,color:slCl?"#9a8e80":slot.color}}>{slot.label}</span>
                        {isChg
                          ? <span style={{fontSize:12}}><s style={{color:"#c0b0b0"}}>{DEFAULT_TIMES[slot.key]}</s><span style={{color:"#c97474"}}> → {slot.time}</span></span>
                          : <span style={{fontSize:13,color:"#9a8e80"}}>{slot.time}</span>
                        }
                        {isMyReserved && <span style={{fontSize:11,background:"#e8f5ee",color:"#2e6e44",borderRadius:10,padding:"1px 8px",fontWeight:700}}>내 예약</span>}
                        {isMyWait && <span style={{fontSize:11,background:"#fffaeb",color:"#9a5a10",borderRadius:10,padding:"1px 8px",fontWeight:700}}>대기 {myRank}번째</span>}
                      </div>
                      <div style={{fontSize:12,color:slCl?"#b0a090":isFull&&!myB?"#c97474":remaining<=2&&!myB?"#9a5a10":"#a0988e"}}>
                        {slCl?`🔕 ${slCl.reason}`:isFull&&!myB?`마감 · 대기 ${waitCnt}명`:`잔여 ${remaining}석 / ${cap}석`}
                      </div>
                    </div>
                    <div style={{flexShrink:0}}>
                      {slCl ? (
                        <span style={{fontSize:12,background:"#f5f0ee",color:"#9a8e80",borderRadius:8,padding:"8px 12px",fontWeight:700}}>휴강</span>
                      ) : isMyReserved ? (
                        <button onClick={() => setConfirmCancel(myB.id)} style={{background:"none",border:"1.5px solid #e8a0a0",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,color:"#c97474",cursor:"pointer",fontFamily:FONT}}>취소</button>
                      ) : isMyWait ? (
                        <button onClick={() => setConfirmCancel(myB.id)} style={{background:"none",border:"1.5px solid #e8c44a",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,color:"#9a5a10",cursor:"pointer",fontFamily:FONT}}>대기취소</button>
                      ) : isFull ? (
                        <button onClick={() => tryReserve(slot.key, true)} style={{background:"#fdf3e3",border:"1.5px solid #e8c44a",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,color:"#9a5a10",cursor:"pointer",fontFamily:FONT}}>대기</button>
                      ) : (
                        <button onClick={() => tryReserve(slot.key)} style={{background:"#2e6e44",border:"none",borderRadius:10,padding:"8px 20px",fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:FONT}}>예약</button>
                      )}
                    </div>
                  </div>
                  {/* 정원 채움 바 */}
                  {!slCl && <div style={{height:3,background:"#f0ece4"}}><div style={{height:"100%",width:`${fillPct}%`,background:isFull?"#c97474":remaining<=2?"#e8c44a":"#4a9e68",transition:"width .3s",borderRadius:"0 3px 3px 0"}}/></div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div style={{padding:"16px 14px 80px"}}>
          {/* 누적 출석 */}
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e4e0d8",padding:"16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#1e2e1e",marginBottom:3}}>누적 출석</div>
              <div style={{fontSize:12,color:"#9a8e80"}}>{fmt(member.firstDate||member.startDate)} 최초 등록</div>
            </div>
            <span style={{fontSize:24,fontWeight:700,color:"#2e6e44"}}>{myHistory.length}회</span>
          </div>

          {/* 연장 내역 */}
          {(()=>{const ce=getClosureExtDays(member,closures),he=member.extensionDays||0;if(!ce&&!he)return null;return(
            <div style={{background:"#f5fbf5",borderRadius:14,border:"1px solid #b8d8b8",padding:"14px 16px",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#2e6e44",marginBottom:8}}>🌿 회원권 연장</div>
              {ce>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span style={{color:"#5a7a5a"}}>휴강 연장</span><span style={{fontWeight:700,color:"#5a7a5a"}}>+{ce}일</span></div>}
              {he>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span style={{color:"#5a6a9a"}}>홀딩 연장</span><span style={{fontWeight:700,color:"#5a6a9a"}}>+{he}일</span></div>}
              <div style={{borderTop:"1px solid #c8e0c8",marginTop:6,paddingTop:6,display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#7a6e60"}}>합계</span><span style={{fontWeight:700,color:"#2e5c3e"}}>+{ce+he}일</span></div>
            </div>
          );})()}

          <MiniCalendar memberId={member.id} bookings={bookings} member={member}/>

          {/* 예약·대기 목록 */}
          {myUpcoming.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,color:"#1e2e1e",marginBottom:10}}>예약·대기 {myUpcoming.length}건</div>
              {myUpcoming.map(b => {
                const sl = TIME_SLOTS.find(t => t.key === b.timeSlot);
                const isWait = b.status === "waiting";
                return (
                  <div key={b.id} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${isWait?"#e8c44a":"#d4eadc"}`,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:20}}>{sl?.icon}</span>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:"#1e2e1e"}}>{fmtWithDow(b.date)}</div>
                        <div style={{fontSize:12,color:isWait?"#9a5a10":"#5a7a5a",marginTop:2,display:"flex",alignItems:"center",gap:5}}>
                          {sl?.label} {sl?.time} · {isWait?"대기중":"예약확정"}
                          {b.renewalPending && <span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:5,padding:"1px 6px",fontWeight:700}}>임시</span>}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setConfirmCancel(b.id)} style={{background:"none",border:"1.5px solid #e8a0a0",borderRadius:9,padding:"6px 12px",fontSize:12,fontWeight:700,color:"#c97474",cursor:"pointer",fontFamily:FONT}}>취소</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 예약 취소 확인 */}
      {confirmCancel && (
        <div style={S.overlay} onClick={() => setConfirmCancel(null)}>
          <div style={{...S.modal,maxWidth:320,textAlign:"center"}} onClick={e => e.stopPropagation()}>
            <div style={{fontSize:32,marginBottom:10}}>🌿</div>
            <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e",marginBottom:6}}>예약을 취소할까요?</div>
            <div style={{fontSize:13,color:"#9a8e80",marginBottom:20}}>취소해도 횟수는 차감되지 않아요.</div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...S.cancelBtn,flex:1}} onClick={() => setConfirmCancel(null)}>아니요</button>
              <button style={{...S.saveBtn,flex:1,background:"#c97474"}} onClick={() => cancelBooking(confirmCancel)}>취소하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 마지막 1회 안내 팝업 */}
      {renewPopup === "last1" && (
        <div style={S.overlay} onClick={() => {setRenewPopup(null);setPendingSlot(null);}}>
          <div style={{...S.modal,maxWidth:320,textAlign:"center"}} onClick={e => e.stopPropagation()}>
            <div style={{fontSize:36,marginBottom:10}}>🌱</div>
            <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e",marginBottom:8}}>마지막 1회 남았어요</div>
            <div style={{fontSize:13,color:"#7a6e60",lineHeight:1.8,marginBottom:20}}>이번 예약 후 횟수를 다 사용해요.<br/><span style={{color:"#9a8e80",fontSize:12}}>다음 예약 시 갱신이 필요합니다.</span></div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...S.cancelBtn,flex:1}} onClick={() => {setRenewPopup(null);setPendingSlot(null);}}>취소</button>
              <button style={{...S.saveBtn,flex:1}} onClick={() => doReserve(pendingSlot, false, false)}>예약하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 잔여 0회 / 만료 → 임시 예약 팝업 */}
      {renewPopup === "needRenewal" && (
        <div style={S.overlay} onClick={() => {setRenewPopup(null);setPendingSlot(null);}}>
          <div style={{...S.modal,maxWidth:320,textAlign:"center"}} onClick={e => e.stopPropagation()}>
            <div style={{fontSize:36,marginBottom:10}}>🔄</div>
            <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e",marginBottom:8}}>{memberExpired?"회원권이 만료됐어요":"횟수를 다 사용했어요"}</div>
            <div style={{fontSize:13,color:"#7a6e60",lineHeight:1.8,marginBottom:20}}>임시 예약을 하시겠어요?<br/><span style={{color:"#9a8e80",fontSize:12}}>관리자에게 갱신 요청이 전달돼요.</span></div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...S.cancelBtn,flex:1}} onClick={() => {setRenewPopup(null);setPendingSlot(null);}}>취소</button>
              <button style={{...S.saveBtn,flex:1,background:"#9a5a10"}} onClick={() => doReserve(pendingSlot, false, true)}>임시 예약</button>
            </div>
          </div>
        </div>
      )}

      {process.env.NODE_ENV === "development" && <Agentation />}
    </div>
  );
}
