import { useState } from "react";
import { FONT, TODAY_STR } from "../constants.js";
import { parseLocal } from "../utils.js";
import S from "../styles.js";

const TYPE_LABEL    = {new_member:"신규", renewal:"갱신", oneday:"원데이", meditation:"명상", other:"기타"};
const PAYMENT_COLOR = {카드:{bg:"#edf0f8",color:"#3d5494"}, 현금:{bg:"#fdf3e3",color:"#8a5510"}, 네이버:{bg:"#e8f4e8",color:"#2e6e44"}};
const TYPE_COLOR  = {
  new_member: {bg:"#fefce8", color:"#a07a10"},
  renewal:    {bg:"#f0ece4", color:"#7a6e60"},
  oneday:     {bg:"#e8f4e8", color:"#2e6e44"},
  meditation: {bg:"#f2edf8", color:"#6a4090"},
  other:      {bg:"#f5f0e8", color:"#7a6040"},
};
const MT_LABEL = {"1month":"1개월", "3month":"3개월"};

const won = n => (n ?? 0).toLocaleString("ko-KR") + "원";

export default function SalesTab({sales, setSales}){
  const now = parseLocal(TODAY_STR);
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [showAdd,   setShowAdd]   = useState(false);
  const [deleteId,  setDeleteId]  = useState(null);
  const [addForm,   setAddForm]   = useState({
    date: TODAY_STR, type: "meditation",
    memberName: "", amount: "", payment: "현금", memo: ""
  });

  const ym = `${year}-${String(month).padStart(2,"0")}`;
  const monthSales = (sales || [])
    .filter(s => s.date.startsWith(ym))
    .sort((a,b) => a.date.localeCompare(b.date) || a.id - b.id);

  const total = monthSales.reduce((acc, s) => acc + (s.amount || 0), 0);
  const byType = {};
  monthSales.forEach(s => { byType[s.type] = (byType[s.type] || 0) + (s.amount || 0); });

  function prevMonth(){ if(month===1){setYear(y=>y-1);setMonth(12);}else setMonth(m=>m-1); }
  function nextMonth(){ if(month===12){setYear(y=>y+1);setMonth(1);}else setMonth(m=>m+1); }

  function doAdd(){
    if(!addForm.amount || !+addForm.amount) return;
    const id = Date.now();
    setSales(p => [...p, {
      id, date: addForm.date, type: addForm.type,
      memberId: null, memberName: addForm.memberName,
      memberType: null, total: null,
      amount: +addForm.amount, payment: addForm.payment,
      memo: addForm.memo,
    }]);
    const [y, m] = addForm.date.split("-").map(Number);
    setYear(y); setMonth(m);
    setShowAdd(false);
    setAddForm({date:TODAY_STR, type:"meditation", memberName:"", amount:"", payment:"현금", memo:""});
  }

  function doDelete(id){ setSales(p => p.filter(s => s.id !== id)); setDeleteId(null); }

  return (
    <div style={{paddingBottom:60}}>

      {/* 월 네비 */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,background:"#fff",borderRadius:12,padding:"10px 16px",border:"1px solid #e4e0d8"}}>
        <button onClick={prevMonth} style={{...S.navBtn,padding:"6px 14px",fontSize:17}}>‹</button>
        <span style={{fontSize:16,fontWeight:700,color:"#1e2e1e"}}>{year}년 {month}월</span>
        <button onClick={nextMonth} style={{...S.navBtn,padding:"6px 14px",fontSize:17}}>›</button>
      </div>

      {/* 요약 */}
      <div style={{background:"#fff",borderRadius:12,padding:"16px",border:"1px solid #e4e0d8",marginBottom:14}}>
        <div style={{fontSize:11,color:"#9a8e80",marginBottom:3}}>이달 총 매출</div>
        <div style={{fontSize:28,fontWeight:700,color:"#1e2e1e",marginBottom:12,letterSpacing:"-0.5px"}}>{won(total)}</div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {["new_member","renewal","oneday","meditation","other"].map(k => {
            const cnt = monthSales.filter(s=>s.type===k).length;
            return cnt > 0 ? (
              <div key={k} style={{background:TYPE_COLOR[k].bg,color:TYPE_COLOR[k].color,borderRadius:8,padding:"5px 11px",fontSize:12,fontWeight:600}}>
                {TYPE_LABEL[k]} <span style={{opacity:.7,fontWeight:400}}>({cnt}건)</span> {won(byType[k])}
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* 거래 목록 */}
      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
        {monthSales.length === 0 && (
          <div style={{color:"#b0a090",fontSize:14,padding:"28px 0",textAlign:"center"}}>이달 매출 내역이 없습니다.</div>
        )}
        {monthSales.map(s => {
          const tc = TYPE_COLOR[s.type] || TYPE_COLOR.other;
          const [,mm,dd] = s.date.split("-");
          const nameDisp = s.memberName || s.memo || "-";
          const infoTag = s.memberType ? `${MT_LABEL[s.memberType]||""} ${s.total||""}회` : (s.memo && s.memberName ? s.memo : "");
          return (
            <div key={s.id} style={{background:"#fff",borderRadius:11,padding:"11px 14px",border:"1px solid #e4e0d8",display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:13,color:"#9a8e80",fontWeight:600,minWidth:32,flexShrink:0}}>{mm}/{dd}</div>
              <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:5,overflow:"hidden"}}>
                <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e",whiteSpace:"nowrap"}}>{nameDisp}</span>
                {infoTag && <span style={{fontSize:11,color:"#9a8e80",whiteSpace:"nowrap",flexShrink:0}}>{infoTag}</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <span style={{fontSize:10,fontWeight:700,borderRadius:6,padding:"2px 7px",background:tc.bg,color:tc.color}}>{TYPE_LABEL[s.type]||"기타"}</span>
                {s.payment && (()=>{const pc=PAYMENT_COLOR[s.payment];return <span style={{fontSize:10,fontWeight:600,borderRadius:6,padding:"2px 7px",background:pc?pc.bg:"#f5f2ec",color:pc?pc.color:"#9a8e80"}}>{s.payment}</span>;})()}
                <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e",minWidth:52,textAlign:"right"}}>{(s.amount||0).toLocaleString("ko-KR")}</span>
                <button onClick={()=>setDeleteId(s.id)} style={{background:"none",border:"none",fontSize:16,color:"#d0b0b0",cursor:"pointer",padding:"0 2px",lineHeight:1,fontFamily:FONT}}>×</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 수기 입력 버튼 */}
      <button onClick={()=>setShowAdd(true)} style={{...S.addBtn,width:"100%",padding:"12px 0",fontSize:13}}>
        + 수기 입력 (원데이 / 명상수업 / 기타)
      </button>

      {/* 수기 입력 폼 */}
      {showAdd && (
        <div style={S.overlay} onClick={()=>setShowAdd(false)}>
          <div style={{...S.modal,maxWidth:360}} onClick={e=>e.stopPropagation()}>
            <div style={{...S.modalHead,marginBottom:12}}><span>✏️</span><span style={S.modalTitle}>수입 수기 입력</span></div>
            <div style={S.fg}>
              <label style={S.lbl}>종류</label>
              <div style={{display:"flex",gap:7}}>
                {[["oneday","원데이"],["meditation","명상수업"],["other","기타"]].map(([v,l])=>{const tc=TYPE_COLOR[v];return(
                  <button key={v} onClick={()=>setAddForm(f=>({...f,type:v}))} style={{flex:1,padding:"9px 0",borderRadius:9,border:"1.5px solid",cursor:"pointer",fontSize:13,fontFamily:FONT,borderColor:addForm.type===v?tc.color:"#e0d8cc",background:addForm.type===v?tc.bg:"#faf8f5",color:addForm.type===v?tc.color:"#9a8e80",fontWeight:addForm.type===v?700:400}}>{l}</button>
                );}}
              </div>
            </div>
            <div style={S.fg}><label style={S.lbl}>날짜</label><input style={S.inp} type="date" value={addForm.date} onChange={e=>setAddForm(f=>({...f,date:e.target.value}))}/></div>
            <div style={S.fg}><label style={S.lbl}>이름 / 내용</label><input style={S.inp} value={addForm.memberName} onChange={e=>setAddForm(f=>({...f,memberName:e.target.value}))} placeholder="홍길동 / 명상수업 단체 등"/></div>
            <div style={S.fg}><label style={S.lbl}>금액 (원)</label><input style={S.inp} type="number" min="0" value={addForm.amount} onChange={e=>setAddForm(f=>({...f,amount:e.target.value}))} placeholder="50000"/></div>
            <div style={S.fg}>
              <label style={S.lbl}>결제 방법</label>
              <div style={{display:"flex",gap:7}}>
                {["카드","현금","네이버"].map(v=>{const pc=PAYMENT_COLOR[v];return(
                  <button key={v} onClick={()=>setAddForm(f=>({...f,payment:v}))} style={{flex:1,padding:"9px 0",borderRadius:9,border:"1.5px solid",cursor:"pointer",fontSize:13,fontFamily:FONT,borderColor:addForm.payment===v?pc.color:"#e0d8cc",background:addForm.payment===v?pc.bg:"#faf8f5",color:addForm.payment===v?pc.color:"#9a8e80",fontWeight:addForm.payment===v?700:400}}>{v}</button>
                );})}
              </div>
            </div>
            <div style={S.fg}><label style={S.lbl}>메모 (선택)</label><input style={S.inp} value={addForm.memo} onChange={e=>setAddForm(f=>({...f,memo:e.target.value}))} placeholder=""/></div>
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setShowAdd(false)}>취소</button>
              <button style={S.saveBtn} onClick={doAdd}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 */}
      {deleteId && (
        <div style={S.overlay} onClick={()=>setDeleteId(null)}>
          <div style={{...S.modal,maxWidth:280,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:24,marginBottom:8}}>🗑️</div>
            <div style={{...S.modalTitle,marginBottom:6}}>매출 기록을 삭제할까요?</div>
            <div style={{color:"#9a8e80",fontSize:13,marginBottom:18}}>삭제 후 복구가 어렵습니다.</div>
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setDeleteId(null)}>취소</button>
              <button style={{...S.saveBtn,background:"#c97474"}} onClick={()=>doDelete(deleteId)}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
