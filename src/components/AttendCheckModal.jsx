import { useState } from "react";
import { FONT, TODAY_STR, TIME_SLOTS } from "../constants.js";
import { fmtWithDow, endOfMonth } from "../utils.js";
import { getActivePeriod, calc3MonthEnd, noshowThreshold, noshowCrossings } from "../memberCalc.js";
import S from "../styles.js";

export default function AttendCheckModal({rec,members,isOpen,bookings,setBookings,setMembers,notices,setNotices,onClose}){
  const [note,setNote]=useState("");
  const [cancelPanel,setCancelPanel]=useState(false); // 불참 클릭 후 노쇼/대리취소 패널
  const [cancelType,setCancelType]=useState("noshow"); // "noshow" | "proxy"
  const [penaltyStep,setPenaltyStep]=useState(null); // {newCount, expectedCrossings} — 노쇼 패널티 확인 단계
  const [linkMode,setLinkMode]=useState(false);
  const [linkSearch,setLinkSearch]=useState("");

  const mem=rec.memberId?members.find(m=>m.id===rec.memberId):null;
  const slotLabel=TIME_SLOTS.find(t=>t.key===rec.timeSlot)?.label||"";
  const live=bookings.find(b=>b.id===rec.id)||rec;

  const getFirstWaiter=(allBookings)=>
    allBookings
      .filter(b=>b.date===rec.date&&b.timeSlot===rec.timeSlot&&b.status==="waiting")
      .sort((a,b)=>a.id-b.id)[0];

  const promoteWaiterLogic=(nextBookings)=>{
    const waiter=getFirstWaiter(nextBookings);
    if(!waiter) return {nextBookings};
    const updatedBookings=nextBookings.map(b=>b.id===waiter.id?{...b,status:"reserved"}:b);
    const nid=Date.now();
    setNotices(prev=>[{id:nid,title:`✅예약확정✅`,content:`${fmtWithDow(rec.date)}\n수업 예약이 확정되었습니다.`,pinned:false,createdAt:TODAY_STR,targetMemberId:waiter.memberId},...prev]);
    return {nextBookings:updatedBookings};
  };

  function doAttend(){
    setBookings(p=>p.map(b=>b.id===rec.id?{...b,status:"attended",confirmedAttend:true}:b));
    const newBookings=bookings.map(b=>b.id===rec.id?{...b,status:"attended",confirmedAttend:true}:b);
    // 미정 기수 자동 시작 체크 (오늘 이하 날짜에만 적용)
    if(rec.date<=TODAY_STR&&mem&&(mem.renewalHistory||[]).some(r=>r.startDate===null)){
      const pendingPeriod=(mem.renewalHistory||[]).find(r=>r.startDate===null);
      const prevPeriods=(mem.renewalHistory||[]).filter(r=>r.startDate&&r.endDate).sort((a,b)=>a.startDate.localeCompare(b.startDate));
      const lastPeriod=prevPeriods[prevPeriods.length-1];
      const isPastPrevEnd=lastPeriod?rec.date>lastPeriod.endDate:false;
      const ap=getActivePeriod(mem,rec.date,newBookings);
      const isSpillover=ap&&ap.startDate===null;
      if((isPastPrevEnd||isSpillover)&&pendingPeriod){
        const newStart=rec.date;
        const mType=pendingPeriod?.memberType||mem.memberType;
        const newEnd=mType==="3month"?calc3MonthEnd(newStart):endOfMonth(newStart);
        setMembers(p=>p.map(m=>{
          if(m.id!==mem.id) return m;
          const updRH=(m.renewalHistory||[]).map(r=>r.startDate===null?{...r,startDate:newStart,endDate:newEnd}:r);
          return{...m,startDate:newStart,endDate:newEnd,total:pendingPeriod?.total??m.total,memberType:mType,extensionDays:0,holdingDays:0,bonusDays:0,holding:null,renewalHistory:updRH};
        }));
      }
    }
    onClose();
  }

  function _execDelete(sendNotice){
    const isReserved=rec.status==="attended"||rec.status==="reserved";
    setBookings(p=>{
      let next=p.map(b=>b.id===rec.id?{...b,status:"cancelled",cancelNote:note,cancelledBy:cancelType,confirmedAttend:false}:b);
      if(isReserved){const res=promoteWaiterLogic(next);next=res.nextBookings;}
      return next;
    });
    if(sendNotice&&mem){
      const nid=Date.now();
      setNotices(prev=>[{id:nid,title:`❌예약취소❌`,content:`${fmtWithDow(rec.date)}\n수업 예약이 취소되었습니다.${note?" ("+note+")":""}`,pinned:false,createdAt:TODAY_STR,targetMemberId:mem.id},...prev]);
    }
    // 노쇼 임계 초과 시 패널티 확인 단계로 전환 (자동 차감 아님)
    if(cancelType==="noshow"&&mem){
      const _apP=getActivePeriod(mem,rec.date,bookings);
      const pStart=_apP?.startDate===null?null:(_apP?.startDate||mem.startDate);
      const pEnd=_apP?.endDate||mem.endDate;
      if(pStart){
        const prevNoshows=bookings.filter(b=>b.memberId===mem.id&&b.status==="cancelled"&&b.cancelledBy==="noshow"&&b.date>=pStart&&b.date<=pEnd).length;
        const newCount=prevNoshows+1;
        const threshold=noshowThreshold(mem.memberType);
        const expectedCrossings=noshowCrossings(newCount,threshold);
        const acked=mem.noshowThresholdAck||0;
        // 새로 임계값을 넘은 경우에만 패널티 확인 패널로 전환 — 그 외엔 패널 없이 바로 닫힘
        // (이전엔 노쇼마다 무조건 패널이 떠서, 임계값 미달인데 "적용"을 눌러 차감이 잘못 올라가는 버그가 있었음)
        if(expectedCrossings>acked){
          setPenaltyStep({newCount,expectedCrossings,acked});
          return;
        }
      }
    }
    onClose();
  }

  function doReset(){
    // 취소(노쇼/대리취소) 되돌리기면 해당 취소로 생성된 회원 알림도 함께 삭제 — 알림이 이미 나간 상태로 남는 것 방지
    if(live.status==="cancelled"&&mem){
      const dateLabel=fmtWithDow(rec.date);
      setNotices(prev=>{
        const match=[...prev].filter(n=>n.targetMemberId===mem.id&&n.title==="❌예약취소❌"&&n.content.startsWith(dateLabel)).sort((a,b)=>b.id-a.id)[0];
        return match?prev.filter(n=>n.id!==match.id):prev;
      });
    }
    setBookings(p=>p.map(b=>b.id===rec.id?{...b,status:"reserved",confirmedAttend:null}:b));
    onClose();
  }

  function doLink(targetMem){
    setBookings(p=>p.map(b=>b.id===rec.id?{...b,memberId:targetMem.id,onedayName:null}:b));
    onClose();
  }

  const filteredMembers=linkSearch
    ?members.filter(m=>m.name.includes(linkSearch)||(m.phone&&m.phone.includes(linkSearch)))
    :members.slice(0,20);

  const btn=(extra={})=>({borderRadius:10,padding:"10px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,border:"none",...extra});

  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:300}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={{fontSize:20}}>📋</span>
          <div>
            <div style={S.modalTitle}>{mem?mem.name:rec.onedayName}</div>
            <div style={{fontSize:12,color:"#9a8e80",marginTop:2}}>{slotLabel} 출석 확인</div>
          </div>
        </div>

        {/* ── 출석 확인됨 ── */}
        {live.confirmedAttend===true&&(
          <div style={{textAlign:"center",marginBottom:12}}>
            <div style={{fontSize:32,marginBottom:6}}>{live.walkIn?"☑️":"✅"}</div>
            <div style={{fontSize:13,color:"#9a8e80"}}>출석 확인됨 {live.walkIn?"(워크인)":""}</div>
            <button onClick={doReset} style={{marginTop:10,background:"none",border:"none",fontSize:12,color:"#9a8e80",cursor:"pointer",fontFamily:FONT}}>↩ 되돌리기</button>
          </div>
        )}

        {/* ── 초기 상태: 출석 | 불참 ── */}
        {live.confirmedAttend==null&&!cancelPanel&&(
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={doAttend} style={btn({flex:1,background:"#eef5ee",color:"#2e6e44",border:"1.5px solid #7aaa7a",padding:"14px 0",fontSize:14})}>✅ 출석</button>
            <button onClick={()=>setCancelPanel(true)} style={btn({flex:1,background:"#fff0f0",color:"#c97474",border:"1.5px solid #f0b0b0",padding:"14px 0",fontSize:14})}>❌ 불참</button>
          </div>
        )}

        {/* ── 기존 불참 처리됨 상태 (하위 호환) ── */}
        {live.confirmedAttend===false&&!cancelPanel&&(
          <div style={{textAlign:"center",marginBottom:12}}>
            <div style={{fontSize:32,marginBottom:6}}>❌</div>
            <div style={{fontSize:13,color:"#9a8e80",marginBottom:10}}>불참 처리됨</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={doReset} style={btn({flex:1,background:"#f5f5f5",color:"#9a8e80"})}>↩ 되돌리기</button>
              <button onClick={()=>setCancelPanel(true)} style={btn({flex:1,background:"#fff0f0",color:"#c97474",border:"1.5px solid #f0b0b0"})}>🗑️ 취소처리</button>
            </div>
          </div>
        )}

        {/* ── 패널티 확인 단계 ── */}
        {penaltyStep&&(
          <>
            <div style={{background:"#fff5f5",border:"1.5px solid #f0b0b0",borderRadius:10,padding:"12px 14px",marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:18,marginBottom:4}}>⚠️</div>
              <div style={{fontSize:13,fontWeight:700,color:"#c97474",marginBottom:4}}>노쇼 {penaltyStep.newCount}회</div>
              <div style={{fontSize:12,color:"#9a8e80"}}>패널티를 적용할까요?</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{
                // 패스: 패널티 없이 임계 ack만 갱신
                setMembers(p=>p.map(x=>x.id===mem.id?{...x,noshowThresholdAck:Math.max(x.noshowThresholdAck||0,penaltyStep.expectedCrossings)}:x));
                onClose();
              }} style={btn({flex:1,background:"#f5f5f5",color:"#9a8e80"})}>이번은 패스</button>
              <button onClick={()=>{
                // 적용: 잔여 1회 즉시 차감
                setMembers(p=>p.map(x=>x.id===mem.id?{...x,noshowPenalties:(x.noshowPenalties||0)+1,noshowThresholdAck:Math.max(x.noshowThresholdAck||0,penaltyStep.expectedCrossings)}:x));
                onClose();
              }} style={btn({flex:1,background:"#fff0f0",color:"#c97474",border:"1.5px solid #f0b0b0"})}>적용</button>
            </div>
          </>
        )}

        {/* ── 불참 패널: 노쇼 | 대리취소 ── */}
        {cancelPanel&&!penaltyStep&&(
          <>
            <div style={{display:"flex",gap:7,marginBottom:10}}>
              {[["noshow","🚫 노쇼","#c97474","#fff5f5"],["proxy","📞 대리취소","#4a6a4a","#f0f8f0"]].map(([type,label,color,bg])=>(
                <button key={type} onClick={()=>{setCancelType(type);setNote("");}}
                  style={{flex:1,padding:"9px 0",borderRadius:9,border:`1.5px solid ${cancelType===type?color:"#e0d8cc"}`,background:cancelType===type?bg:"#fafaf7",color:cancelType===type?color:"#9a8e80",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>
                  {label}
                </button>
              ))}
            </div>
            {/* 대리취소만 사유 입력 — 사유를 적어야 회원에게 알림이 감 (빈 채로 확인하면 알림 없음) */}
            {cancelType==="proxy"&&(
              <>
                <textarea style={{...S.inp,height:56,resize:"none",fontSize:12,marginBottom:4}}
                  value={note} onChange={e=>setNote(e.target.value)} placeholder="취소 사유" autoFocus/>
                <div style={{fontSize:11,color:"#9a8e80",marginBottom:10}}>{note.trim()?"✅ 회원에게 알림이 갑니다":"사유를 적으면 회원에게 알림이 갑니다 (비워두면 알림 없음)"}</div>
              </>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={onClose} style={btn({flex:1,background:"#f5f5f5",color:"#9a8e80"})}>닫기</button>
              <button onClick={()=>_execDelete(cancelType==="proxy"&&note.trim()!=="")}
                style={btn({flex:2,
                  background:cancelType==="noshow"?"#fff0f0":"#eef5ee",
                  color:cancelType==="noshow"?"#c97474":"#2e6e44",
                  border:`1.5px solid ${cancelType==="noshow"?"#f0b0b0":"#7aaa7a"}`})}>
                확인
              </button>
            </div>
          </>
        )}

        {/* ── 미연결 워크인: 회원 연결 ── */}
        {!mem&&!linkMode&&!cancelPanel&&(
          <button onClick={()=>setLinkMode(true)} style={{width:"100%",marginBottom:8,background:"#edf3ff",color:"#3d5494",border:"1px solid #b0c4e8",borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>
            🔗 회원으로 연결
          </button>
        )}
        {linkMode&&(
          <div style={{marginBottom:8}}>
            <input style={{...S.inp,fontSize:12,marginBottom:6}} value={linkSearch} onChange={e=>setLinkSearch(e.target.value)} placeholder="이름·전화번호 검색" autoFocus/>
            <div style={{maxHeight:160,overflowY:"auto",border:"1px solid #e0d8cc",borderRadius:8}}>
              {filteredMembers.map(m=>(
                <button key={m.id} onClick={()=>doLink(m)} style={{display:"block",width:"100%",textAlign:"left",padding:"8px 12px",fontSize:13,background:"none",border:"none",borderBottom:"1px solid #f0ece4",cursor:"pointer",fontFamily:FONT}}>
                  {m.name}
                  {m.phone&&<span style={{fontSize:11,color:"#9a8e80",marginLeft:8}}>{m.phone}</span>}
                </button>
              ))}
              {filteredMembers.length===0&&<div style={{padding:"10px 12px",fontSize:12,color:"#9a8e80"}}>검색 결과 없음</div>}
            </div>
            <button onClick={()=>{setLinkMode(false);setLinkSearch("");}} style={{...S.cancelBtn,width:"100%",marginTop:6}}>취소</button>
          </div>
        )}

        {/* 패널/패널티 단계 닫혀있을 때만 하단 닫기 버튼 표시 */}
        {!cancelPanel&&!penaltyStep&&<button onClick={onClose} style={{...S.cancelBtn,width:"100%",marginTop:4}}>닫기</button>}
      </div>
    </div>
  );
}
