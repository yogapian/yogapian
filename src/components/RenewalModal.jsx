import { useState } from "react";
import { FONT } from "../constants.js";
import { endOfMonth } from "../utils.js";
import { calc3MonthEnd } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";
import { TODAY_STR } from "../constants.js";

export default function RenewalModal({member,onClose,onSave}){
  const closures=useClosures();
  const [form,setForm]=useState({startDate:TODAY_STR,endDate:"",total:member.memberType==="3month"?24:10,memberType:member.memberType,payment:"",includePending:true});
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>🔄</span><div><div style={S.modalTitle}>회원권 갱신</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>
        <div style={S.fg}><label style={S.lbl}>갱신 타입</label>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            {[["1month","1개월"],["3month","3개월"]].map(([v,l])=>(<button key={v} onClick={()=>{const autoEnd=v==="3month"?calc3MonthEnd(form.startDate,closures):endOfMonth(form.startDate);setForm(f=>({...f,memberType:v,total:v==="3month"?24:10,endDate:autoEnd,payment:""}));}} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:14,fontFamily:FONT,borderColor:form.memberType===v?"#4a7a5a":"#e0d8cc",background:form.memberType===v?"#eef5ee":"#faf8f5",color:form.memberType===v?"#2e5c3e":"#9a8e80",fontWeight:form.memberType===v?700:400}}>{l}</button>))}
          </div>
          {/* 결제 방법: 1개월=카드/현금/네이버, 3개월=카드/현금 */}
          <div style={{display:"flex",gap:8}}>
            {(form.memberType==="1month"
              ? [["카드","#edf0f8","#3d5494"],["현금","#fdf3e3","#8a5510"],["네이버","#e8f4e8","#2e6e44"]]
              : [["카드","#edf0f8","#3d5494"],["현금","#fdf3e3","#8a5510"]]
            ).map(([v,bg,color])=>(<button key={v} onClick={()=>setForm(f=>({...f,payment:f.payment===v?"":v}))} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:13,fontFamily:FONT,borderColor:form.payment===v?color:"#e0d8cc",background:form.payment===v?bg:"#faf8f5",color:form.payment===v?color:"#9a8e80",fontWeight:form.payment===v?700:400}}>{v}</button>))}
          </div>
        </div>
        <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>시작일</label><input style={S.inp} type="date" value={form.startDate} onChange={e=>{const s=e.target.value;const autoEnd=form.memberType==="3month"?calc3MonthEnd(s,closures):endOfMonth(s);setForm(f=>({...f,startDate:s,endDate:autoEnd}));}}/></div><div style={{...S.fg,flex:1}}><label style={S.lbl}>종료일</label><input style={S.inp} type="date" value={form.endDate} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/></div></div>
        {/* parseInt 사용: +e.target.value는 "06" → 6 처리 안 돼서 leading zero 버그 발생 */}
        <div style={S.fg}><label style={S.lbl}>총 회차</label><input style={S.inp} type="number" min="1" value={form.total} onChange={e=>{const v=parseInt(e.target.value,10);if(v>0)setForm(f=>({...f,total:v}));}}/></div>
        <div style={{...S.fg,background:"#fffaeb",borderRadius:9,padding:"10px 12px",border:"1px solid #e8c44a"}}>
          <label style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer"}}>
            <div onClick={()=>setForm(f=>({...f,includePending:!f.includePending}))} style={{width:36,height:20,borderRadius:10,background:form.includePending?"#9a5a10":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:form.includePending?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:13,color:"#7a5a10",fontWeight:600}}>임시 1회 포함</span>
            <span style={{fontSize:11,color:"#9a8e80"}}>— 임시 예약을 이번 회원권에 포함</span>
          </label>
        </div>
        <div style={S.modalBtns}><button style={S.cancelBtn} onClick={onClose}>취소</button><button style={{...S.saveBtn,opacity:form.endDate?1:0.5}} disabled={!form.endDate} onClick={()=>onSave(form)}>갱신</button></div>
      </div>
    </div>
  );
}
