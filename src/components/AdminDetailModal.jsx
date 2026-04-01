// ─── AdminDetailModal.jsx ─────────────────────────────────────────────────────
// 관리자용 회원 상세 모달
// 공통 컨텐츠: MemberDetailContent (회원 뷰와 동일)
// 관리자 전용 추가: 횟수·기간 수정, 갱신/홀딩 버튼, 전화번호, 수정/삭제 버튼

import { useState } from "react";
import { FONT, TODAY_STR } from "../constants.js";
import { usedAsOf } from "../memberCalc.js";
import S from "../styles.js";
import MemberDetailContent from "./MemberDetailContent.jsx";

export default function AdminDetailModal({member,bookings,onClose,onRenew,onHolding,onExt,onAdjust,onEdit,onDel}){
  const [adjMode,setAdjMode]=useState(false);
  const [adjTotal,setAdjTotal]=useState(member.total);
  const [adjStart,setAdjStart]=useState(member.startDate||"");
  const [adjEnd,setAdjEnd]=useState(member.endDate||"");

  const dispUsed = usedAsOf(member.id, TODAY_STR, bookings, [member]);
  const phoneDigits = (member.phone||"").replace(/\D/g,"");
  const phoneFormatted = phoneDigits.length===11
    ? `${phoneDigits.slice(0,3)}-${phoneDigits.slice(3,7)}-${phoneDigits.slice(7)}`
    : member.phone||"";

  // ─── 관리자 전용 섹션: 횟수·기간 수정 폼 + 갱신/홀딩 버튼 ───────────────
  const adjSection = (
    <>
      {!adjMode && (
        <div style={{marginBottom:10,textAlign:"right"}}>
          <button onClick={()=>{setAdjTotal(member.total);setAdjStart(member.startDate||"");setAdjEnd(member.endDate||"");setAdjMode(true);}}
            style={{fontSize:11,background:"#fdf3e3",color:"#9a5a10",border:"1px solid #e8c44a",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontFamily:FONT,fontWeight:600}}>
            ✏️ 횟수·기간 수정
          </button>
        </div>
      )}
      {adjMode && (
        <div style={{background:"#fffaeb",border:"1px solid #e8c44a",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:"#7a5a10",marginBottom:10}}>✏️ 등록 횟수·기간 직접 수정</div>
          <div style={{display:"flex",gap:14,marginBottom:10,flexWrap:"wrap",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>등록 횟수</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>setAdjTotal(t=>Math.max(0,t-1))} style={{...S.stepper}}>−</button>
                <span style={{fontSize:16,fontWeight:700,minWidth:28,textAlign:"center"}}>{adjTotal}</span>
                <button onClick={()=>setAdjTotal(t=>t+1)} style={{...S.stepper}}>+</button>
              </div>
              <div style={{fontSize:11,color:"#2e6e44",fontWeight:700,marginTop:4}}>잔여 {Math.max(0,adjTotal-dispUsed)}회</div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:120}}>
              <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>시작일</div>
              <input type="date" value={adjStart} onChange={e=>setAdjStart(e.target.value)} style={{...S.inp,fontSize:13,padding:"7px 9px"}}/>
            </div>
            <div style={{flex:1,minWidth:120}}>
              <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>종료일</div>
              <input type="date" value={adjEnd} onChange={e=>setAdjEnd(e.target.value)} style={{...S.inp,fontSize:13,padding:"7px 9px"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>setAdjMode(false)} style={S.cancelBtn}>취소</button>
            <button onClick={()=>{onAdjust&&onAdjust({total:adjTotal,startDate:adjStart,endDate:adjEnd});setAdjMode(false);}}
              style={{...S.saveBtn,background:"#e8a44a",fontSize:12}}>저장</button>
          </div>
        </div>
      )}
      {/* 갱신 / 홀딩 버튼 */}
      <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
        <button onClick={onRenew} style={{...S.saveBtn,fontSize:12,padding:"7px 12px"}}>🔄 갱신</button>
        {member.memberType==="3month" && (
          <button onClick={onHolding}
            style={{background:"#edf0f8",color:"#3d5494",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>
            {member.holding ? "⏸️ 홀딩 관리" : "⏸️ 홀딩"}
          </button>
        )}
      </div>
    </>
  );

  // 전화번호 행 (날짜박스 하단에 삽입)
  const extraInfoRows = member.phone ? (
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:0,marginTop:4,paddingTop:4,borderTop:"1px solid #ece8e0"}}>
      <span style={{color:"#9a8e80"}}>전화번호</span>
      <a href={`tel:${phoneDigits}`} style={{color:"#3d5494",fontWeight:700,textDecoration:"none"}}>{phoneFormatted}</a>
    </div>
  ) : null;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:440,maxHeight:"92vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"18px 18px 0",overflowY:"auto",flex:1}}>
          <MemberDetailContent
            member={member}
            bookings={bookings}
            onClose={onClose}
            showNickname={true}
            adjSection={adjSection}
            extraInfoRows={extraInfoRows}
          />
        </div>
        <div style={{padding:"10px 18px",borderTop:"1px solid #f0ece4",display:"flex",gap:7}}>
          <button style={{...S.cancelBtn,flex:1,textAlign:"center"}} onClick={onClose}>닫기</button>
          {onEdit && <button style={{...S.editBtn,flex:1,textAlign:"center"}} onClick={()=>{onClose();onEdit();}}>✏️ 수정</button>}
          {onDel  && <button style={{...S.delBtn, flex:1,textAlign:"center"}} onClick={()=>{onClose();onDel();}}>🗑 삭제</button>}
        </div>
      </div>
    </div>
  );
}
