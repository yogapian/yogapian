import { useState } from "react";
import { FONT, TODAY_STR, TIME_SLOTS } from "../constants.js";
import { fmt, fmtWithDow } from "../utils.js";
import S from "../styles.js";

export default function AttendCheckModal({rec,members,isOpen,bookings,setBookings,setMembers,notices,setNotices,onClose}){
  const [note,setNote]=useState("");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const mem=rec.memberId?members.find(m=>m.id===rec.memberId):null;
  const slotLabel=TIME_SLOTS.find(t=>t.key===rec.timeSlot)?.label||"";
  const slotTime =TIME_SLOTS.find(t=>t.key===rec.timeSlot)?.time||"";
  const live=bookings.find(b=>b.id===rec.id)||rec;

  const getFirstWaiter = (allBookings) => {
    return allBookings
      .filter(b => b.date === rec.date && b.timeSlot === rec.timeSlot && b.status === "waiting")
      .sort((a, b) => a.id - b.id)[0];
  };

  const promoteWaiterLogic = (nextBookings) => {
    const waiter = getFirstWaiter(nextBookings);
    if (!waiter) return { nextBookings };

    const updatedBookings = nextBookings.map(b =>
      b.id === waiter.id ? { ...b, status: "reserved" } : b
    );

    const nid = Date.now();
    setNotices(prev => [{
      id: nid,
      title: "📢 예약 확정 안내",
      content: `${fmtWithDow(rec.date)} ${slotLabel} ${slotTime} 수업 대기가 예약으로 확정되었습니다!`,
      pinned: false, createdAt: TODAY_STR, targetMemberId: waiter.memberId
    }, ...prev]);

    return { nextBookings: updatedBookings };
  };

  function doAttend(){
    setBookings(p=>p.map(b=>b.id===rec.id?{...b,status:"attended",confirmedAttend:true}:b));
    onClose();
  }

  function doAbsent(){
    setBookings(p => {
      let next = p.map(b => b.id === rec.id ? { ...b, status: "reserved", confirmedAttend: false } : b);
      const res = promoteWaiterLogic(next);
      return res.nextBookings;
    });
    onClose();
  }

  function _execDelete(sendNotice){
    const isReserved = rec.status === "attended" || rec.status === "reserved";
    setBookings(p => {
      let next = p.map(b => b.id === rec.id ? { ...b, status: "cancelled", cancelNote: note, cancelledBy: "admin", confirmedAttend: false } : b);
      if(isReserved) {
        const res = promoteWaiterLogic(next);
        next = res.nextBookings;
      }
      return next;
    });
    if(sendNotice && mem) {
      const nid = Date.now();
      setNotices(prev=>[{id:nid, title:"📢 예약 취소 안내", content:`${fmtWithDow(rec.date)} ${slotLabel} ${slotTime} 수업 예약이 취소되었습니다.`, pinned:false, createdAt:TODAY_STR, targetMemberId:mem.id}, ...prev]);
    }
    onClose();
  }
  function doDelete(){ _execDelete(true); }
  function doDeleteSilent(){ _execDelete(false); }

  function doReset(){
    setBookings(p=>p.map(b=>b.id===rec.id?{...b,status:"reserved",confirmedAttend:null}:b));
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
                <button onClick={doDeleteSilent} style={{flex:1,background:"#f5f5f5",color:"#9a8e80",border:"1px solid #e0d8cc",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>알림없이 삭제</button>
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
            <button onClick={doAbsent} style={{flex:1,background:"#fff0f0",color:"#c97474",border:"1.5px solid #f0b0b0",borderRadius:10,padding:"14px 0",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>❌ 불참</button>{/* 원데이도 doAbsent: doDelete 호출 시 status=cancelled→dayActive 필터에서 제거되어 다음날 목록에서 사라지는 버그 수정 */}
          </div>
        )}
        <button onClick={onClose} style={{...S.cancelBtn,width:"100%"}}>닫기</button>
      </div>
    </div>
  );
}
