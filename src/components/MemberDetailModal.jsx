import { useState } from "react";
import { FONT, TODAY_STR, TIME_SLOTS, GE, SC, TYPE_CFG } from "../constants.js";
import { fmt, fmtWithDow, addDays } from "../utils.js";
import { getStatus, calcDL, effEnd, getClosureExtDays, usedAsOf, holdingElapsed, periodRecs, currentRecs } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";

export default function MemberDetailModal({member, bookings, onClose}){
  const closures = useClosures();
  const [expandedRH, setExpandedRH] = useState(null);
  const status = getStatus(member, closures), sc = SC[status];
  const end = effEnd(member, closures), dl = calcDL(member, closures);
  const expired = dl < 0;
  const dispUsed = usedAsOf(member.id, TODAY_STR, bookings, [member]);
  const dispRem = expired ? 0 : Math.max(0, member.total - dispUsed);
  const tc = TYPE_CFG[member.memberType] || TYPE_CFG["1month"];
  const curRecs = currentRecs(member, bookings);
  const isActiveStatus = status === "on" || status === "hold";
  const reversedHistory = [...(member.renewalHistory||[])].reverse();

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(40,35,25,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:"16px"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:440,maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 40px rgba(40,35,25,.22)",overflow:"hidden"}} onClick={e => e.stopPropagation()}>
        <div style={{padding:"18px 18px 12px", overflowY:"auto", flex:1}}>
          {/* 헤더 */}
          <div style={{display:"flex", alignItems:"flex-start", gap:10, marginBottom:12}}>
            <span style={{fontSize:28}}>{GE[member.gender]}</span>
            <div style={{flex:1}}>
              <div style={{display:"flex", alignItems:"center", gap:6, flexWrap:"wrap"}}>
                <span style={{fontSize:18, fontWeight:700}}>{member.name}</span>
                {member.isNew && <span style={{fontSize:10, background:"#fef3c7", color:"#92610a", borderRadius:20, padding:"2px 7px", fontWeight:700}}>N</span>}
                <span style={{fontSize:11, borderRadius:20, padding:"2px 8px", background:tc.bg, color:tc.color, fontWeight:700}}>{tc.label}</span>
                <span style={{fontSize:11, borderRadius:20, padding:"2px 8px", background:sc.bg, color:sc.color, fontWeight:700}}>{sc.label}</span>
              </div>
              {member.adminNote && <div style={{marginTop:5, background:"#fffaeb", borderRadius:7, padding:"5px 9px", fontSize:11, color:"#7a5a10", border:"1px dashed #e8c44a"}}>📝 {member.adminNote}</div>}
            </div>
            <button onClick={onClose} style={{background:"#f0ece4", border:"none", borderRadius:7, width:28, height:28, cursor:"pointer", fontSize:14, color:"#9a8e80", fontFamily:FONT, flexShrink:0}}>×</button>
          </div>

          {/* 요약 카드 */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7, marginBottom:12}}>
            {[
              {l:"이번기수출석", v:`${curRecs.length}/${member.total}`, c:"#3d5494"},
              {l:"잔여 회차", v:`${dispRem}회`, c:expired?"#c97474":dispRem===0?"#9a5a10":"#2e6e44"},
              {l:"D-day", v:dl<0?`${Math.abs(dl)}일초과`:dl===0?"오늘":`D-${dl}`, c:dl<0?"#c97474":dl<=7?"#9a5a10":"#4a4a4a"}
            ].map(item => (
              <div key={item.l} style={{background:"#f7f4ef", borderRadius:9, padding:"9px", textAlign:"center"}}>
                <div style={{fontSize:10, color:"#9a8e80", marginBottom:3}}>{item.l}</div>
                <div style={{fontSize:13, fontWeight:700, color:item.c}}>{item.v}</div>
              </div>
            ))}
          </div>

          {/* 날짜 정보 */}
          <div style={{background:"#f7f4ef", borderRadius:9, padding:"10px 12px", marginBottom:12, fontSize:12}}>
            {[
              ["최초등록", fmt(member.firstDate||member.startDate), "#7a6e60"],
              ["현재시작", fmt(member.startDate), "#7a6e60"],
              ["종료일", fmt(end), dl<0?"#c97474":dl<=7?"#9a5a10":"#3a4a3a"]
            ].map(([l,v,c]) => (
              <div key={l} style={{display:"flex", justifyContent:"space-between", marginBottom:4}}>
                <span style={{color:"#9a8e80"}}>{l}</span>
                <span style={{color:c, fontWeight:700}}>{v}</span>
              </div>
            ))}
          </div>

          {/* 홀딩 중 표시 */}
          {member.holding && (
            <div style={{background:"#edf0f8", borderRadius:9, padding:"10px 12px", marginBottom:12, fontSize:12}}>
              <div style={{fontWeight:700, color:"#3d5494", marginBottom:3}}>⏸️ 홀딩 중</div>
              <div style={{color:"#5a5a7a"}}>{fmt(member.holding.startDate)} ~ 복귀 미정 ({holdingElapsed(member.holding)}일 경과)</div>
            </div>
          )}

          {/* 갱신 이력 */}
          {reversedHistory.length > 0 && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12, fontWeight:700, color:"#3d4a3d", marginBottom:7}}>
                갱신 이력 <span style={{color:"#9a8e80", fontWeight:400}}>({reversedHistory.length}회)</span>
              </div>
              <div style={{maxHeight:320, overflowY:"auto"}}>
                {reversedHistory.map((r, i) => {
                  const precs = periodRecs(member, bookings, r);
                  const isCurrent = isActiveStatus && i === 0;
                  const isOpen = expandedRH === r.id;
                  const closureExt = isCurrent ? getClosureExtDays(member, closures) : 0;
                  const holdExt = (isCurrent && member.extensionDays) || 0;
                  const displayEnd = (closureExt > 0 || holdExt > 0) ? addDays(r.endDate, closureExt+holdExt) : r.endDate;
                  return (
                    <div key={r.id} style={{marginBottom:5, borderRadius:9, overflow:"hidden", border:`1px solid ${isCurrent?"#b8d8b8":"#e4e0d8"}`}}>
                      <div onClick={() => setExpandedRH(isOpen ? null : r.id)}
                        style={{display:"flex", alignItems:"center", gap:8, padding:"8px 11px", background:isCurrent?"#f0f8f0":"#fafaf7", cursor:"pointer", userSelect:"none"}}>
                        <span style={{fontSize:14, flexShrink:0}}>{isCurrent?"🟢":"⚪"}</span>
                        <div style={{flex:1, minWidth:0}}>
                          <div style={{display:"flex", alignItems:"center", gap:4, flexWrap:"wrap"}}>
                            <span style={{fontSize:12, fontWeight:700, color:"#2e3e2e"}}>{fmt(r.startDate)} ~ {fmt(displayEnd)}</span>
                            {closureExt>0 && <span style={{fontSize:10, background:"#f0ede8", color:"#8a7e70", borderRadius:4, padding:"1px 5px", fontWeight:600}}>휴강+{closureExt}일</span>}
                            {holdExt>0 && <span style={{fontSize:10, background:"#e8eaed", color:"#7a8090", borderRadius:4, padding:"1px 5px", fontWeight:600}}>홀딩+{holdExt}일</span>}
                          </div>
                          <div style={{display:"flex", gap:5, marginTop:3, flexWrap:"wrap", alignItems:"center"}}>
                            <span style={{fontSize:10, background:(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).bg, color:(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).color, borderRadius:4, padding:"1px 6px", fontWeight:700}}>{(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).label}</span>
                            {r.total>0 && <span style={{fontSize:10, color:"#9a8e80"}}>등록 {r.total}회</span>}
                            <span style={{fontSize:10, color:precs.length>0?"#2e6e44":"#b0a090", fontWeight:700}}>출석 {precs.length}회</span>
                            {r.payment && <span style={{fontSize:10, background:"#edf0f8", color:"#3d5494", borderRadius:4, padding:"1px 6px", fontWeight:600}}>{r.payment.replace("3개월,","")}</span>}
                          </div>
                        </div>
                        <div style={{display:"flex", alignItems:"center", gap:5, flexShrink:0}}>
                          {isCurrent && <span style={{fontSize:10, background:"#e0f2e9", color:"#1e6040", borderRadius:5, padding:"1px 6px", fontWeight:700}}>현재</span>}
                          <span style={{fontSize:12, color:"#9a8e80"}}>{isOpen?"▴":"▾"}</span>
                        </div>
                      </div>
                      {isOpen && (()=>{
                        const fd = s => s?s.replace(/-/g,"."):"";
                        // 이 갱신 기수 기간에 속하는 홀딩 이력 필터링
                        const holdInPeriod = (member.holdingHistory||[]).filter(h =>
                          h.startDate >= r.startDate && (!r.endDate || h.startDate <= r.endDate)
                        );
                        // 출석 행과 홀딩 행을 날짜순으로 합산
                        const rows = [
                          ...precs.map(rec => ({_type:"att", date:rec.date, rec})),
                          ...holdInPeriod.map(h  => ({_type:"hold", date:h.startDate, h})),
                        ].sort((a,b) => a.date.localeCompare(b.date));

                        return (
                          <div style={{background:"#fff", borderTop:"1px solid #f0ece4", padding:"8px 11px"}}>
                            {rows.length === 0 ? (
                              <div style={{fontSize:11, color:"#c8c0b0", textAlign:"center", padding:"8px 0"}}>이 기간 출석 기록 없음</div>
                            ) : rows.map((row, ri) => {
                              if(row._type==="hold"){
                                const {h} = row;
                                return (
                                  // 홀딩 행: 연파랑 배경으로 구분
                                  <div key={`hold-${h.startDate}`} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:ri<rows.length-1?"1px solid #f0edf8":"none",background:"#f4f6fb",borderRadius:6,paddingLeft:6,marginBottom:1}}>
                                    <span style={{fontSize:13,width:18,textAlign:"center",flexShrink:0}}>⏸️</span>
                                    <span style={{fontSize:11,color:"#3d5494",flex:1}}>홀딩 {fd(h.startDate)} ~ {fd(h.endDate)}</span>
                                    <span style={{fontSize:10,color:"#6a7fc8",background:"#edf0f8",borderRadius:4,padding:"1px 6px",fontWeight:600}}>{h.workdays||member.extensionDays}일</span>
                                  </div>
                                );
                              }
                              const {rec} = row;
                              const sl = TIME_SLOTS.find(t => t.key === rec.timeSlot);
                              return (
                                <div key={rec.id} style={{display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:ri<rows.length-1?"1px solid #f8f4ef":"none"}}>
                                  <span style={{fontSize:13, width:18, textAlign:"center", flexShrink:0}}>{sl?.icon||"📍"}</span>
                                  <span style={{fontSize:11, color:"#3a4a3a", flex:1}}>{fmtWithDow(rec.date)}</span>
                                  <span style={{fontSize:10, color:sl?.color, background:sl?.bg, borderRadius:4, padding:"1px 6px", fontWeight:600}}>{sl?.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{padding:"10px 18px", borderTop:"1px solid #f0ece4"}}>
          <button style={{...S.cancelBtn, width:"100%", textAlign:"center"}} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
