import { useState } from "react";
import { FONT, TIME_SLOTS } from "../constants.js";
import { fmtWithDow } from "../utils.js";
import S from "../styles.js";

export default function AdminCancelModal({booking,member,onClose,onConfirm}){
  const [note,setNote]=useState("");
  const sl=TIME_SLOTS.find(t=>t.key===booking.timeSlot);
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={{fontSize:20}}>⚠️</span>
          <div>
            <div style={S.modalTitle}>예약 강제 취소</div>
            <div style={{fontSize:12,color:"#9a8e80",marginTop:2}}>{member?.name}</div>
          </div>
        </div>
        <div style={{background:"#fdf3e3",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#8a5510",marginBottom:14}}>
          {fmtWithDow(booking.date)} {sl?.label} {sl?.time}<br/>취소 시 잔여 횟수가 복구됩니다.
        </div>
        <div style={S.fg}>
          <label style={S.lbl}>취소 사유 (선택)</label>
          <textarea
            style={{...S.inp,height:80,resize:"none"}}
            value={note}
            onChange={e=>setNote(e.target.value)}
            placeholder="예: 노쇼 처리, 강사 사정 등"
          />
        </div>
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button style={S.cancelBtn} onClick={onClose}>닫기</button>
          <button style={{flex:1,background:"#f5f5f5",color:"#9a8e80",border:"1px solid #e0d8cc",borderRadius:9,padding:"9px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}} onClick={()=>onConfirm(note,false)}>알림없이 취소</button>
          <button style={{flex:1,...S.saveBtn,background:"#c97474",padding:"9px 0"}} onClick={()=>onConfirm(note,true)}>취소+알림</button>
        </div>
      </div>
    </div>
  );
}
