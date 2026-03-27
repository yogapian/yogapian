import { useState } from "react";
import { FONT, TODAY_STR, TIME_SLOTS, SCHEDULE, SLOT_LIMIT } from "../constants.js";
import { parseLocal, fmt, fmtWithDow, addDays } from "../utils.js";
import { calcDL, getClosureExtDays, usedAsOf } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";
import CalendarPicker from "./CalendarPicker.jsx";
import MiniCalendar from "./MiniCalendar.jsx";

export default function MemberReservePage({member,bookings,setBookings,setMembers,setNotices,specialSchedules,closures,notices,onBack}){
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
  const rem=memberExpired?0:Math.max(0,member.total-usedAsOf(member.id,TODAY_STR,bookings,[member]));

  function slotActiveCount(k){return dayActive.filter(b=>b.timeSlot===k&&(b.status==="attended"||b.status==="reserved")).length;}
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
  }

  function cancelBooking(bId){
    const cancelled = bookings.find(b=>b.id===bId);
    if(!cancelled) return;
    const slotKey = cancelled.timeSlot;
    const slotLabel = TIME_SLOTS.find(t=>t.key===slotKey)?.label||"";

    const isAttendedCancelled = cancelled.status === "attended" || cancelled.status === "reserved";
    const waiters = bookings
      .filter(b=>b.date===cancelled.date && b.timeSlot===slotKey && b.status==="waiting" && b.id!==bId)
      .sort((a,b)=>a.id-b.id);
    const firstWaiter = isAttendedCancelled && waiters.length > 0 ? waiters[0] : null;

    setBookings(p => {
      const next = p.map(b => b.id === bId ? { ...b, status: "cancelled", cancelledBy: "member" } : b);
      if(firstWaiter){
        return next.map(b => b.id === firstWaiter.id ? { ...b, status: "attended" } : b);
      }
      return next;
    });

    if(firstWaiter){
      const nid = Date.now();
      setNotices(prev=>[{id:nid, title:"📢 예약 확정 안내", content:`${fmt(cancelled.date)} ${slotLabel} 수업 대기가 예약으로 확정되었습니다!`, pinned:false, createdAt:TODAY_STR, targetMemberId:firstWaiter.memberId}, ...(prev||[])]);
    }
    setConfirmCancel(null);
  }

  const myAll=bookings.filter(b=>b.memberId===member.id&&b.status!=="cancelled").sort((a,b)=>b.date.localeCompare(a.date));
  const myUpcoming=myAll.filter(b=>b.date>=TODAY_STR&&b.status==="reserved");
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
            const now=new Date();
            const slotHours={"dawn":6,"morning":8,"lunch":11,"afternoon":14,"evening":19};
            const slotMins={"dawn":30,"morning":30,"lunch":50,"afternoon":0,"evening":30};
            const h=slotHours[slot.key]||0,m=slotMins[slot.key]||0;
            const nowTotalMins=now.getHours()*60+now.getMinutes();
            const slotTotalMins=h*60+m;
            return nowTotalMins<slotTotalMins;
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
                    <span style={{fontWeight:700,background:"#f0ede8",color:"#8a7e70",borderRadius:5,padding:"1px 8px"}}>+{closureExt}일</span>
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
