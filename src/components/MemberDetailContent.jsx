// ─── MemberDetailContent.jsx ─────────────────────────────────────────────────
// 관리자+회원 공통 상세 컨텐츠 영역 (MemberDetailModal / AdminDetailModal 공유)
// 수정 시 이 파일만 바꾸면 양쪽 뷰에 동시 반영됨
//
// props:
//   member, bookings  — 필수 데이터
//   onClose           — 헤더 × 버튼에 사용
//   showNickname      — 관리자 닉네임 표시 여부 (관리자만 true)
//   adjSection        — 관리자 전용 ReactNode: 횟수·기간 수정 폼 + 갱신/홀딩 버튼
//   extraInfoRows     — 날짜박스 하단 추가 행 (전화번호 등 관리자 전용)

import { useState } from "react";
import { FONT, TODAY_STR, TIME_SLOTS, GE, SC, TYPE_CFG } from "../constants.js";
import { fmt, fmtWithDow, addDays } from "../utils.js";
import { getDisplayStatus, calcDL, effEnd, getClosureExtDays, usedAsOf, activePeriodTotal, holdingElapsed, periodRecs, currentRecs } from "../memberCalc.js";
import { useClosures } from "../context.js";

export default function MemberDetailContent({ member, bookings, onClose, showNickname=false, adjSection=null, extraInfoRows=null }) {
  const closures = useClosures();
  const [expandedRH, setExpandedRH] = useState(null);

  const status = getDisplayStatus(member, closures, bookings);
  const sc = SC[status] || SC["on"];
  const end = effEnd(member, closures);
  const dl = calcDL(member, closures);
  const expired = dl < 0;
  const dispUsed = usedAsOf(member.id, TODAY_STR, bookings, [member]);
  const dispPeriodTotal = activePeriodTotal(member, TODAY_STR, bookings, [member]); // 유효 기수 총 횟수 (이월 배분 포함)
  const dispRem = expired ? 0 : Math.max(0, dispPeriodTotal - dispUsed);
  const tc = TYPE_CFG[member.memberType] || TYPE_CFG["1month"];
  const curRecs = currentRecs(member, bookings);
  const isActiveStatus = status === "on" || status === "hold";
  const reversedHistory = [...(member.renewalHistory || [])].reverse();

  return (
    <>
      {/* ─── 헤더: 성별 이모지 / 이름·뱃지 / × 버튼 ─── */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <span style={{fontSize:25}}>{GE[member.gender]}</span>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
            <span style={{fontSize:18,fontWeight:700}}>{member.name}</span>
            {member.isNew && <span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
            <span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:tc.bg,color:tc.color,fontWeight:700}}>{tc.label}</span>
            <span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:sc.bg,color:sc.color,fontWeight:700}}>{sc.label}</span>
            {/* 관리자 닉네임: 이름 행 내 가로 나열 */}
            {showNickname && member.adminNickname && (
              <span style={{display:"inline-flex",alignItems:"center",gap:3,background:"#2e3a2e",borderRadius:20,padding:"2px 8px"}}>
                <span style={{fontSize:9,color:"#7aba7a"}}>👀</span>
                <span style={{fontSize:10,fontWeight:700,color:"#a8e6a8"}}>{member.adminNickname}</span>
              </span>
            )}
          </div>
          {member.adminNote && (
            <div style={{marginTop:3,display:"inline-flex",alignItems:"center",gap:3,background:"#fffaeb",borderRadius:20,padding:"2px 8px",fontSize:10,color:"#7a5a10",border:"1px solid #e8c44a"}}>📝 {member.adminNote}</div>
          )}
        </div>
        <button onClick={onClose} style={{background:"#f0ece4",border:"none",borderRadius:7,width:28,height:28,cursor:"pointer",fontSize:14,color:"#9a8e80",fontFamily:FONT,flexShrink:0}}>×</button>
      </div>

      {/* ─── 상단 통계 3칸 ─── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:12}}>
        {[
          {l:"이번기수출석", v:`${curRecs.length}/${dispPeriodTotal}`, c:"#5a6070"},
          {l:"잔여 회차",    v:`${dispRem}회`, c:expired?"#9a7878":dispRem===0?"#8a7050":"#5a7060"},
          {l:"D-day",       v:dl<0?`${Math.abs(dl)}일초과`:dl===0?"오늘":`D-${dl}`, c:dl<0?"#9a7878":dl<=7?"#8a7050":"#4a4a4a"}
        ].map(item => (
          <div key={item.l} style={{background:"#f5f5f5",borderRadius:9,padding:"9px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#9a8e80",marginBottom:3}}>{item.l}</div>
            <div style={{fontSize:13,fontWeight:700,color:item.c}}>{item.v}</div>
          </div>
        ))}
      </div>

      {/* ─── 관리자 전용 영역 (횟수수정 폼 + 갱신/홀딩 버튼) ─── */}
      {adjSection}

      {/* ─── 날짜 정보 박스 ─── */}
      <div style={{background:"#f5f5f5",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12}}>
        {[
          ["최초등록", fmt(member.firstDate||member.startDate), "#7a6e60"],
          ["현재시작", fmt(member.startDate), "#7a6e60"],
          ["종료일",   fmt(end), dl<0?"#c97474":dl<=7?"#9a5a10":"#3a4a3a"]
        ].map(([l,v,c]) => (
          <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:"#9a8e80"}}>{l}</span>
            <span style={{color:c,fontWeight:700}}>{v}</span>
          </div>
        ))}
        {/* 전화번호 등 관리자 전용 추가 행 */}
        {extraInfoRows}
      </div>

      {/* ─── 홀딩 중 배너 ─── */}
      {member.holding && (
        <div style={{background:"#edf0f8",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12}}>
          <div style={{fontWeight:700,color:"#3d5494",marginBottom:3}}>⏸️ 홀딩 중</div>
          <div style={{color:"#5a5a7a"}}>{fmt(member.holding.startDate)} ~ 복귀 미정 ({holdingElapsed(member.holding)}일 경과)</div>
        </div>
      )}

      {/* ─── 갱신 이력 목록 (출석 + 홀딩 이력 통합 표시) ─── */}
      {reversedHistory.length > 0 && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"#3d4a3d",marginBottom:7}}>
            갱신 이력 <span style={{color:"#9a8e80",fontWeight:400}}>({reversedHistory.length}회)</span>
          </div>
          <div style={{maxHeight:280,overflowY:"auto"}}>
            {reversedHistory.map((r, i) => {
              const isCurrent = isActiveStatus && i === 0;
              const isOpenH = expandedRH === r.id;
              // holdInPeriod를 먼저 계산 — 과거 기수의 holdExt·displayEnd·precs 필터에 모두 필요
              const holdInPeriod = (member.holdingHistory || []).filter(h =>
                h.startDate >= r.startDate && (!r.endDate || h.startDate <= r.endDate)
              );
              const holdExtDays = holdInPeriod.reduce((sum, h) => sum + (h.workdays || 0), 0);
              const closureExt = isCurrent ? getClosureExtDays(member, closures) : 0;
              // 현재 기수: extensionDays(진행 중 홀딩 포함), 과거 기수: holdingHistory 합산
              const holdExt = isCurrent ? (member.extensionDays || 0) : holdExtDays;
              const displayEnd = (closureExt > 0 || holdExt > 0) ? addDays(r.endDate, closureExt+holdExt) : r.endDate;
              // 다음 기수 시작일 전날로 캡핑 — 갱신이 기수 만료 전에 일어나면 출석이 두 기수에 중복 표시되는 버그 방지
              // reversedHistory는 최신순이므로 i-1이 바로 다음(더 최신) 기수
              const nextStart = i > 0 ? reversedHistory[i - 1].startDate : null;
              const cappedEnd = nextStart && addDays(nextStart, -1) < displayEnd ? addDays(nextStart, -1) : displayEnd;
              const precs = periodRecs(member, bookings, {...r, endDate: cappedEnd});
              // 출석 행 + 홀딩 행을 날짜 내림차순으로 합산
              const rows = [
                ...precs.map(rec => ({_type:"att", date:rec.date, rec})),
                ...holdInPeriod.map(h  => ({_type:"hold", date:h.startDate, h})),
              ].sort((a, b) => b.date.localeCompare(a.date));

              return (
                <div key={r.id} style={{marginBottom:5,borderRadius:9,overflow:"hidden",border:`1px solid ${isCurrent?"#b8d8b8":"#e4e0d8"}`}}>
                  {/* 이력 헤더 (클릭으로 토글) */}
                  <div onClick={() => setExpandedRH(isOpenH ? null : r.id)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"8px 11px",background:isCurrent?"#f0f8f0":"#fafaf7",cursor:"pointer",userSelect:"none"}}>
                    <span style={{fontSize:14,flexShrink:0}}>{isCurrent ? "🟢" : "⚪"}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#2e3e2e"}}>{fmt(r.startDate)} ~ {fmt(displayEnd)}</span>
                        {closureExt > 0 && <span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{closureExt}일</span>}
                        {holdExt > 0    && <span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{holdExt}일</span>}
                      </div>
                      <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                        {/* 회원권 종류 뱃지: 중립 회색 */}
                        <span style={{fontSize:10,background:"#efefef",color:"#707070",borderRadius:4,padding:"1px 6px",fontWeight:500}}>{(TYPE_CFG[r.memberType]||TYPE_CFG["1month"]).label}</span>
                        {r.total > 0 && <span style={{fontSize:10,color:"#9a8e80"}}>등록 {r.total}회</span>}
                        <span style={{fontSize:10,color:precs.length>0?"#171717":"#b0a090"}}>출석 {precs.length}회</span>
                        {/* 결제수단 뱃지: 네이버=슬레이트 / 현금=주황 / 카드=파랑 */}
                        {r.payment && (() => {
                          const p = r.payment.replace("3개월,","");
                          const bg    = "#edf0f8";
                          const color = p.includes("네이버")?"#398f54":p.includes("현금")?"#aa7c40":"#3d4994";
                          return <span style={{fontSize:9,background:bg,color,borderRadius:4,padding:"1px 6px",fontWeight:600}}>{p}</span>;
                        })()}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                      {isCurrent && <span style={{fontSize:10,background:"#2a6e44",color:"#fff",borderRadius:5,padding:"1px 6px",fontWeight:700}}>현재</span>}
                      <span style={{fontSize:12,color:"#9a8e80"}}>{isOpenH ? "▴" : "▾"}</span>
                    </div>
                  </div>

                  {/* 이력 상세 (출석 + 홀딩 행) */}
                  {isOpenH && (
                    <div style={{background:"#fff",borderTop:"1px solid #f0ece4",padding:"8px 11px"}}>
                      {rows.length === 0 ? (
                        <div style={{fontSize:11,color:"#c8c0b0",textAlign:"center",padding:"8px 0"}}>이 기간 출석 기록 없음</div>
                      ) : rows.map((row, ri) => {
                        if (row._type === "hold") {
                          const {h} = row;
                          const fd = s => s ? s.replace(/-/g, ".") : "";
                          return (
                            // 홀딩 행: 연파랑 배경으로 구분
                            <div key={`hold-${h.startDate}`} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 6px",borderBottom:ri<rows.length-1?"1px solid #f0edf8":"none",background:"#f4f6fb",borderRadius:6,marginBottom:1}}>
                              <span style={{fontSize:13,width:18,textAlign:"center",flexShrink:0}}>⏸️</span>
                              <span style={{fontSize:11,color:"#3d5494",flex:1}}>홀딩 {fd(h.startDate)} ~ {fd(h.endDate)}</span>
                              <span style={{fontSize:10,color:"#6a7fc8",background:"#edf0f8",borderRadius:4,padding:"1px 6px",fontWeight:600}}>{h.workdays || member.extensionDays}일</span>
                            </div>
                          );
                        }
                        const {rec} = row;
                        const sl = TIME_SLOTS.find(t => t.key === rec.timeSlot);
                        return (
                          <div key={rec.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:ri<rows.length-1?"1px solid #f8f4ef":"none"}}>
                            <span style={{fontSize:13,width:18,textAlign:"center",flexShrink:0}}>{sl?.icon || "📍"}</span>
                            <span style={{fontSize:11,color:"#3a4a3a",flex:1}}>{fmtWithDow(rec.date)}</span>
                            <span style={{fontSize:10,color:sl?.color,background:sl?.bg,borderRadius:4,padding:"1px 6px",fontWeight:600}}>{sl?.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
