import { useState } from "react";
import { FONT, TODAY_STR, TODAY } from "../constants.js";
import { parseLocal, fmt, addDays } from "../utils.js";
import { holdingElapsed, isTerminatedByHolding, totalHoldingCalendarDays } from "../memberCalc.js";
import S from "../styles.js";

export default function HoldingModal({member,onClose,onSave,closures=[]}){
  const hasH=!!member.holding;
  const terminated=hasH&&isTerminatedByHolding(member); // 홀딩 90일 초과 → 종료처리 전용 UI
  const [start,setStart]=useState(hasH?member.holding.startDate:TODAY_STR);
  const [resumeDate,setResumeDate]=useState(TODAY_STR);

  // 홀딩 endDate = 복귀일 전날 (복귀일 당일은 수업 가능 → 홀딩에 포함 안 됨)
  const holdingEndDate = resumeDate ? addDays(resumeDate, -1) : (start ? addDays(TODAY_STR, -1) : TODAY_STR);
  // calDays: 캘린더 일수 (시작일 당일 미포함) — 연장에 1:1 적용
  const calDays=start?Math.max(0,Math.ceil((parseLocal(holdingEndDate)-parseLocal(start))/86400000)):0;
  const elapsed=start?Math.max(0,Math.ceil((TODAY-parseLocal(start))/86400000)):0; // !hasH 안내용
  // 연장 후 종료일: 완료된 홀딩 이력 합산 + 이번 캘린더 일수 + 보너스
  const pastHoldCal=(member.holdingHistory||[]).reduce((sum,h)=>sum+(h.startDate&&h.endDate?Math.max(0,Math.ceil((parseLocal(h.endDate)-parseLocal(h.startDate))/86400000)):0),0);
  const newEnd=addDays(member.endDate,pastHoldCal+calDays+(member.bonusDays||0));

  function handleResume(){
    onSave({startDate:start,endDate:holdingEndDate,workdays:calDays,resumed:true});
  }
  function handleStart(){
    onSave({startDate:start,endDate:null,workdays:0,resumed:false});
  }
  function handleCancel(){ onSave(null); }

  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>⏸️</span><div><div style={S.modalTitle}>홀딩 관리</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>

        {hasH&&terminated&&<>
          {/* 홀딩 90일 초과: 복귀 불가, 종료처리만 허용 */}
          <div style={{background:"#fdf0f0",borderRadius:12,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,color:"#c97474",marginBottom:8}}>⚠️ 홀딩 90일 초과</div>
            <div style={{fontSize:12,color:"#9a6060",lineHeight:1.7}}>
              누적 홀딩 <strong>{totalHoldingCalendarDays(member)}일</strong>로 90일을 초과했습니다.<br/>
              이 회원권은 종료 처리됩니다.
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>onSave({terminated:true,startDate:start,endDate:holdingEndDate,workdays:0})} style={{flex:2,background:"#c97474",color:"#fff",border:"none",borderRadius:9,padding:"12px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>종료 처리</button>
            <button onClick={onClose} style={{flex:1,background:"#f5f3ef",color:"#9a8e80",border:"1px solid #e0dcd0",borderRadius:9,padding:"12px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT}}>닫기</button>
          </div>
        </>}

        {hasH&&!terminated&&<>
          <div style={{background:"#edf0f8",borderRadius:12,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,color:"#3d5494",marginBottom:10}}>⏸️ 홀딩 진행 중</div>
            <div style={{display:"flex",gap:12,marginBottom:10}}>
              <div style={{flex:1}}>
                <label style={S.lbl}>시작일</label>
                <input style={S.inp} type="date" value={start} onChange={e=>setStart(e.target.value)} max={TODAY_STR}/>
              </div>
              <div style={{flex:1}}>
                <label style={S.lbl}>복귀일</label>
                <input style={S.inp} type="date" value={resumeDate} onChange={e=>setResumeDate(e.target.value)} min={start} max={TODAY_STR}/>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#4a4a6a",marginBottom:6}}>
              <span>경과</span>
              <span style={{fontWeight:700,color:"#3d5494"}}>{calDays}일 (캘린더)</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#7a6e60",background:"#f0f4f0",borderRadius:8,padding:"8px 12px"}}>
              <span>연장 후 종료일</span><span style={{fontWeight:700,color:"#2e5c3e"}}>{fmt(newEnd)} (+{calDays}일)</span>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleResume} style={{flex:2,background:"#4a7a5a",color:"#fff",border:"none",borderRadius:9,padding:"12px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>✅ 복귀 처리</button>
            <button onClick={handleCancel} style={{flex:1,background:"#fdf0f0",color:"#c97474",border:"1px solid #f0d0d0",borderRadius:9,padding:"12px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT}}>🗑️ 홀딩 취소</button>
          </div>
        </>}

        {!hasH&&<>
          <div style={{marginBottom:12}}>
            <label style={S.lbl}>홀딩 시작일</label>
            <input style={S.inp} type="date" value={start} onChange={e=>setStart(e.target.value)} max={TODAY_STR}/>
          </div>
          {start&&<div style={{background:"#f5f3ef",borderRadius:10,padding:"12px",marginBottom:14,fontSize:12,color:"#9a8e80"}}>
            오늘까지 {elapsed}일 경과 · 복귀 처리 시 캘린더 일수만큼 종료일이 자동 연장됩니다
          </div>}
          <div style={S.modalBtns}>
            <button style={S.cancelBtn} onClick={onClose}>닫기</button>
            <button style={S.saveBtn} onClick={handleStart} disabled={!start}>홀딩 시작</button>
          </div>
        </>}
      </div>
    </div>
  );
}
