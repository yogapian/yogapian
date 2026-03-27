import { useState, useEffect, useCallback } from "react";
import { _supabase } from "../db.js";

const FONT = "'Noto Sans KR','Apple SD Gothic Neo',sans-serif";

const SLOTS = [
  { key:"dawn",     label:"새벽" },
  { key:"morning",  label:"오전" },
  { key:"lunch",    label:"점심" },
  { key:"afternoon",label:"오후" },
  { key:"evening",  label:"저녁" },
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

function makeEmpty() {
  const t = {};
  for (const d of DAYS) {
    t[d.dow] = {};
    for (const s of SLOTS) {
      t[d.dow][s.key] = { active: false, capacity: 10 };
    }
  }
  return t;
}

function prevYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,"0")}`;
}

export default function ScheduleTemplateManager({ onClose }) {
  const today = new Date();
  const initYM = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;

  const [yearMonth, setYearMonth] = useState(initYM);
  const [template, setTemplate] = useState(makeEmpty);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null); // {msg, ok}

  const showToast = (msg, ok=true) => {
    setToast({msg, ok});
    setTimeout(() => setToast(null), 2200);
  };

  const loadTemplate = useCallback(async (ym) => {
    setLoading(true);
    const { data } = await _supabase
      .from("schedule_templates")
      .select("template")
      .eq("year_month", ym)
      .maybeSingle();
    setTemplate(data?.template ? { ...makeEmpty(), ...data.template } : makeEmpty());
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplate(yearMonth); }, [yearMonth, loadTemplate]);

  function cell(dow, key) {
    return template[dow]?.[key] ?? { active:false, capacity:10 };
  }

  function toggleActive(dow, key) {
    setTemplate(t => ({
      ...t,
      [dow]: { ...t[dow], [key]: { ...cell(dow,key), active:!cell(dow,key).active } }
    }));
  }

  function setCapacity(dow, key, val) {
    const n = Math.max(0, Math.min(99, parseInt(val)||0));
    setTemplate(t => ({
      ...t,
      [dow]: { ...t[dow], [key]: { ...cell(dow,key), capacity:n } }
    }));
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await _supabase
      .from("schedule_templates")
      .upsert({ year_month: yearMonth, template }, { onConflict:"year_month" });
    setSaving(false);
    showToast(error ? "저장 실패" : "저장됐어요 ✓", !error);
  }

  async function handleCopyPrev() {
    const prev = prevYM(yearMonth);
    const { data } = await _supabase
      .from("schedule_templates")
      .select("template")
      .eq("year_month", prev)
      .maybeSingle();
    if (data?.template) {
      setTemplate({ ...makeEmpty(), ...data.template });
      showToast(`${prev} 데이터를 불러왔어요`);
    } else {
      showToast(`${prev} 데이터가 없습니다`, false);
    }
  }

  // 월 이동
  function moveMonth(dir) {
    const [y, m] = yearMonth.split("-").map(Number);
    let ny = y, nm = m + dir;
    if(nm > 12){ ny++; nm=1; }
    if(nm < 1){ ny--; nm=12; }
    setYearMonth(`${ny}-${String(nm).padStart(2,"0")}`);
  }

  const activeCount = DAYS.reduce((acc, d) =>
    acc + SLOTS.filter(s => cell(d.dow, s.key).active).length, 0
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(40,35,25,.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,padding:0}} onClick={onClose}>
      <div style={{background:"#f5f3ef",borderRadius:"18px 18px 0 0",width:"100%",maxWidth:640,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 -8px 40px rgba(40,35,25,.22)",fontFamily:FONT,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{background:"#fff",borderBottom:"1px solid #e8e4dc",padding:"14px 18px 10px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:18}}>📅</span>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:"#1e2e1e"}}>수업 시간표 기본 설정</div>
            <div style={{fontSize:11,color:"#9a8e80",marginTop:1}}>월별 요일·시간대별 운영 여부와 정원을 설정하세요</div>
          </div>
          <button onClick={onClose} style={{background:"#f0ece4",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:15,color:"#9a8e80",fontFamily:FONT}}>×</button>
        </div>

        {/* 월 선택 */}
        <div style={{background:"#fff",borderBottom:"1px solid #f0ece4",padding:"10px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <button onClick={()=>moveMonth(-1)} style={{background:"none",border:"none",fontSize:20,color:"#555",cursor:"pointer",padding:"2px 8px",lineHeight:1,fontFamily:FONT}}>‹</button>
          <div style={{flex:1,textAlign:"center"}}>
            <span style={{fontSize:17,fontWeight:700,color:"#1e2e1e"}}>{yearMonth.replace("-","년 ")}월</span>
            <span style={{fontSize:11,color:"#a09080",marginLeft:8}}>운영중 {activeCount}개 슬롯</span>
          </div>
          <button onClick={()=>moveMonth(1)} style={{background:"none",border:"none",fontSize:20,color:"#555",cursor:"pointer",padding:"2px 8px",lineHeight:1,fontFamily:FONT}}>›</button>
        </div>

        {/* 그리드 */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 12px 4px"}}>
          {loading ? (
            <div style={{textAlign:"center",padding:"40px 0",color:"#9a8e80",fontSize:14}}>불러오는 중…</div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",width:"100%",minWidth:460}}>
                <thead>
                  <tr>
                    <th style={{width:52,padding:"6px 4px",fontSize:11,color:"#9a8e80",fontWeight:600,textAlign:"center",borderBottom:"2px solid #e8e4dc"}}></th>
                    {DAYS.map(d=>(
                      <th key={d.dow} style={{padding:"6px 3px",fontSize:12,fontWeight:700,textAlign:"center",color:d.weekend?"#e05050":"#1e2e1e",borderBottom:"2px solid #e8e4dc",minWidth:60}}>
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOTS.map((s,si)=>(
                    <tr key={s.key} style={{background:si%2===0?"#fff":"#fafaf7"}}>
                      <td style={{padding:"8px 6px",fontSize:12,fontWeight:700,color:"#7a6e60",textAlign:"center",borderRight:"1.5px solid #e8e4dc",whiteSpace:"nowrap"}}>{s.label}</td>
                      {DAYS.map(d=>{
                        const c = cell(d.dow, s.key);
                        return (
                          <td key={d.dow} style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #f0ece4"}}>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                              {/* 운영 여부 토글 */}
                              <div
                                onClick={()=>toggleActive(d.dow, s.key)}
                                style={{width:32,height:18,borderRadius:9,background:c.active?"#4a6a4a":"#d8d4cc",position:"relative",cursor:"pointer",transition:"background .15s",flexShrink:0}}
                              >
                                <div style={{position:"absolute",top:2,left:c.active?15:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                              </div>
                              {/* 정원 입력 */}
                              <input
                                type="number"
                                min={0}
                                max={99}
                                value={c.capacity}
                                disabled={!c.active}
                                onChange={e=>setCapacity(d.dow, s.key, e.target.value)}
                                style={{width:40,textAlign:"center",border:`1px solid ${c.active?"#c8d8c8":"#e8e4dc"}`,borderRadius:6,padding:"3px 2px",fontSize:12,fontWeight:600,color:c.active?"#2e5c3e":"#b0a090",background:c.active?"#f0f8f0":"#f5f3ef",fontFamily:FONT,outline:"none"}}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 범례 */}
              <div style={{display:"flex",gap:14,padding:"12px 4px 4px",flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#9a8e80"}}>
                  <div style={{width:24,height:14,borderRadius:7,background:"#4a6a4a"}}/>
                  <span>운영</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#9a8e80"}}>
                  <div style={{width:24,height:14,borderRadius:7,background:"#d8d4cc"}}/>
                  <span>미운영</span>
                </div>
                <div style={{fontSize:11,color:"#9a8e80"}}>숫자 = 정원 (명)</div>
              </div>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{background:"#fff",borderTop:"1px solid #e8e4dc",padding:"12px 18px",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <button
            onClick={handleCopyPrev}
            style={{background:"#f0ece4",color:"#7a6e60",border:"none",borderRadius:9,padding:"9px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT,whiteSpace:"nowrap"}}
          >
            ← 이전 달에서 가져오기
          </button>
          <div style={{flex:1}}/>
          {toast&&(
            <span style={{fontSize:12,color:toast.ok?"#2e6e44":"#c97474",fontWeight:600,transition:"opacity .3s"}}>
              {toast.msg}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{background:saving?"#a0a090":"#4a6a4a",color:"#fff",border:"none",borderRadius:9,padding:"9px 22px",fontSize:13,fontWeight:700,cursor:saving?"default":"pointer",fontFamily:FONT,opacity:saving?0.8:1}}
          >
            {saving?"저장 중…":"저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
