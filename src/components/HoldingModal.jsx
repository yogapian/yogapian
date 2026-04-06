import { useState } from "react";
import { FONT, TODAY_STR, TODAY } from "../constants.js";
import { parseLocal, fmt, addDays } from "../utils.js";
import { holdingElapsed } from "../memberCalc.js";
import S from "../styles.js";

// closures: 홀딩 기간 내 전체 휴강일 수 계산 → 연장일수에서 차감
// (어차피 수업 없는 날은 홀딩 일수에서 제외)
function countClosuresInRange(closures=[], startDate, endDate) {
  if(!startDate || !endDate) return 0;
  return closures.filter(cl => !cl.timeSlot && cl.date >= startDate && cl.date <= endDate).length;
}

export default function HoldingModal({member,onClose,onSave,closures=[]}){
  const hasH=!!member.holding;
  const [start,setStart]=useState(hasH?member.holding.startDate:TODAY_STR);
  const [resumeDate,setResumeDate]=useState(TODAY_STR);

  const elapsed=start?Math.max(0,Math.ceil((TODAY-parseLocal(start))/86400000)):0;
  const rawDays=resumeDate&&start?Math.max(0,Math.ceil((parseLocal(resumeDate)-parseLocal(start))/86400000)):elapsed;
  // 홀딩 기간 내 전체 휴강일 차감 — 수업 없는 날은 홀딩 일수에 포함하지 않음
  const closuresInHolding=countClosuresInRange(closures, start, resumeDate||TODAY_STR);
  const resumeDays=Math.max(0, rawDays - closuresInHolding);
  const newEnd=addDays(member.endDate,(member.extensionDays||0)+resumeDays);

  function handleResume(){
    onSave({startDate:start,endDate:resumeDate||TODAY_STR,workdays:resumeDays,resumed:true});
  }
  function handleStart(){
    onSave({startDate:start,endDate:null,workdays:0,resumed:false});
  }
  function handleCancel(){ onSave(null); }

  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>⏸️</span><div><div style={S.modalTitle}>홀딩 관리</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>

        {hasH&&<>
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
              <span style={{fontWeight:700,color:"#3d5494"}}>
                {rawDays}일{closuresInHolding>0&&<span style={{color:"#9a8e80",fontWeight:400}}> (휴강 {closuresInHolding}일 제외 → {resumeDays}일)</span>}
              </span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#7a6e60",background:"#f0f4f0",borderRadius:8,padding:"8px 12px"}}>
              <span>연장 후 종료일</span><span style={{fontWeight:700,color:"#2e5c3e"}}>{fmt(newEnd)} (+{resumeDays}일)</span>
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
            오늘까지 {elapsed}일 경과 · 복귀 처리 시 기간만큼 종료일이 자동 연장됩니다 (휴강일 제외)
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
