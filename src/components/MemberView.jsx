import { useState, useEffect } from "react";
import { FONT, TODAY_STR, GE, SC, TYPE_CFG } from "../constants.js";
import { fmt, useClock } from "../utils.js";
import { getStatus, calcDL, effEnd, getClosureExtDays, usedAsOf } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";
import NoticeBoard from "./NoticeBoard.jsx";
import MemberReservePage from "./MemberReservePage.jsx";
import MemberDetailModal from "./MemberDetailModal.jsx";
import { MemberContactBar } from "./ContactBar.jsx";

export default function MemberView({member,bookings,setBookings,setMembers,specialSchedules,closures,notices,setNotices,scheduleTemplate,onLogout}){
  const m = member;
  const closuresCxt = useClosures();
  const status = getStatus(m, closuresCxt), sc = SC[status];
  const tc = TYPE_CFG[m.memberType] || TYPE_CFG["1month"];
  const dl = calcDL(m, closuresCxt);
  const end = effEnd(m, closuresCxt);
  const expired = dl < 0;
  const usedCnt = usedAsOf(m.id, TODAY_STR, bookings, [m]);
  const rem = expired ? 0 : Math.max(0, m.total - usedCnt);
  const pct = expired ? 100 : Math.round(usedCnt / Math.max(m.total, 1) * 100);
  const barColor = expired ? "#c97474" : status === "hold" ? "#6a7fc8" : "#5a9e6a";
  const isOff = status === "off";
  const closureExt = getClosureExtDays(m, closuresCxt);

  const [showDetail, setShowDetail] = useState(false);
  const [showHoldDetail, setShowHoldDetail] = useState(false); // 홀딩 상세 펼침 여부

  // 개인 공지 팝업
  const [popupNotice, setPopupNotice] = useState(null);
  useEffect(() => {
    const pending = (notices||[]).filter(n => n.targetMemberId === m.id);
    if(pending.length > 0 && !popupNotice) setPopupNotice(pending[0]);
  }, [notices]); // eslint-disable-line

  function markRead(n){
    setNotices && setNotices(p => p.filter(x => x.id !== n.id));
    setPopupNotice(null);
  }

  const {dateTimeStr} = useClock();

  return (
    <div style={{minHeight:"100vh", background:"#f5f3ef", fontFamily:FONT}}>

      {/* 개인 공지 팝업 */}
      {popupNotice && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
          <div style={{background:"#fff",borderRadius:18,padding:"24px 20px",width:"100%",maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}>
            <div style={{fontSize:20,marginBottom:8,textAlign:"center"}}>📢</div>
            <div style={{fontSize:15,fontWeight:700,color:"#1e2e1e",marginBottom:12,textAlign:"center"}}>{popupNotice.title}</div>
            <div style={{fontSize:13,color:"#5a5a5a",lineHeight:1.8,whiteSpace:"pre-wrap",background:"#f7f4ef",borderRadius:10,padding:"12px 14px",marginBottom:16}}>{popupNotice.content}</div>
            <button onClick={() => markRead(popupNotice)} style={{width:"100%",background:"#4a6a4a",color:"#fff",border:"none",borderRadius:12,padding:"13px 0",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>확인했어요</button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{background:"#f5f3ef",padding:"max(16px, env(safe-area-inset-top)) 16px 12px",maxWidth:520,margin:"0 auto",width:"100%",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
            <span style={{fontSize:20,color:"#5a7a5a"}}>ॐ</span>
            <span style={{fontSize:21,fontWeight:700,color:"#1e2e1e"}}>요가피안</span>
          </div>
          <div style={{fontSize:11,color:"#a09080"}}>{dateTimeStr}</div>
        </div>
        <button onClick={onLogout} style={{background:"#f0ece4",border:"none",borderRadius:8,padding:"6px 10px",fontSize:10,color:"#7a6e60",cursor:"pointer",fontFamily:FONT,marginTop:4}}>로그아웃</button>
      </div>

      <div style={{padding:"0 14px 0",maxWidth:520,margin:"0 auto",width:"100%"}}>
        <NoticeBoard notices={notices} member={member}/>

        {/* 회원 카드 — 클릭 시 상세 모달 */}
        <div style={{...S.card, opacity:isOff?0.82:1, marginBottom:12}}>
          <div style={{...S.cardTop}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flex:1,minWidth:0}}>
              <span style={{fontSize:20,lineHeight:1,flexShrink:0}}>{GE[m.gender]}</span>
              <span style={S.memberName}>{m.name}</span>
              {m.isNew && <span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
              {!isOff && <span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:tc.bg,color:tc.color,fontWeight:700}}>{tc.label}</span>}
              {m.holding && <span style={{fontSize:13,lineHeight:1,flexShrink:0}}>⏸️</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              <span style={{...S.statusBadge,background:sc.bg,color:sc.color}}><span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,display:"inline-block",marginRight:4}}/>{sc.label}</span>
            </div>
          </div>
          {m.adminNote && <div style={{fontSize:11,color:"#9a5a10",background:"#fffaeb",borderRadius:6,padding:"3px 8px",marginBottom:7,border:"1px dashed #e8c44a"}}>📝 {m.adminNote}</div>}
          {isOff ? (
            <div style={{fontSize:11,color:"#b0a090",marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
              <span>종료</span><span style={{fontWeight:600,color:"#c97474"}}>{fmt(end)}</span>
            </div>
          ) : (
            <>
              <div style={{marginBottom:10}}>
                {/* 등록·사용 왼쪽 한 줄 / 잔여 횟수 우측 강조 */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:11,color:"#9a8e80"}}>
                    등록 <b style={{color:"#3a4a3a"}}>{m.total}회</b>
                    <span style={{color:"#c8c0b0",margin:"0 5px"}}>·</span>
                    사용 <b style={{color:"#3a4a3a"}}>{usedCnt}회</b>
                  </span>
                  <span style={{fontSize:13,fontWeight:700,color:rem===0?"#9a5a10":"#2e5c3e"}}>잔여 <span style={{fontSize:22}}>{rem}</span>회</span>
                </div>
                <div style={{background:"#e8e4dc",borderRadius:8,height:20,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",transition:"width .4s"}}>
                    {pct>15&&<span style={{fontSize:10,fontWeight:700,color:"#fff"}}>{usedCnt}회</span>}
                  </div>
                </div>
              </div>
              <div style={S.dateRow}>
                <div style={{display:"flex",flexDirection:"column",gap:1}}><span style={S.dateLabel}>등록일</span><span style={S.dateVal}>{fmt(m.startDate)}</span></div>
                <span style={{color:"#c8c0b0",fontSize:13,marginTop:9}}>→</span>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  <span style={S.dateLabel}>종료일</span>
                  <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                    <span style={{...S.dateVal,color:dl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(end)}</span>
                    {closureExt>0&&<span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{closureExt}일</span>}
                    {/* 홀딩 버튼: 누르면 기간·원래종료일 펼침 */}
                    {(m.extensionDays||0)>0&&(
                      <button onClick={()=>setShowHoldDetail(v=>!v)} style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 6px",fontWeight:600,border:"none",cursor:"pointer",fontFamily:FONT}}>
                        홀딩+{m.extensionDays}일 {showHoldDetail?"▲":"▼"}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{...S.dChip,background:dl<0?"#f5eeee":dl<=7?"#fdf3e3":"#eef4ee",color:dl<0?"#c97474":dl<=7?"#9a5a10":"#2e6e44"}}>{dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`}</div>
              </div>
              {/* 홀딩 상세 펼침: holdingHistory 마지막 기록에서 기간 날짜 표시 */}
              {showHoldDetail&&(m.extensionDays||0)>0&&(()=>{
                const h = m.holdingHistory?.slice(-1)[0];
                // YYYY-MM-DD → YYYY.MM.DD 포맷 변환
                const fd = s => s ? s.replace(/-/g,".") : "";
                return (
                  <div style={{fontSize:11,color:"#6a7090",background:"#f0f2f5",borderRadius:8,padding:"8px 12px",marginTop:6,display:"flex",flexDirection:"column",gap:3}}>
                    <div>홀딩 기간 <b style={{color:"#3d5494"}}>{h ? `${fd(h.startDate)} ~ ${fd(h.endDate)}` : `${m.extensionDays}일`}</b></div>
                    <div>종료일 <b style={{color:"#5a6070"}}>{fmt(m.endDate)}</b> → 연장 후 <b style={{color:"#2e6e44"}}>{fmt(end)}</b></div>
                  </div>
                );
              })()}
            </>
          )}
          <div style={{...S.actions, marginTop:8}}>
            <button style={S.detailBtn} onClick={() => setShowDetail(true)}>상세보기</button>
          </div>
        </div>
      </div>

      <MemberReservePage
        member={m}
        bookings={bookings}
        setBookings={setBookings}
        setMembers={setMembers}
        setNotices={setNotices}
        specialSchedules={specialSchedules}
        closures={closures}
        notices={notices}
        scheduleTemplate={scheduleTemplate}
        onBack={()=>{}}
      />

      <div style={{display:"flex",justifyContent:"center"}}>
        <MemberContactBar/>
      </div>

      {/* 회원 상세 모달 (읽기 전용) */}
      {showDetail && (
        <MemberDetailModal
          member={m}
          bookings={bookings}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}
