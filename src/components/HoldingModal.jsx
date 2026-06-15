import { useState } from "react";
import { FONT, TODAY_STR, TODAY } from "../constants.js";
import { parseLocal, fmt, addDays, addWeekdays, countWorkdays } from "../utils.js";
import { holdingElapsed } from "../memberCalc.js";
import S from "../styles.js";

// 홀딩 기간 내 정기 휴강(extensionOverride 없음)만 차감
// - 정기 휴강: 연장 없음 → 주말과 동일, 수업 없으니 홀딩 일수에서 제외
// - 연장 있는 휴강: 이미 종료일 연장이 별도 적용됨 → 홀딩 일수에서 건드리지 않음
function countClosuresInRange(closures=[], startDate, endDate) {
  if(!startDate || !endDate) return 0;
  return closures.filter(cl => !cl.timeSlot && !cl.extensionOverride && cl.date >= startDate && cl.date <= endDate).length;
}

export default function HoldingModal({member,onClose,onSave,closures=[]}){
  const hasH=!!member.holding;
  const [start,setStart]=useState(hasH?member.holding.startDate:TODAY_STR);
  const [resumeDate,setResumeDate]=useState(TODAY_STR);

  // 홀딩 endDate = 복귀일 전날 (복귀일 당일은 수업 가능 → 홀딩에 포함 안 됨)
  const holdingEndDate = resumeDate ? addDays(resumeDate, -1) : (start ? addDays(TODAY_STR, -1) : TODAY_STR);
  // elapsed: 표시용 캘린더 일수(주말 포함) / rawDays: 연장 계산용 평일수(주말 제외)
  // 시작일 당일은 수업 가능일이므로 카운트 제외 — 다음날(start+1)부터 집계
  const elapsed=start?Math.max(0,Math.ceil((TODAY-parseLocal(start))/86400000)):0;
  const _s1=start?addDays(start,1):"";
  const rawDays=_s1?(resumeDate?countWorkdays(_s1,holdingEndDate):countWorkdays(_s1,addDays(TODAY_STR,-1))):0;
  // 홀딩 기간 내 정기 휴강일(평일 휴강) 추가 차감 — 주말처럼 홀딩 일수에서 제외
  const closuresInHolding=countClosuresInRange(closures, _s1, holdingEndDate);
  const resumeDays=Math.max(0, rawDays - closuresInHolding);
  // 연장 후 종료일: 기존 홀딩 연장분 + 이번 복귀분을 평일 기준으로 추가
  const newEnd=addWeekdays(member.endDate,(member.extensionDays||0)+resumeDays);

  function handleResume(){
    // endDate = 복귀일 전날 (복귀 당일은 수업 가능 → 홀딩 기간에서 제외)
    onSave({startDate:start,endDate:holdingEndDate,workdays:resumeDays,resumed:true});
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
