import { useState } from "react";
import { FONT, TODAY_STR, TIME_SLOTS, SCHEDULE, GE, SC, TYPE_CFG, DOW_KO } from "../constants.js";
import { parseLocal, fmt, fmtWithDow, addDays } from "../utils.js";
import { getStatus, getDisplayStatus, calcDL, effEnd, getClosureExtDays, usedAsOf, calc3MonthEnd, getSlotCapacity } from "../memberCalc.js";
import S from "../styles.js";
import CalendarPicker from "./CalendarPicker.jsx";
import AttendCheckModal from "./AttendCheckModal.jsx";
import AdminCancelModal from "./AdminCancelModal.jsx";

export default function AttendanceBoard({members,bookings,setBookings,setMembers,specialSchedules,setSpecialSchedules,closures,setClosures,notices,setNotices,scheduleTemplate,setScheduleTemplate,onMemberClick}){
  const [date,setDate]=useState(TODAY_STR);
  const [showCal,setShowCal]=useState(false);
  const [addModal,setAddModal]=useState(null);
  const [addForm,setAddForm]=useState({type:"member",memberId:"",onedayName:"",walkIn:false});
  const [convertModal,setConvertModal]=useState(null);
  const [showSpecialMgr,setShowSpecialMgr]=useState(false);
  const INIT_SP={date:TODAY_STR,label:"",type:"regular",feeNote:"",dailyNote:"",activeSlots:[],customTimes:{dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"},slotCapacity:{}};
  const [newSp,setNewSp]=useState(INIT_SP);
  const [originalType,setOriginalType]=useState(null);
  const closeSpecialMgr=()=>{setShowSpecialMgr(false);setOriginalType(null);setNewSp(INIT_SP);};
  const [cancelModal,setCancelModal]=useState(null);
  const [attendCheckModal,setAttendCheckModal]=useState(null);
  const [dragId,setDragId]=useState(null);
  const [dragOver,setDragOver]=useState(null);
  const [showClosureMgr,setShowClosureMgr]=useState(false);
  const [closureForm,setClosureForm]=useState({date:TODAY_STR,timeSlot:"",reason:"",closureType:"regular",extensionOverride:0});
  const [quickDetailM,setQuickDetailM]=useState(null);
  const [openWaitActionId, setOpenWaitActionId] = useState(null);
  const [waitPopup, setWaitPopup] = useState(null);

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

  function adminCancel(id, note, sendNotice=true){
    const b = bookings.find(bk=>bk.id===id);
    if(!b) return;
    const isAttendedCancelled = b.status === "attended" || b.status === "reserved";
    const waiters = bookings.filter(bk=>bk.date===b.date && bk.timeSlot===b.timeSlot && bk.status==="waiting" && bk.id!==id).sort((a,c)=>a.id-c.id);
    const firstWaiter = isAttendedCancelled && waiters.length > 0 ? waiters[0] : null;
    const slotLabel = TIME_SLOTS.find(t=>t.key===b.timeSlot)?.label||"";
    setBookings(p => {
      const next = p.map(bk => bk.id === id ? { ...bk, status: "cancelled", cancelledBy: "admin", cancelNote: note } : bk);
      if(firstWaiter){
        return next.map(bk => bk.id === firstWaiter.id ? { ...bk, status: "attended" } : bk);
      }
      return next;
    });
    if(sendNotice && b.memberId){
      const nid1 = Date.now();
      setNotices(prev=>[{id:nid1, title:"📢 예약 취소 안내", content:`${fmt(b.date)} ${slotLabel} 수업 예약이 취소되었습니다.${note?" ("+note+")":""}`, pinned:false, createdAt:TODAY_STR, targetMemberId:b.memberId}, ...prev]);
    }
    if(firstWaiter){
      const nid2 = Date.now()+1;
      setNotices(prev=>[{id:nid2, title:"📢 예약 확정 안내", content:`${fmt(b.date)} ${slotLabel} 수업 대기가 예약으로 확정되었습니다!`, pinned:false, createdAt:TODAY_STR, targetMemberId:firstWaiter.memberId}, ...prev]);
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
  const avail=k=>members.filter(m=>!slotMids(k).includes(m.id)&&getDisplayStatus(m,closures,bookings)!=="off").sort((a,b)=>a.name.localeCompare(b.name,"ko"));

  function addSpecial(){
    if(!newSp.date)return;
    if(newSp.type!=="regular"&&!newSp.label)return;
    const nid=Math.max(...specialSchedules.map(s=>s.id),0)+1;
    const label=newSp.label||(newSp.type==="regular"?"정규수업":"");
    setSpecialSchedules(p=>[...p.filter(s=>s.date!==newSp.date),{...newSp,label,id:nid}]);
    closeSpecialMgr();
  }
  const toggleSp=sl=>setNewSp(f=>({...f,activeSlots:f.activeSlots.includes(sl)?f.activeSlots.filter(s=>s!==sl):[...f.activeSlots,sl]}));

  const attendedDay=dayActive.filter(b=>b.status==="attended"||b.status==="reserved").length;

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
            const spOnDate=specialSchedules.find(s=>s.date===date);
            if(spOnDate){
              setNewSp({date,type:spOnDate.type,label:spOnDate.label||"",feeNote:spOnDate.feeNote||"",dailyNote:spOnDate.dailyNote||"",activeSlots:spOnDate.activeSlots||[],customTimes:{...regularTimes,...(spOnDate.customTimes||{})},slotCapacity:{...(spOnDate.slotCapacity||{})}});
              setOriginalType(spOnDate.type);
            } else if(dowSlots.length){
              setNewSp({date,type:"regular",label:"",feeNote:"",dailyNote:"",activeSlots:dowSlots,customTimes:regularTimes,slotCapacity:{}});
              setOriginalType("regular");
            } else {
              setNewSp({date,type:"special",label:"",feeNote:"",activeSlots:[],customTimes:regularTimes,slotCapacity:{}});
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
                    <span style={{fontSize:12,color:slot.color,fontWeight:700}}>{recs.filter(r=>r.status!=="waiting").length}명</span>
                    {!slotCl&&<button onClick={()=>{setAddModal(slot.key);setAddForm({type:"member",memberId:"",onedayName:"",walkIn:false});}} style={{fontSize:11,background:slot.color,color:"#fff",border:"none",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontFamily:FONT,fontWeight:700,minHeight:26}}>+ 추가</button>}
                  </div>
                </div>
                <div style={{minHeight:44}}>
                  {recs.filter(r=>r.status!=="waiting").length===0&&recs.length===0&&<div style={{padding:12,textAlign:"center",fontSize:12,color:"#c8c0b0"}}>없음</div>}
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
                          {!slotCl&&<span style={{fontSize:11,color:"#c8c0b0",flexShrink:0}}>⠿</span>}
                          <span style={{fontSize:15,flexShrink:0}}>{isOneday?"👤":GE[mem?.gender]||"🧘🏿"}</span>
                          <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:4,overflow:"hidden"}}>
                            <span onClick={()=>!isOneday&&mem&&setQuickDetailM(mem)}
                              style={{fontSize:13,fontWeight:500,color:isAbsent?"#c97474":isWaiting?"#666":isOneday?"#9a6020":"#1e2e1e",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:isOneday?"default":"pointer",textDecoration:isAbsent?"line-through":"underline",textDecorationColor:isOneday?"#e8a44a":"#c8c0b0",textUnderlineOffset:2,flexShrink:1,minWidth:0}}>
                              {isOneday?rec.onedayName:mem.name}
                            </span>
                            {showRemWarn&&!isAbsent&&<span style={{fontSize:10,color:remColor,fontWeight:700,flexShrink:0}}>잔여{remCount}</span>}
                          </div>
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
                  {avail(addModal).map(m=><option key={m.id} value={m.id}>{m.gender==="F"?"🧘🏻‍♀️":"🧘🏻‍♂️"} {m.name}{m.adminNickname?` (${m.adminNickname})`:""} (잔여 {m.total-usedAsOf(m.id,TODAY_STR,bookings,[m])}회)</option>)}
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
        const qusedCnt=usedAsOf(qm.id,TODAY_STR,bookings,[qm]);
        const qrem = qexpired ? 0 : Math.max(0, Number(qm.total) - qusedCnt);
        const qstatus=getDisplayStatus(qm,closures,bookings);
        const qsc=SC[qstatus];
        const qtc=TYPE_CFG[qm.memberType]||TYPE_CFG["1month"];
        const qpct=Math.min(100,Math.round(qusedCnt/Math.max(qm.total,1)*100));
        const qbarColor=qexpired?"#c97474":qstatus==="hold"?"#6a7fc8":"#5a9e6a";
        const qclosureExt=getClosureExtDays(qm,closures);
        return(
          <div style={{position:"fixed",inset:0,background:"rgba(40,35,25,.38)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px"}} onClick={()=>setQuickDetailM(null)}>
            <div style={{background:"#fff",borderRadius:16,padding:"18px 16px 14px",width:"100%",maxWidth:340,boxShadow:"0 8px 32px rgba(40,35,25,.22)"}} onClick={e=>e.stopPropagation()}>
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
              {qstatus!=="off"&&(
                <div style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                    <span style={{fontSize:11,color:"#9a8e80"}}>등록 <b style={{color:"#3a4a3a"}}>{qm.total}회</b></span>
                    <span style={{fontSize:11,color:"#9a8e80"}}>사용 <b style={{color:"#3a4a3a"}}>{qusedCnt}</b></span>
                    <span style={{fontSize:13,fontWeight:700,color:qexpired?"#c97474":qrem===0?"#9a5a10":"#2e5c3e"}}>잔여 <span style={{fontSize:22}}>{qrem}</span>회</span>
                  </div>
                  <div style={{background:"#e8e4dc",borderRadius:8,height:16,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${qpct}%`,background:qbarColor,borderRadius:8}}/>
                  </div>
                </div>
              )}
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

      {showSpecialMgr&&(
        <div style={S.overlay} onClick={()=>closeSpecialMgr()}>
          <div style={{...S.modal,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={{...S.modalHead}}><span style={{fontSize:20}}>🗓️</span><div style={S.modalTitle}>수업 설정</div></div>
            <div style={S.fg}>
              <label style={S.lbl}>수업 유형</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                {[
                  {v:"regular", label:"정규",    icon:"📅"},
                  {v:"special", label:"집중",    icon:"⚡"},
                  {v:"open",    label:"오픈클래스",icon:"🍀"},
                ].map(t=>{
                  const hasClosure=closures.some(cl=>cl.date===newSp.date&&!cl.timeSlot);
                  const locked=hasClosure||(originalType!==null&&originalType!==t.v);
                  const selected=newSp.type===t.v;
                  return(
                    <div key={t.v} onClick={()=>{
                      if(locked) return;
                      const regularTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};
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
                    setNewSp(f=>({...f,date:val,type:existingOnDate.type,activeSlots:existingOnDate.activeSlots||[],customTimes:{...regularTimes,...(existingOnDate.customTimes||{})},label:existingOnDate.label||"",feeNote:existingOnDate.feeNote||"",slotCapacity:{...(existingOnDate.slotCapacity||{})}}));
                    setOriginalType(existingOnDate.type);
                  } else if(dowSlots.length){
                    setNewSp(f=>({...f,date:val,type:"regular",activeSlots:dowSlots,customTimes:regularTimes,label:"",feeNote:"",slotCapacity:{}}));
                    setOriginalType("regular");
                  } else {
                    setNewSp(f=>({...f,date:val,type:"special",activeSlots:[],customTimes:regularTimes,label:"",feeNote:"",slotCapacity:{}}));
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
            {newSp.activeSlots.length>0&&!closures.some(cl=>cl.date===newSp.date&&!cl.timeSlot)&&(
              <div style={S.fg}>
                <label style={S.lbl}>이 날 수업별 정원 <span style={{fontWeight:400,color:"#9a8e80"}}>(비우면 기본값 사용)</span></label>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {TIME_SLOTS.filter(sl=>newSp.activeSlots.includes(sl.key)).map(sl=>{
                    const spDow=new Date(newSp.date+"T00:00:00").getDay();
                    const templateCap=scheduleTemplate?.[spDow]?.[sl.key]??10;
                    const overrideCap=newSp.slotCapacity?.[sl.key];
                    return(
                      <div key={sl.key} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:sl.bg,borderRadius:9,border:`1px solid ${sl.color}33`}}>
                        <span style={{fontSize:14,flexShrink:0}}>{sl.icon}</span>
                        <span style={{fontSize:13,fontWeight:700,color:sl.color,width:28,flexShrink:0}}>{sl.label}</span>
                        <span style={{fontSize:11,color:"#9a8e80",flex:1}}>기본 {templateCap}명</span>
                        <input type="number" min="1" max="99" placeholder={String(templateCap)}
                          value={overrideCap!=null?overrideCap:""}
                          onChange={e=>{
                            const v=e.target.value;
                            setNewSp(f=>{
                              const sc={...f.slotCapacity};
                              if(v==="")delete sc[sl.key];
                              else sc[sl.key]=Number(v);
                              return{...f,slotCapacity:sc};
                            });
                          }}
                          onClick={e=>e.stopPropagation()}
                          style={{...S.inp,width:60,padding:"4px 8px",fontSize:12,margin:0,textAlign:"center"}}/>
                        <span style={{fontSize:11,color:"#9a8e80",flexShrink:0}}>명</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
            {originalType!==null&&!closures.some(cl=>cl.date===newSp.date&&!cl.timeSlot)&&(()=>{
              const typeLabel=originalType==="open"?"오픈클래스":originalType==="regular"?"정규수업":"집중수업";
              return(
                <button onClick={()=>{
                  const spOnDate=specialSchedules.find(s=>s.date===newSp.date);
                  if(spOnDate) setSpecialSchedules(p=>p.filter(s=>s.date!==newSp.date));
                  setOriginalType(null);
                  const regularTimes={dawn:"06:30",morning:"08:30",lunch:"11:50",afternoon:"",evening:"19:30"};
                  setNewSp(f=>({...f,type:"regular",activeSlots:[],customTimes:regularTimes,label:"",feeNote:""}));
                }} style={{background:"#f5eeee",color:"#c97474",border:"none",borderRadius:8,padding:"8px 14px",fontSize:12,cursor:"pointer",fontFamily:FONT,fontWeight:700,marginBottom:12,width:"100%"}}>
                  🗑️ 이 날 {typeLabel} 삭제
                </button>
              );
            })()}
            <div style={{...S.fg,borderTop:"1px solid #e8e4dc",paddingTop:12}}>
              <label style={{...S.lbl,color:"#3d5494"}}>기본 정원 (요일별 템플릿)</label>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[1,2,3,4,5].map(d=>{
                  const slots=TIME_SLOTS.filter(sl=>(scheduleTemplate?.[d]?.[sl.key]!=null)||({1:["dawn","morning","lunch","evening"],2:["lunch","evening"],3:["dawn","morning","lunch","evening"],4:["lunch","evening"],5:["dawn","morning","evening"]}[d]||[]).includes(sl.key));
                  if(!slots.length)return null;
                  return(
                    <div key={d} style={{background:"#f0f0f8",borderRadius:9,padding:"8px 10px"}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#3d5494",marginBottom:6}}>{DOW_KO[d]}요일</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {slots.map(sl=>{
                          const cur=scheduleTemplate?.[d]?.[sl.key]??10;
                          return(
                            <div key={sl.key} style={{display:"flex",alignItems:"center",gap:4,background:sl.bg,borderRadius:7,padding:"4px 8px",border:`1px solid ${sl.color}33`}}>
                              <span style={{fontSize:12,color:sl.color,fontWeight:700}}>{sl.label}</span>
                              <input type="number" min="1" max="99"
                                value={cur}
                                onChange={e=>{
                                  const v=Number(e.target.value)||10;
                                  setScheduleTemplate(prev=>{
                                    const next={...prev};
                                    next[d]={...(next[d]||{}),[sl.key]:v};
                                    return next;
                                  });
                                }}
                                onClick={e=>e.stopPropagation()}
                                style={{...S.inp,width:46,padding:"2px 5px",fontSize:12,margin:0,textAlign:"center"}}/>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={S.modalBtns}><button style={S.cancelBtn} onClick={()=>closeSpecialMgr()}>취소</button><button style={{...S.saveBtn,opacity:(newSp.type==="regular"||newSp.label)?1:0.5}} onClick={addSpecial} disabled={newSp.type!=="regular"&&!newSp.label}>저장</button></div>
          </div>
        </div>
      )}

      {attendCheckModal&&<AttendCheckModal rec={attendCheckModal} members={members} isOpen={isOpen} bookings={bookings} setBookings={setBookings} setMembers={setMembers} notices={notices} setNotices={setNotices} onClose={()=>setAttendCheckModal(null)}/>}
      {cancelModal&&<AdminCancelModal booking={cancelModal} member={members.find(m=>m.id===cancelModal.memberId)} onClose={()=>setCancelModal(null)} onConfirm={(note,sendNotice)=>adminCancel(cancelModal.id,note,sendNotice)}/>}
    </div>
  );
}
