import { useState } from "react";
import { FONT } from "../constants.js";
import { endOfMonth } from "../utils.js";
import { calc3MonthEnd } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";
import { TODAY_STR } from "../constants.js";

export default function RenewalModal({member,onClose,onSave,pendingPeriod=null}){
  const closures=useClosures();
  // pendingPeriod: 기존 미정 기수 확정 모드 — 해당 기수 데이터 pre-fill
  const isConfirm=!!pendingPeriod;
  const [pending,setPending]=useState(false);
  const [form,setForm]=useState(()=>{
    if(isConfirm){
      const initEnd=pendingPeriod.memberType==="3month"?calc3MonthEnd(TODAY_STR,closures):endOfMonth(TODAY_STR);
      return{startDate:TODAY_STR,endDate:initEnd,total:pendingPeriod.total||24,memberType:pendingPeriod.memberType||member.memberType,payment:pendingPeriod.payment||"카드",includePending:pendingPeriod.includePending??true,confirmPendingId:pendingPeriod.id};
    }
    const initEnd=member.memberType==="3month"?calc3MonthEnd(TODAY_STR,closures):endOfMonth(TODAY_STR);
    return{startDate:TODAY_STR,endDate:initEnd,total:member.memberType==="3month"?24:10,memberType:member.memberType,payment:"카드",includePending:true};
  });
  // 미정 토글 시 startDate/endDate null로 초기화
  function togglePending(){
    setPending(v=>{
      const next=!v;
      if(next) setForm(f=>({...f,startDate:null,endDate:null}));
      else{const s=TODAY_STR;setForm(f=>({...f,startDate:s,endDate:f.memberType==="3month"?calc3MonthEnd(s,closures):endOfMonth(s)}));}
      return next;
    });
  }
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>{isConfirm?"📅":"🔄"}</span><div><div style={S.modalTitle}>{isConfirm?"미정 기수 시작일 확정":"회원권 갱신"}</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>
        {/* 시작일 미정 토글 — confirm 모드(미정 확정)에서는 숨김 */}
        {!isConfirm&&<div style={{...S.fg,background:pending?"#edf3ff":"#f7f5f2",borderRadius:9,padding:"10px 12px",border:`1px solid ${pending?"#7a9ad4":"#e0d8cc"}`,marginBottom:4}}>
          <label style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer"}}>
            <div onClick={togglePending} style={{width:36,height:20,borderRadius:10,background:pending?"#3d5494":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:pending?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:13,color:pending?"#3d5494":"#9a8e80",fontWeight:600}}>시작일 미정</span>
            <span style={{fontSize:11,color:"#9a8e80"}}>— 잔여 소진 후 다음 출석일이 시작일</span>
          </label>
        </div>}
        <div style={S.fg}><label style={S.lbl}>갱신 타입</label>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            {[["1month","1개월"],["3month","3개월"]].map(([v,l])=>(<button key={v} onClick={()=>{const autoEnd=v==="3month"?calc3MonthEnd(form.startDate,closures):endOfMonth(form.startDate);setForm(f=>({...f,memberType:v,total:v==="3month"?24:10,endDate:autoEnd,payment:"카드"}));}} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:14,fontFamily:FONT,borderColor:form.memberType===v?"#4a7a5a":"#e0d8cc",background:form.memberType===v?"#eef5ee":"#faf8f5",color:form.memberType===v?"#2e5c3e":"#9a8e80",fontWeight:form.memberType===v?700:400}}>{l}</button>))}
          </div>
          {/* 결제 방법: 1개월=카드/현금/네이버, 3개월=카드/현금 */}
          <div style={{display:"flex",gap:8}}>
            {(form.memberType==="1month"
              ? [["카드","#edf0f8","#3d5494"],["현금","#fdf3e3","#8a5510"],["네이버","#e8f4e8","#2e6e44"]]
              : [["카드","#edf0f8","#3d5494"],["현금","#fdf3e3","#8a5510"]]
            ).map(([v,bg,color])=>(<button key={v} onClick={()=>setForm(f=>({...f,payment:f.payment===v?"":v}))} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:13,fontFamily:FONT,borderColor:form.payment===v?color:"#e0d8cc",background:form.payment===v?bg:"#faf8f5",color:form.payment===v?color:"#9a8e80",fontWeight:form.payment===v?700:400}}>{v}</button>))}
          </div>
        </div>
        {/* 미정 시 날짜 입력 숨김 */}
        {!pending&&<div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>시작일</label><input style={S.inp} type="date" value={form.startDate||""} onChange={e=>{const s=e.target.value;const autoEnd=form.memberType==="3month"?calc3MonthEnd(s,closures):endOfMonth(s);setForm(f=>({...f,startDate:s,endDate:autoEnd}));}}/></div><div style={{...S.fg,flex:1}}><label style={S.lbl}>종료일</label><input style={S.inp} type="date" value={form.endDate||""} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/></div></div>}
        {/* 빈 문자열 허용 후 유효 숫자일 때만 저장 — if(v>0)만 쓰면 backspace로 못 지우는 버그 */}
        <div style={S.fg}><label style={S.lbl}>총 회차</label><input style={S.inp} type="number" min="1" value={form.total||""} onChange={e=>{const raw=e.target.value;if(raw===""){setForm(f=>({...f,total:""}));return;}const v=parseInt(raw,10);if(!isNaN(v)&&v>0)setForm(f=>({...f,total:v}));}}/></div>
        <div style={{...S.fg,background:"#fffaeb",borderRadius:9,padding:"10px 12px",border:"1px solid #e8c44a"}}>
          <label style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer"}}>
            <div onClick={()=>setForm(f=>({...f,includePending:!f.includePending}))} style={{width:36,height:20,borderRadius:10,background:form.includePending?"#9a5a10":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:form.includePending?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:13,color:"#7a5a10",fontWeight:600}}>임시 1회 포함</span>
            <span style={{fontSize:11,color:"#9a8e80"}}>— 임시 예약을 이번 회원권에 포함</span>
          </label>
        </div>
        <div style={S.modalBtns}><button style={S.cancelBtn} onClick={onClose}>취소</button><button style={{...S.saveBtn,opacity:(pending||form.endDate)&&form.total?1:0.5}} disabled={!((pending||form.endDate)&&form.total)} onClick={()=>onSave(form)}>{isConfirm?"확정":"갱신"}</button></div>
      </div>
    </div>
  );
}
