import { useState } from "react";
import { FONT, TODAY_STR, TIME_SLOTS, GE, SC, TYPE_CFG } from "../constants.js";
import { fmt, fmtWithDow } from "../utils.js";
import { getDisplayStatus, calcDL, effEnd, getClosureExtDays, usedAsOf, holdingElapsed, periodRecs, currentRecs } from "../memberCalc.js";
import { useClosures } from "../context.js";
import { addDays } from "../utils.js";
import S from "../styles.js";

export default function AdminDetailModal({member,bookings,onClose,onRenew,onHolding,onExt,onAdjust,onEdit,onDel}){
  const closures=useClosures();
  const [expandedRH,setExpandedRH]=useState(null);
  const [adjMode,setAdjMode]=useState(false);
  const [adjTotal,setAdjTotal]=useState(member.total);
  const [adjStart,setAdjStart]=useState(member.startDate||"");
  const [adjEnd,setAdjEnd]=useState(member.endDate||"");
  const status=getDisplayStatus(member,closures,bookings),sc=SC[status]||SC["on"];
  const end=effEnd(member,closures),dl=calcDL(member,closures);
  const expired=dl<0;
  const dispUsed=usedAsOf(member.id,TODAY_STR,bookings,[member]);
  const dispRem=expired?0:Math.max(0,member.total-dispUsed);
  const tc=TYPE_CFG[member.memberType]||TYPE_CFG["1month"];
  const curRecs=currentRecs(member,bookings);
  const isActiveStatus=status==="on"||status==="hold";
  const reversedHistory=[...(member.renewalHistory||[])].reverse();
  const phoneDigits=(member.phone||"").replace(/\D/g,"");
  const phoneFormatted=phoneDigits.length===11?`${phoneDigits.slice(0,3)}-${phoneDigits.slice(3,7)}-${phoneDigits.slice(7)}`:member.phone||"";

  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:440,maxHeight:"92vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"18px 18px 0",overflowY:"auto",flex:1}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12}}>
            <span style={{fontSize:28}}>{GE[member.gender]}</span>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontSize:18,fontWeight:700}}>{member.name}</span>
                {member.isNew&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
                <span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:tc.bg,color:tc.color,fontWeight:700}}>{tc.label}</span>
                <span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:sc.bg,color:sc.color,fontWeight:700}}>{sc.label}</span>
              </div>
              {member.adminNickname&&<div style={{marginTop:4,display:"inline-flex",alignItems:"center",gap:4,background:"#2e3a2e",borderRadius:7,padding:"2px 9px"}}><span style={{fontSize:10,color:"#7aba7a"}}>👀</span><span style={{fontSize:11,fontWeight:700,color:"#a8e6a8"}}>{member.adminNickname}</span></div>}
              {member.adminNote&&<div style={{marginTop:5,background:"#fffaeb",borderRadius:7,padding:"5px 9px",fontSize:11,color:"#7a5a10",border:"1px dashed #e8c44a"}}>📝 {member.adminNote}</div>}
            </div>
            <button onClick={onClose} style={{background:"#f0ece4",border:"none",borderRadius:7,width:28,height:28,cursor:"pointer",fontSize:14,color:"#9a8e80",fontFamily:FONT,flexShrink:0}}>×</button>
          </div>

          {/* ─── 상단 통계 3칸 ─── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:12}}>
            {/* ← 출석=파랑#3d5494 / 잔여: 만료=빨강#c97474, 0회=주황#9a5a10, 정상=초록#2e6e44 / D-day: 초과=빨강, 촉박=주황 */}
            {[
              {l:"이번기수출석",v:curRecs.length+"/"+member.total,c:"#3d5494"},
              {l:"잔여 회차",v:dispRem+"회",c:expired?"#c97474":dispRem===0?"#9a5a10":"#2e6e44"},
              {l:"D-day",v:dl<0?Math.abs(dl)+"일초과":dl===0?"오늘":"D-"+dl,c:dl<0?"#c97474":dl<=7?"#9a5a10":"#4a4a4a"}
            ].map(function(item){return(
              <div key={item.l} style={{background:"#f7f4ef",/* ← 통계 카드 배경색 */borderRadius:9,padding:"9px",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#9a8e80",marginBottom:3}}>{/* ← 라벨 글씨 크기/색 */}{item.l}</div>
                <div style={{fontSize:13,fontWeight:700,color:item.c}}>{/* ← 값 글씨 크기 */}{item.v}</div>
              </div>
            );})}
          </div>

          {!adjMode&&(
            <div style={{marginBottom:10,textAlign:"right"}}>
              <button onClick={()=>{setAdjTotal(member.total);setAdjStart(member.startDate||"");setAdjEnd(member.endDate||"");setAdjMode(true);}} style={{fontSize:11,background:"#fdf3e3",color:"#9a5a10",border:"1px solid #e8c44a",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontFamily:FONT,fontWeight:600}}>✏️ 횟수·기간 수정</button>
            </div>
          )}
          {/* ─── 횟수·기간 직접 수정 영역 ─── */}
          {adjMode&&(
            <div style={{background:"#fffaeb",/* ← 수정모드 배경색 */border:"1px solid #e8c44a",/* ← 수정모드 테두리색 */borderRadius:10,padding:"12px 14px",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#7a5a10",marginBottom:10}}>✏️ 등록 횟수·기간 직접 수정</div>
              <div style={{display:"flex",gap:14,marginBottom:10,flexWrap:"wrap",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>등록 횟수</div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button onClick={()=>setAdjTotal(t=>Math.max(0,t-1))} style={{...S.stepper}}>−</button>
                    <span style={{fontSize:16,fontWeight:700,minWidth:28,textAlign:"center"}}>{adjTotal}</span>
                    <button onClick={()=>setAdjTotal(t=>t+1)} style={{...S.stepper}}>+</button>
                  </div>
                  <div style={{fontSize:11,color:"#2e6e44",fontWeight:700,marginTop:4}}>잔여 {Math.max(0,adjTotal-dispUsed)}회</div>
                </div>
              </div>
              <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:120}}>
                  <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>시작일</div>
                  <input type="date" value={adjStart} onChange={e=>setAdjStart(e.target.value)} style={{...S.inp,fontSize:13,padding:"7px 9px"}}/>
                </div>
                <div style={{flex:1,minWidth:120}}>
                  <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>종료일</div>
                  <input type="date" value={adjEnd} onChange={e=>setAdjEnd(e.target.value)} style={{...S.inp,fontSize:13,padding:"7px 9px"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:7}}>
                <button onClick={()=>setAdjMode(false)} style={S.cancelBtn}>취소</button>
                <button onClick={()=>{onAdjust&&onAdjust({total:adjTotal,startDate:adjStart,endDate:adjEnd});setAdjMode(false);}} style={{...S.saveBtn,background:"#e8a44a",fontSize:12}}>저장</button>
              </div>
            </div>
          )}

          <div style={{background:"#f7f4ef",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12}}>
            {[["최초등록",fmt(member.firstDate||member.startDate),"#7a6e60"],["현재시작",fmt(member.startDate),"#7a6e60"],["종료일",fmt(end),dl<0?"#c97474":dl<=7?"#9a5a10":"#3a4a3a"]].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#9a8e80"}}>{l}</span><span style={{color:c,fontWeight:700}}>{v}</span></div>
            ))}
            {member.phone&&(
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:0,marginTop:4,paddingTop:4,borderTop:"1px solid #ece8e0"}}>
                <span style={{color:"#9a8e80"}}>전화번호</span>
                {/* ← 전화 링크 색상: #3d5494 / 숫자만 추출해서 전화 연결 (- 무관) */}
                <a href={`tel:${phoneDigits}`} style={{color:"#3d5494",fontWeight:700,textDecoration:"none"}}>{phoneFormatted}</a>
              </div>
            )}
          </div>

          {member.holding&&<div style={{background:"#edf0f8",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12}}><div style={{fontWeight:700,color:"#3d5494",marginBottom:3}}>⏸️ 홀딩 중</div><div style={{color:"#5a5a7a"}}>{fmt(member.holding.startDate)} ~ 복귀 미정 ({holdingElapsed(member.holding)}일 경과)</div></div>}

          <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
            <button onClick={onRenew} style={{...S.saveBtn,fontSize:12,padding:"7px 12px"}}>🔄 갱신</button>
            {member.memberType==="3month"&&<button onClick={onHolding} style={{background:"#edf0f8",color:"#3d5494",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>{member.holding?"⏸️ 홀딩 관리":"⏸️ 홀딩"}</button>}
          </div>

          {/* ─── 갱신 이력 목록 ─── */}
          {reversedHistory.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:"#3d4a3d",marginBottom:7}}>갱신 이력 <span style={{color:"#9a8e80",fontWeight:400}}>({reversedHistory.length}회)</span></div>
              <div style={{maxHeight:280,/* ← 이력 목록 최대 높이 (스크롤) */overflowY:"auto"}}>
                {reversedHistory.map((r,i)=>{
                  const precs=periodRecs(member,bookings,r);
                  const isCurrent=isActiveStatus&&i===0;
                  const isOpenH=expandedRH===r.id;
                  const closureExt=isCurrent?getClosureExtDays(member,closures):0;
                  const holdExt=(isCurrent&&member.extensionDays)||0;
                  const displayEndDate=(closureExt>0||holdExt>0)?addDays(r.endDate,closureExt+holdExt):r.endDate;
                  return(
                    <div key={r.id} style={{marginBottom:5,borderRadius:9,overflow:"hidden",border:`1px solid ${isCurrent?"#b8d8b8":"#e4e0d8"}`}}>
                      {/* ← 이력 헤더: 현재기수 배경=#f0f8f0 / 과거 배경=#fafaf7 */}
                    <div onClick={()=>setExpandedRH(isOpenH?null:r.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 11px",background:isCurrent?"#f0f8f0":"#fafaf7",cursor:"pointer",userSelect:"none"}}>
                        <span style={{fontSize:14,flexShrink:0}}>{isCurrent?"🟢":"⚪"}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                            <span style={{fontSize:12,fontWeight:700,color:"#2e3e2e"}}>{fmt(r.startDate)} ~ {fmt(displayEndDate)}</span>
                            {closureExt>0&&<span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{closureExt}일</span>}
                            {holdExt>0&&<span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{holdExt}일</span>}
                          </div>
                          <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                            <span style={{fontSize:10,background:(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).bg,color:(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).color,borderRadius:4,padding:"1px 6px",fontWeight:700}}>{(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).label}</span>
                            {r.total>0&&<span style={{fontSize:10,color:"#9a8e80"}}>등록 {r.total}회</span>}
                            <span style={{fontSize:10,color:precs.length>0?"#2e6e44":"#b0a090",fontWeight:700}}>출석 {precs.length}회</span>
                            {r.payment&&<span style={{fontSize:10,background:r.payment.replace("3개월,","").includes("네이버")?"#e8f4e8":r.payment.replace("3개월,","").includes("현금")?"#fdf3e3":"#edf0f8",color:r.payment.replace("3개월,","").includes("네이버")?"#2e6e44":r.payment.replace("3개월,","").includes("현금")?"#8a5510":"#3d5494",borderRadius:4,padding:"1px 6px",fontWeight:600}}>{r.payment.replace("3개월,","")}</span>}
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                          {isCurrent&&<span style={{fontSize:10,background:"#e0f2e9",color:"#1e6040",borderRadius:5,padding:"1px 6px",fontWeight:700}}>현재</span>}
                          <span style={{fontSize:12,color:"#9a8e80"}}>{isOpenH?"▴":"▾"}</span>
                        </div>
                      </div>
                      {isOpenH&&(
                        <div style={{background:"#fff",borderTop:"1px solid #f0ece4",padding:"8px 11px"}}>
                          {precs.length===0?(
                            <div style={{fontSize:11,color:"#c8c0b0",textAlign:"center",padding:"8px 0"}}>이 기간 출석 기록 없음</div>
                          ):(
                            precs.map((rec,ri)=>{
                              const sl=TIME_SLOTS.find(t=>t.key===rec.timeSlot);
                              return(
                                <div key={rec.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:ri<precs.length-1?"1px solid #f8f4ef":"none"}}>
                                  <span style={{fontSize:13,width:18,textAlign:"center",flexShrink:0}}>{sl?.icon||"📍"}</span>
                                  <span style={{fontSize:11,color:"#3a4a3a",flex:1}}>{fmtWithDow(rec.date)}</span>
                                  <span style={{fontSize:10,color:sl?.color,background:sl?.bg,borderRadius:4,padding:"1px 6px",fontWeight:600}}>{sl?.label}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{padding:"10px 18px",borderTop:"1px solid #f0ece4",display:"flex",gap:7}}>
          <button style={{...S.cancelBtn,flex:1,textAlign:"center"}} onClick={onClose}>닫기</button>
          {onEdit&&<button style={{...S.editBtn,flex:1,textAlign:"center"}} onClick={()=>{onClose();onEdit();}}>✏️ 수정</button>}
          {onDel&&<button style={{...S.delBtn,flex:1,textAlign:"center"}} onClick={()=>{onClose();onDel();}}>🗑 삭제</button>}
        </div>
      </div>
    </div>
  );
}
