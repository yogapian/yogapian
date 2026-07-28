import { useState } from "react";
import { FONT, TIME_SLOTS } from "../constants.js";
import { fmtWithDow } from "../utils.js";
import S from "../styles.js";

// onConfirm(note, sendNotice, cancelType)
// cancelType: "noshow" | "proxy"
export default function AdminCancelModal({booking,member,onClose,onConfirm}){
  const [note,setNote]=useState("");
  const [cancelType,setCancelType]=useState("noshow"); // 기본값: 노쇼
  const sl=TIME_SLOTS.find(t=>t.key===booking.timeSlot);

  const btnBase={flex:1,borderRadius:9,padding:"10px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,border:"1.5px solid"};

  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={{fontSize:20}}>⚠️</span>
          <div>
            <div style={S.modalTitle}>예약 취소</div>
            <div style={{fontSize:12,color:"#9a8e80",marginTop:2}}>{member?.name||booking.onedayName}</div>
          </div>
        </div>
        <div style={{background:"#fdf3e3",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#8a5510",marginBottom:14}}>
          {fmtWithDow(booking.date)} {sl?.label} {sl?.time}
        </div>

        {/* 취소 유형 선택 */}
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <button onClick={()=>setCancelType("noshow")} style={{...btnBase,
            borderColor:cancelType==="noshow"?"#c97474":"#e0d8cc",
            background:cancelType==="noshow"?"#fff5f5":"#fafaf7",
            color:cancelType==="noshow"?"#c97474":"#9a8e80"}}>
            🚫 노쇼
          </button>
          <button onClick={()=>setCancelType("proxy")} style={{...btnBase,
            borderColor:cancelType==="proxy"?"#4a6a4a":"#e0d8cc",
            background:cancelType==="proxy"?"#f0f8f0":"#fafaf7",
            color:cancelType==="proxy"?"#4a6a4a":"#9a8e80"}}>
            📞 대리취소
          </button>
        </div>

        {/* 유형 설명 */}
        <div style={{fontSize:11,color:"#9a8e80",background:"#f7f5f2",borderRadius:8,padding:"7px 11px",marginBottom:12}}>
          {cancelType==="noshow"
            ?"노쇼: 출석하지 않음. 노쇼 횟수로 기록됩니다."
            :"대리취소: 회원 요청으로 관리자가 대신 취소합니다."}
        </div>

        <div style={S.fg}>
          <label style={S.lbl}>메모 (선택)</label>
          <textarea style={{...S.inp,height:60,resize:"none"}} value={note} onChange={e=>setNote(e.target.value)}
            placeholder={cancelType==="noshow"?"":"취소 사유"}/>
        </div>

        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button style={S.cancelBtn} onClick={onClose}>닫기</button>
          {/* 노쇼: 알림 없음 / 대리취소: 무조건 알림 포함 */}
          <button style={{flex:1,...S.saveBtn,background:cancelType==="noshow"?"#c97474":"#4a6a4a",padding:"9px 0"}}
            onClick={()=>onConfirm(note,cancelType==="proxy",cancelType)}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
