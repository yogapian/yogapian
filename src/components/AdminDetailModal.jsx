// ─── AdminDetailModal.jsx ─────────────────────────────────────────────────────
// 관리자용 회원 상세 모달
// 공통 컨텐츠: MemberDetailContent (회원 뷰와 동일)
// 관리자 전용 추가: 횟수·기간 수정, 갱신/홀딩 버튼, 전화번호, 수정/삭제 버튼

import { useState } from "react";
import { FONT, TODAY_STR } from "../constants.js";
import { usedAsOf, calc3MonthEnd } from "../memberCalc.js";
import S from "../styles.js";
import MemberDetailContent from "./MemberDetailContent.jsx";

export default function AdminDetailModal({member,bookings,onClose,onRenew,onHolding,onExt,onAdjust,onSetPending,onPaymentPending,onEdit,onDel}){
  // 마지막 갱신 이력 기준으로 초기화 — member 상위 필드가 이력과 불일치할 때 이력이 정확한 값
  const _lastRH=(member.renewalHistory||[]).slice(-1)[0];
  // null startDate(미정 기수)는 빈 문자열로 — member.* 폴백 금지 (기수 불일치 방지)
  const _rhStart=_lastRH ? (_lastRH.startDate??"") : (member.startDate||"");
  const _rhEnd  =_lastRH ? (_lastRH.endDate??  "") : (member.endDate  ||"");
  const [adjMode,setAdjMode]=useState(false);
  const [adjTotal,setAdjTotal]=useState(_lastRH?.total??member.total);
  const [adjStart,setAdjStart]=useState(_rhStart);
  const [adjEnd,setAdjEnd]=useState(_rhEnd);
  const [adjBonusDays,setAdjBonusDays]=useState(member.bonusDays||0); // 보너스 연장일
  const _adjMemberType=_lastRH?.memberType||member.memberType; // 3개월 재계산 버튼 표시 기준

  // 마지막 기수 기준 잔여 — null startDate(미정) 기수는 used=0 으로 계산
  const _lastRHUsed=_lastRH?.startDate ? usedAsOf(member.id, TODAY_STR, bookings, [member]) : 0;
  const dispUsed = _lastRHUsed;
  const phoneDigits = (member.phone||"").replace(/\D/g,"");
  const phoneFormatted = phoneDigits.length===11
    ? `${phoneDigits.slice(0,3)}-${phoneDigits.slice(3,7)}-${phoneDigits.slice(7)}`
    : member.phone||"";

  // ─── 관리자 전용 섹션: 횟수·기간 수정 폼 + 갱신/홀딩 버튼 ───────────────
  const adjSection = (
    <>
      {!adjMode && (
        <div style={{marginBottom:10,textAlign:"right"}}>
          <button onClick={()=>{setAdjTotal(_lastRH?.total??member.total);setAdjStart(_rhStart);setAdjEnd(_rhEnd);setAdjBonusDays(member.bonusDays||0);setAdjMode(true);}}
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
              <input type="date" value={adjStart} onChange={e=>{const s=e.target.value;setAdjStart(s);if(member.memberType==="3month")setAdjEnd(calc3MonthEnd(s));}} style={{...S.inp,fontSize:13,padding:"7px 9px"}}/>
            </div>
            <div style={{flex:1,minWidth:120}}>
              <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>
                종료일
                {_adjMemberType==="3month"&&<button onClick={()=>setAdjEnd(calc3MonthEnd(adjStart))} style={{marginLeft:6,fontSize:10,background:"#eef5ee",color:"#2e6e44",border:"1px solid #7acca0",borderRadius:5,padding:"1px 6px",cursor:"pointer",fontFamily:FONT}}>3개월 재계산</button>}
              </div>
              <input type="date" value={adjEnd} onChange={e=>setAdjEnd(e.target.value)} style={{...S.inp,fontSize:13,padding:"7px 9px"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
            {/* 보너스 연장일 — 관리자 재량 추가 연장 */}
            <div>
              <div style={{fontSize:11,color:"#7a5a10",marginBottom:4,fontWeight:600}}>보너스 연장일</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>setAdjBonusDays(d=>Math.max(0,d-1))} style={{...S.stepper}}>−</button>
                <span style={{fontSize:16,fontWeight:700,minWidth:28,textAlign:"center",color:"#7a5a10"}}>{adjBonusDays}</span>
                <button onClick={()=>setAdjBonusDays(d=>d+1)} style={{...S.stepper}}>+</button>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>setAdjMode(false)} style={S.cancelBtn}>취소</button>
            <button onClick={()=>{onAdjust&&onAdjust({total:adjTotal,startDate:adjStart,endDate:adjEnd,bonusDays:adjBonusDays});setAdjMode(false);}}
              style={{...S.saveBtn,background:"#e8a44a",fontSize:12}}>저장</button>
          </div>
        </div>
      )}
      {/* 결제 대기 토글 */}
      {member.paymentPending&&(
        <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff5f5",border:"1.5px solid #f0a0a0",borderRadius:10,padding:"9px 14px",marginBottom:12}}>
          <span style={{fontSize:13,flex:1,fontWeight:700,color:"#c97474"}}>💳 현장결제 대기 중</span>
          <button onClick={onPaymentPending} style={{fontSize:11,background:"#c97474",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontFamily:FONT,fontWeight:700}}>결제 완료</button>
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
        {/* 미래 기수가 있을 때만 표시 — 시작일을 미정으로 전환 */}
        {(member.renewalHistory||[]).some(r=>r.startDate&&r.startDate>TODAY_STR)&&(
          <button onClick={onSetPending}
            style={{background:"#edf3ff",color:"#3d5494",border:"1px solid #b0c4e8",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>
            📅 미정 전환
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
