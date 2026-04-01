// ─── MemberCard.jsx ──────────────────────────────────────────────────────────
// 회원 관리 탭의 카드 1장 = 회원 1명
// 표시 내용: 상태 뱃지 / 횟수 프로그레스바 / 등록·종료일 / D-day 칩 / 상세보기 버튼
// 스타일 공통 토큰: S.card, S.cardTop, S.statusBadge, S.dateRow, S.dChip, S.actions (styles.js)

import { FONT, TODAY_STR, GE, SC, TYPE_CFG } from "../constants.js";
import { fmt } from "../utils.js";
import { getDisplayStatus, calcDL, effEnd, getClosureExtDays, usedAsOf } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";

export default function MemberCard({m,bookings,onEdit,onDel,onDetail}){
  // ── 계산값 ─────────────────────────────────────────────────────────────────
  const closures=useClosures();
  const dl=calcDL(m,closures);           // 종료까지 남은 일수 (음수 = 이미 지남)
  const expired=dl<0;
  const usedCnt=usedAsOf(m.id,TODAY_STR,bookings,[m]); // 오늘까지 출석(attended) 횟수
  const rem=expired?0:Math.max(0,m.total-usedCnt);     // 잔여 횟수 (만료면 0)
  const pct=expired?100:Math.round(usedCnt/m.total*100); // 프로그레스바 % (0~100)
  const status=getDisplayStatus(m,closures,bookings),sc=SC[status]||SC["on"]; // 상태 스타일
  const end=effEnd(m,closures);          // 실제 표시 종료일 (홀딩·휴강 연장 포함)
  const closureExt=getClosureExtDays(m,closures); // 별도휴강으로 늘어난 일수 (뱃지 표시용)
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
          {/* 회원권 종류 뱃지 (1개월 / 3개월) — 만료 시 숨김 */}
          {/* 크기/굵기 낮춤 (fontSize:10 / fontWeight:500) — 색상은 constants.js TYPE_CFG에서 관리 */}
          {!isOff&&<span style={{fontSize:10,borderRadius:20,padding:"1px 7px",background:tc.bg,color:tc.color,fontWeight:500}}>{tc.label}</span>}
          {/* 홀딩 중 이모지 */}
          {m.holding&&<span style={{fontSize:13,lineHeight:1,flexShrink:0}}>⏸️</span>}
        </div>
        {/* 오른쪽: ON/OFF/HOLD/RENEW 상태 뱃지 */}
        <span style={{...S.statusBadge,background:sc.bg,color:sc.color,flexShrink:0}}><span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,display:"inline-block",marginRight:4}}/>{sc.label}</span>
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
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
              <span style={{fontSize:11,color:"#9a8e80"}}>등록 <b style={{color:"#3a4a3a"}}>{m.total}회</b></span>
              <span style={{fontSize:11,color:"#9a8e80"}}>사용 <b style={{color:"#3a4a3a"}}>{usedCnt}</b></span>
              {/* 잔여 0이면 주황색, 아니면 초록색 */}
              <span style={{fontSize:13,fontWeight:700,color:rem===0?"#9a5a10":"#2e5c3e"}}>잔여 <span style={{fontSize:20}}>{rem}</span>회</span>
            </div>
            {/* 바 너비 = 사용% / 바 안에 15% 초과 시 숫자 표시 */}
            <div style={{background:"#e8e4dc",borderRadius:8,height:20,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",transition:"width .4s"}}>
                {pct>15&&<span style={{fontSize:10,fontWeight:700,color:"#fff"}}>{usedCnt}회</span>}
              </div>
            </div>
          </div>

          {/* ── 날짜 행: 등록일 → 종료일 + 연장 뱃지 + D-day 칩 ──────────── */}
          <div style={S.dateRow}>
            <div style={{display:"flex",flexDirection:"column",gap:1}}><span style={S.dateLabel}>등록일</span><span style={S.dateVal}>{fmt(m.startDate)}</span></div>
            <span style={{color:"#c8c0b0",fontSize:13,marginTop:9}}>→</span>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              <span style={S.dateLabel}>종료일</span>
              <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                {/* 7일 이내면 주황색 강조 */}
                <span style={{...S.dateVal,color:dl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(end)}</span>
                {/* 별도휴강 연장일 뱃지 */}
                {closureExt>0&&<span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{closureExt}일</span>}
                {/* 홀딩 연장일 뱃지 */}
                {(m.extensionDays||0)>0&&<span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{m.extensionDays}일</span>}
              </div>
            </div>
            {/* D-day 칩: 음수=D+n (초과), 0=D-Day, 양수=D-n */}
            <div style={{...S.dChip,background:dl<0?"#f5eeee":dl<=7?"#fdf3e3":"#eef4ee",color:dl<0?"#c97474":dl<=7?"#9a5a10":"#2e6e44"}}>{dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`}</div>
          </div>
        </>
      )}

      {/* ── 액션 버튼 (상세보기 → AdminDetailModal 열림) ────────────────── */}
      <div style={S.actions}>
        <button style={S.detailBtn} onClick={onDetail}>상세보기</button>
      </div>
    </div>
  );
}
