// ─── MemberCard.jsx ──────────────────────────────────────────────────────────
// 회원 관리 탭의 카드 1장 = 회원 1명
// 표시 내용: 상태 뱃지 / 횟수 프로그레스바 / 등록·종료일 / D-day 칩 / 상세보기 버튼
// 스타일 공통 토큰: S.card, S.cardTop, S.statusBadge, S.dateRow, S.dChip, S.actions (styles.js)

import { useState } from "react";
import { FONT, TODAY_STR, GE, SC, TYPE_CFG } from "../constants.js";
import { fmt, parseLocal, addDays } from "../utils.js";
import { getDisplayStatus, calcDL, effEnd, getClosureExtDays, usedAsOf, activePeriodTotal, getActivePeriod, isTerminatedByHolding, totalHoldingCalendarDays } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";

export default function MemberCard({m,bookings,onEdit,onDel,onDetail}){
  // ── 계산값 ─────────────────────────────────────────────────────────────────
  const closures=useClosures();
  const [showHoldDetail,setShowHoldDetail]=useState(false); // 홀딩 상세 펼침 여부
  const dl=calcDL(m,closures);           // 종료까지 남은 일수 (음수 = 이미 지남)
  // 홀딩 중이면 endDate 초과해도 expired 아님 — effEnd가 동적 연장되지만 이중 안전장치
  const expired=(dl<0&&!m.holding)||(m.holding&&isTerminatedByHolding(m)); // 홀딩 90일 초과도 만료 처리
  const usedCnt=usedAsOf(m.id,TODAY_STR,bookings,[m]); // 오늘까지 출석(attended) 횟수
  const periodTotal=activePeriodTotal(m,TODAY_STR,bookings,[m]); // 유효 기수 총 횟수 (이월 배분 포함)
  const status=getDisplayStatus(m,closures,bookings),sc=SC[status]||SC["on"]; // 상태 스타일
  const end=effEnd(m,closures);          // 실제 표시 종료일 (홀딩·휴강 연장 포함)
  // 카드 등록일·종료일 표시용 활성 기수 — 스필오버·갭 모두 반영
  const _ap=getActivePeriod(m,TODAY_STR,bookings);
  const displayStart=(_ap?.startDate===null)?null:(_ap?.startDate||m.startDate);
  const isFuturePeriod=_ap&&_ap.startDate>TODAY_STR;
  const isPendingPeriod=_ap?.startDate===null;
  const closureExt=getClosureExtDays(m,closures); // 별도휴강으로 늘어난 일수 (뱃지 표시용)
  const _apEndBase=_ap?.endDate||m.endDate;
  // 노쇼 횟수 → 패널티 동적 계산 (DB값 vs 실계산값 중 큰 것 — 기존 노쇼도 즉시 반영)
  const noshowPeriodStart=isPendingPeriod?null:(_ap?.startDate||m.startDate);
  const noshowCnt=noshowPeriodStart
    ?bookings.filter(b=>b.memberId===m.id&&b.status==="cancelled"&&b.cancelledBy==="noshow"&&b.date>=noshowPeriodStart&&b.date<=(_apEndBase||m.endDate)).length
    :0;
  const _threshold=m.memberType==="3month"?4:2;
  const _expectedCrossings=Math.floor(noshowCnt/_threshold);
  const _acked=m.noshowThresholdAck||0;
  // 검토 전(acked < expected): 동적 계산값 표시 / 검토 후(acked >= expected): 관리자 확정값 사용
  const noshowPenalties=_acked>=_expectedCrossings?(m.noshowPenalties||0):Math.max(m.noshowPenalties||0,_expectedCrossings);
  const rem=expired?0:Math.max(0,periodTotal-usedCnt-noshowPenalties); // 잔여 횟수
  const pct=expired?100:Math.round((usedCnt+noshowPenalties)/Math.max(periodTotal,1)*100); // 프로그레스바 %
  // 활성 기수 시작일 기준 홀딩 일수 계산 — 미래 기수 pre-register 시 m.startDate 오류 방지
  const holdExt=(!isPendingPeriod&&!isFuturePeriod)?totalHoldingCalendarDays(m,_ap?.startDate||m.startDate):0;
  const displayEnd=isPendingPeriod?null:isFuturePeriod?_apEndBase:(()=>{
    let r=_apEndBase;
    if(closureExt>0)r=addDays(r,closureExt);
    if(holdExt>0)r=addDays(r,holdExt);
    if((m.bonusDays||0)>0)r=addDays(r,m.bonusDays);
    return r;
  })();
  const TODAY=parseLocal(TODAY_STR);
  const displayDl=Math.ceil((parseLocal(displayEnd)-TODAY)/86400000);
  // 미정 기수: _ap.total(다음 기수 횟수)·사용0·잔여=총수·0% / 미래기수: 해당 기수 total / 현재기수: 계산값
  const displayTotal=isPendingPeriod?(_ap?.total||0):isFuturePeriod?(_ap.total||periodTotal):periodTotal;
  const displayUsed=isPendingPeriod?0:isFuturePeriod?0:usedCnt;
  const displayRem=isPendingPeriod?(_ap?.total||0):expired?0:Math.max(0,displayTotal-displayUsed-noshowPenalties);
  const displayPct=isPendingPeriod?0:expired?100:Math.round(displayUsed/Math.max(displayTotal,1)*100);
  // 현재 기수 진행 중에 다음 기수가 이미 등록된 경우 (사전 갱신) — 갭·미정 표시 중엔 숨김
  const hasNextPeriod=!isFuturePeriod&&!isPendingPeriod&&(m.renewalHistory||[]).some(r=>r.startDate>TODAY_STR||r.startDate===null);
  const tc=TYPE_CFG[m.memberType]||TYPE_CFG["1month"]; // 회원권 종류 스타일 (1개월/3개월)

  // ── 바 색상: 만료=빨강 / 홀딩=파랑 / 정상=초록 ──────────────────────────
  const barColor=expired?"#c97474":status==="hold"?"#6a7fc8":"#5a9e6a";
  const isOff=status==="off";
  const isLongOff=isOff&&Math.abs(dl)>30; // 만료 30일 초과 — 현재 미사용(향후 필터용)

  return(
    // ── 카드 컨테이너: 만료 시 약간 투명처리 ──────────────────────────────
    <div style={{...S.card,opacity:isOff?0.82:1}}>

      {/* ── 카드 상단: 이름·뱃지 줄 ──────────────────────────────────────── */}
      <div style={{...S.cardTop}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flex:1,minWidth:0}}>
          {/* 성별 이모지 (GE["F"] / GE["M"]) */}
          <span style={{fontSize:20,lineHeight:1,flexShrink:0}}>{GE[m.gender]}</span>
          {/* 이름: S.memberName(fontSize:15) 보다 크게 표시 — fontSize:17 */}
          <span style={{...S.memberName,fontSize:17}}>{m.name}</span>
          {/* 관리자 내부 닉네임 뱃지 (adminNickname 필드) */}
          {m.adminNickname&&<div style={{display:"inline-flex",alignItems:"center",gap:3,background:"#2e3a2e",borderRadius:10,padding:"1px 6px",flexShrink:0}}><span style={{fontSize:9,color:"#7aba7a"}}>👀</span><span style={{fontSize:9,fontWeight:600,color:"#a8e6a8"}}>{m.adminNickname}</span></div>}
          {/* 신규 회원 N 뱃지 (isNew 필드) */}
          {m.isNew&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
          {/* 홀딩 중 이모지 */}
          {m.holding&&<span style={{fontSize:13,lineHeight:1,flexShrink:0}}>⏸️</span>}
          {/* 사전 갱신: 현재 기수 진행 중에 다음 기수가 이미 등록된 회원 */}
          {hasNextPeriod&&<span style={{fontSize:9,background:"#e8edf8",color:"#3d5494",borderRadius:4,padding:"1px 5px",fontWeight:700,flexShrink:0}}>다음기수↗</span>}
          {/* 현재 기수 노쇼 횟수 */}
          {noshowCnt>0&&<span style={{fontSize:10,background:"#fff0f0",color:"#c97474",borderRadius:4,padding:"1px 6px",fontWeight:700,flexShrink:0}}>🚫 {noshowCnt}</span>}
        </div>
        {/* 오른쪽: 개월수 뱃지 + 상태 뱃지 (MemberView.jsx와 동일 구조) */}
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {/* 회원권 종류 뱃지 (1개월 / 3개월) — 만료 시 숨김 */}
          {!isOff&&<span style={{fontSize:10,borderRadius:20,padding:"1px 7px",background:tc.bg,color:tc.color,fontWeight:500}}>{tc.label}</span>}
          <span style={{...S.statusBadge,background:sc.bg,color:sc.color}}><span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,display:"inline-block",marginRight:4}}/>{sc.label}</span>
        </div>
      </div>

      {/* ── 관리자 메모 (있을 때만 표시) ────────────────────────────────── */}
      {m.adminNote&&<div style={{fontSize:11,color:"#9a5a10",background:"#fffaeb",borderRadius:6,padding:"3px 8px",marginBottom:7,border:"1px dashed #e8c44a"}}>📝 {m.adminNote}</div>}

      {/* ── OFF 상태: 종료일만 표시 ──────────────────────────────────────── */}
      {isOff?(
        <div style={{fontSize:11,color:"#b0a090",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          <span>종료</span>
          <span style={{fontWeight:600,color:"#c97474"}}>{fmt(end)}</span>
        </div>
      ):(
        <>
          {/* ── 횟수 프로그레스바 ──────────────────────────────────────────── */}
          <div style={{marginBottom:10}}>
            {/* 등록·사용 왼쪽 한 줄 / 잔여 횟수 우측 강조 — MemberView와 동일 형식 */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <span style={{fontSize:11,color:"#9a8e80"}}>
                등록 <b style={{color:"#3a4a3a"}}>{displayTotal}회</b>
                <span style={{color:"#c8c0b0",margin:"0 5px"}}>·</span>
                사용 <b style={{color:"#3a4a3a"}}>{displayUsed}회</b>
              </span>
              {/* 잔여 0이면 주황색, 아니면 초록색 */}
              <span style={{fontSize:13,fontWeight:700,color:displayRem===0?"#9a5a10":"#2e5c3e"}}>잔여 <span style={{fontSize:20}}>{displayRem}</span>회</span>
            </div>
            {/* 바 너비 = 사용% / 바 안에 15% 초과 시 숫자 표시 */}
            <div style={{background:"#e8e4dc",borderRadius:8,height:20,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${displayPct}%`,background:barColor,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",transition:"width .4s"}}>
                {displayPct>15&&<span style={{fontSize:10,fontWeight:700,color:"#fff"}}>{displayUsed}</span>}
              </div>
            </div>
          </div>

          {/* ── 날짜 행: 등록일 → 종료일 + 연장 뱃지 + D-day 칩 ──────────── */}
          {/* flexWrap 제거 + 종료일 col flex:1 → D-day 칩이 줄 넘침 없이 우측 고정 */}
          <div style={{...S.dateRow,flexWrap:"nowrap",alignItems:"flex-start"}}>
            <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}><span style={S.dateLabel}>등록일</span><span style={S.dateVal}>{fmt(displayStart)}</span></div>
            <span style={{color:"#c8c0b0",fontSize:13,marginTop:9,flexShrink:0}}>→</span>
            <div style={{display:"flex",flexDirection:"column",gap:2,flex:1,minWidth:0}}>
              <span style={S.dateLabel}>종료일</span>
              <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"nowrap",overflow:"hidden"}}>
                {isPendingPeriod
                  ?<span style={{...S.dateVal,color:"#3d5494",fontWeight:700}}>미정</span>
                  :<>
                    <span style={{...S.dateVal,color:displayDl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(displayEnd)}</span>
                    {closureExt>0&&<span style={{fontSize:9,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 4px",fontWeight:600}}>휴강+{closureExt}일</span>}
                    {(holdExt>0||(m.bonusDays||0)>0)&&(
                      <button onClick={()=>setShowHoldDetail(v=>!v)} style={{fontSize:9,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600,border:"none",cursor:"pointer",fontFamily:FONT,flexShrink:0}}>
                        연장+{holdExt+(m.bonusDays||0)}일{showHoldDetail?"▲":"▼"}
                      </button>
                    )}
                  </>
                }
              </div>
            </div>
            {isPendingPeriod
              ?<div style={{...S.dChip,flexShrink:0,alignSelf:"center",background:"#edf3ff",color:"#3d5494"}}>대기</div>
              :<div style={{...S.dChip,flexShrink:0,alignSelf:"center",background:displayDl<0?"#f5eeee":displayDl<=7?"#fdf3e3":"#eef4ee",color:displayDl<0?"#c97474":displayDl<=7?"#9a5a10":"#2e6e44"}}>{displayDl<0?`D+${Math.abs(displayDl)}`:displayDl===0?"D-Day":`D-${displayDl}`}</div>
            }
          </div>
          {/* 연장 세부 내역 펼침: 홀딩 기간 / 보너스 기간 / 종료일→연장후 */}
          {showHoldDetail&&(holdExt>0||(m.bonusDays||0)>0)&&(()=>{
            const fd=s=>s?s.replace(/-/g,"."):""
            const h=m.holdingHistory?.slice(-1)[0]; // 완료된 홀딩
            return(
              <div style={{fontSize:11,color:"#6a7090",background:"#f0f2f5",borderRadius:8,padding:"8px 12px",marginTop:6,display:"flex",flexDirection:"column",gap:3}}>
                {holdExt>0&&(
                  h?.startDate&&h?.endDate
                    ?<div>홀딩 기간 <b style={{color:"#3d5494"}}>{fd(h.startDate)} ~ {fd(h.endDate)}</b> <span style={{color:"#6a7fc8"}}>(+{holdExt}일)</span></div>
                    :m.holding?.startDate
                    ?<div>홀딩 진행 중 <b style={{color:"#3d5494"}}>{fd(m.holding.startDate)}~</b> <span style={{color:"#6a7fc8"}}>(+{holdExt}일)</span></div>
                    :null
                )}
                {(m.bonusDays||0)>0&&<div>보너스 기간 <b style={{color:"#9a5a10"}}>(+{m.bonusDays}일)</b></div>}
                <div>종료일 <b style={{color:"#5a6070"}}>{fmt(_apEndBase)}</b> → 연장 후 <b style={{color:"#b86a10"}}>{fmt(displayEnd)}</b></div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── 액션 버튼 (상세보기 → AdminDetailModal 열림) ────────────────── */}
      <div style={{...S.actions,marginTop:8}}>
        <button style={S.detailBtn} onClick={onDetail}>상세보기</button>
      </div>
    </div>
  );
}
