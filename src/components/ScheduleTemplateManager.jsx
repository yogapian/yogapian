import { useState } from "react";

const FONT = "'Noto Sans KR','Apple SD Gothic Neo',sans-serif";

const SLOT_DEFS = [
  { key:"dawn",      label:"새벽", icon:"🌅", time:"06:30" },
  { key:"morning",   label:"오전", icon:"☀️",  time:"08:30" },
  { key:"lunch",     label:"점심", icon:"🌤️", time:"11:50" },
  { key:"afternoon", label:"오후", icon:"🌞", time:"14:00" },
  { key:"evening",   label:"저녁", icon:"🌙", time:"19:30" },
];

const DAYS = [
  { dow:1, label:"월" },
  { dow:2, label:"화" },
  { dow:3, label:"수" },
  { dow:4, label:"목" },
  { dow:5, label:"금" },
  { dow:6, label:"토", weekend:true },
  { dow:0, label:"일", weekend:true },
];

const EMPTY_FORM = {
  slotKey: "morning",
  days: [1, 2, 3, 4, 5],
  time: "08:30",
  capacity: 10,
  startDate: "",
  endDate: "",
};

export default function ScheduleTemplateManager({ scheduleTemplate, setScheduleTemplate, onClose }) {
  const slots = Array.isArray(scheduleTemplate) ? scheduleTemplate : [];

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState(null);

  function showToast(msg, ok=true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2200);
  }

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(s) {
    setEditId(s.id);
    setForm({ slotKey:s.slotKey, days:[...s.days], time:s.time, capacity:s.capacity, startDate:s.startDate||"", endDate:s.endDate||"" });
    setShowForm(true);
  }

  function saveForm() {
    if (!form.days.length || !form.time) return;
    const entry = {
      id: editId || Date.now(),
      slotKey: form.slotKey,
      days: [...form.days].sort((a,b)=>a-b),
      time: form.time,
      capacity: form.capacity,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    };
    setScheduleTemplate(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      return editId ? arr.map(s => s.id === editId ? entry : s) : [...arr, entry];
    });
    setShowForm(false);
    showToast(editId ? "수정됐어요 ✓" : "추가됐어요 ✓");
  }

  function deleteSlot(id) {
    setScheduleTemplate(prev => (Array.isArray(prev) ? prev : []).filter(s => s.id !== id));
    showToast("삭제됐어요");
  }

  function toggleDay(dow) {
    setForm(f => ({
      ...f,
      days: f.days.includes(dow) ? f.days.filter(d => d !== dow) : [...f.days, dow],
    }));
  }

  // 요일 표시 (월화수... 순서로 정렬해서)
  function dayLabel(days) {
    return DAYS.filter(d => days.includes(d.dow)).map(d => d.label).join(" ");
  }

  const canSave = form.days.length > 0 && form.time;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(40,35,25,.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,padding:0}} onClick={onClose}>
      <div style={{background:"#f5f3ef",borderRadius:"18px 18px 0 0",width:"100%",maxWidth:640,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 -8px 40px rgba(40,35,25,.22)",fontFamily:FONT,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{background:"#fff",borderBottom:"1px solid #e8e4dc",padding:"14px 18px 10px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:18}}>📅</span>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e"}}>시간표 기본 설정</div>
            <div style={{fontSize:11,color:"#9a8e80",marginTop:1}}>반복 요일·시간·정원을 설정하세요</div>
          </div>
          <button onClick={onClose} style={{background:"#f0ece4",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:15,color:"#9a8e80",fontFamily:FONT}}>×</button>
        </div>

        {/* 목록 + 폼 */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 16px 4px"}}>

          {/* 기존 슬롯 목록 */}
          {slots.length === 0 && !showForm && (
            <div style={{textAlign:"center",padding:"48px 0 32px",color:"#9a8e80"}}>
              <div style={{fontSize:38,marginBottom:10}}>📭</div>
              <div style={{fontSize:14,fontWeight:700}}>등록된 수업이 없어요</div>
              <div style={{fontSize:12,marginTop:4}}>아래 버튼으로 수업을 추가하세요</div>
            </div>
          )}

          {slots.map(s => {
            const def = SLOT_DEFS.find(t => t.key === s.slotKey);
            return (
              <div key={s.id} style={{background:"#fff",borderRadius:12,padding:"12px 14px",marginBottom:10,border:"1px solid #e8e4dc",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:24,flexShrink:0}}>{def?.icon||"🧘"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e"}}>{def?.label||s.slotKey}</span>
                    <span style={{fontSize:14,fontWeight:700,color:"#4a6a4a"}}>{s.time}</span>
                    <span style={{fontSize:12,background:"#eef5ee",color:"#2e6e44",borderRadius:5,padding:"1px 8px",fontWeight:600}}>{s.capacity}명</span>
                  </div>
                  <div style={{fontSize:12,color:"#7a6e60"}}>
                    {dayLabel(s.days)}
                    {(s.startDate||s.endDate)&&(
                      <span style={{marginLeft:8,color:"#9a8e80",fontSize:11}}>
                        {s.startDate||"∞"} ~ {s.endDate||"∞"}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>openEdit(s)} style={{background:"#f0ece4",border:"none",borderRadius:7,padding:"5px 11px",fontSize:12,color:"#7a6e60",cursor:"pointer",fontFamily:FONT,fontWeight:600}}>수정</button>
                  <button onClick={()=>deleteSlot(s.id)} style={{background:"#fff0f0",border:"none",borderRadius:7,padding:"5px 11px",fontSize:12,color:"#c97474",cursor:"pointer",fontFamily:FONT,fontWeight:600}}>삭제</button>
                </div>
              </div>
            );
          })}

          {/* 추가/수정 폼 */}
          {showForm && (
            <div style={{background:"#fff",borderRadius:14,padding:"16px",marginBottom:12,border:"2px solid #4a6a4a"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1e2e1e",marginBottom:14}}>{editId?"✏️ 수업 수정":"➕ 수업 추가"}</div>

              {/* 수업 종류 */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"#9a8e80",marginBottom:7,fontWeight:600}}>수업 종류</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {SLOT_DEFS.map(t=>(
                    <button key={t.key} onClick={()=>setForm(f=>({...f,slotKey:t.key,time:t.time}))}
                      style={{border:`1.5px solid ${form.slotKey===t.key?"#4a6a4a":"#e0d8cc"}`,borderRadius:9,padding:"7px 13px",background:form.slotKey===t.key?"#eef5ee":"#faf8f5",color:form.slotKey===t.key?"#2e5c3e":"#7a6e60",cursor:"pointer",fontFamily:FONT,fontSize:12,fontWeight:form.slotKey===t.key?700:400,display:"flex",alignItems:"center",gap:5}}>
                      <span>{t.icon}</span><span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 반복 요일 */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"#9a8e80",marginBottom:7,fontWeight:600}}>반복 요일</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {DAYS.map(d=>{
                    const on=form.days.includes(d.dow);
                    return(
                      <button key={d.dow} onClick={()=>toggleDay(d.dow)}
                        style={{width:38,height:38,borderRadius:"50%",border:`1.5px solid ${on?"#4a6a4a":"#e0d8cc"}`,background:on?"#4a6a4a":"#faf8f5",color:on?"#fff":d.weekend?"#e05050":"#3a4a3a",cursor:"pointer",fontFamily:FONT,fontSize:13,fontWeight:700,flexShrink:0}}>
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                {form.days.length===0&&<div style={{fontSize:11,color:"#c97474",marginTop:5}}>요일을 하나 이상 선택하세요</div>}
              </div>

              {/* 시간 + 정원 */}
              <div style={{display:"flex",gap:12,marginBottom:14}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:"#9a8e80",marginBottom:5,fontWeight:600}}>시간</div>
                  <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}
                    style={{width:"100%",padding:"10px 12px",border:"1.5px solid #ddd",borderRadius:9,fontSize:15,fontWeight:700,fontFamily:FONT,color:"#1e2e1e",background:"#fafaf8",outline:"none"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:"#9a8e80",marginBottom:5,fontWeight:600}}>정원</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",border:"1.5px solid #ddd",borderRadius:9,background:"#fafaf8"}}>
                    <button onClick={()=>setForm(f=>({...f,capacity:Math.max(1,f.capacity-1)}))} style={{background:"#f0ece4",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:16,color:"#4a4a4a",fontFamily:FONT,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>−</button>
                    <span style={{flex:1,textAlign:"center",fontSize:16,fontWeight:700,color:"#1e2e1e"}}>{form.capacity}</span>
                    <button onClick={()=>setForm(f=>({...f,capacity:Math.min(99,f.capacity+1)}))} style={{background:"#f0ece4",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:16,color:"#4a4a4a",fontFamily:FONT,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>+</button>
                  </div>
                </div>
              </div>

              {/* 적용 기간 */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,color:"#9a8e80",marginBottom:5,fontWeight:600}}>
                  적용 기간 <span style={{fontWeight:400}}>(선택 — 비우면 무기한 적용)</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="date" value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}
                    style={{flex:1,padding:"9px 10px",border:"1.5px solid #ddd",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",color:"#1e2e1e"}}/>
                  <span style={{fontSize:12,color:"#9a8e80",flexShrink:0}}>~</span>
                  <input type="date" value={form.endDate} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}
                    style={{flex:1,padding:"9px 10px",border:"1.5px solid #ddd",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",color:"#1e2e1e"}}/>
                </div>
              </div>

              {/* 저장/취소 */}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setShowForm(false)}
                  style={{flex:1,background:"#f0ece4",color:"#7a6e60",border:"none",borderRadius:9,padding:"11px 0",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:FONT}}>
                  취소
                </button>
                <button onClick={saveForm} disabled={!canSave}
                  style={{flex:2,background:canSave?"#4a6a4a":"#c0bdb0",color:"#fff",border:"none",borderRadius:9,padding:"11px 0",fontSize:13,fontWeight:700,cursor:canSave?"pointer":"default",fontFamily:FONT}}>
                  저장
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 하단 */}
        <div style={{background:"#fff",borderTop:"1px solid #e8e4dc",padding:"12px 18px",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          {toast
            ? <span style={{flex:1,fontSize:12,fontWeight:600,color:toast.ok?"#2e6e44":"#c97474"}}>{toast.msg}</span>
            : <div style={{flex:1}}/>
          }
          {!showForm&&(
            <button onClick={openAdd}
              style={{background:"#4a6a4a",color:"#fff",border:"none",borderRadius:9,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>
              + 수업 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
