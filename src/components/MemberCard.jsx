import { FONT, TODAY_STR, GE, SC, TYPE_CFG } from "../constants.js";
import { fmt } from "../utils.js";
import { getStatus, calcDL, effEnd, getClosureExtDays, usedAsOf } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";

export default function MemberCard({m,bookings,onEdit,onDel,onDetail}){
  const closures=useClosures();
  const dl=calcDL(m,closures);
  const expired=dl<0;
  const usedCnt=usedAsOf(m.id,TODAY_STR,bookings,[m]);
  const rem=expired?0:Math.max(0,m.total-usedCnt);
  const pct=expired?100:Math.round(usedCnt/m.total*100);
  const status=getStatus(m,closures),sc=SC[status];
  const end=effEnd(m,closures);
  const closureExt=getClosureExtDays(m,closures);
  const tc=TYPE_CFG[m.memberType]||TYPE_CFG["1month"];
  const barColor=expired?"#c97474":status==="hold"?"#6a7fc8":"#5a9e6a";
  const isOff=status==="off";
  const isLongOff=isOff&&Math.abs(dl)>30;

  return(
    <div style={{...S.card,opacity:isOff?0.82:1}}>
      <div style={{...S.cardTop}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flex:1,minWidth:0}}>
          <span style={{fontSize:20,lineHeight:1,flexShrink:0}}>{GE[m.gender]}</span>
          <span style={S.memberName}>{m.name}</span>
          {m.adminNickname&&<div style={{display:"inline-flex",alignItems:"center",gap:3,background:"#2e3a2e",borderRadius:6,padding:"2px 7px",flexShrink:0}}><span style={{fontSize:10,color:"#7aba7a"}}>👀</span><span style={{fontSize:11,fontWeight:700,color:"#a8e6a8"}}>{m.adminNickname}</span></div>}
          {m.isNew&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
          {!isLongOff&&<span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:tc.bg,color:tc.color,fontWeight:700}}>{tc.label}</span>}
          {m.holding&&<span style={{fontSize:13,lineHeight:1,flexShrink:0}}>⏸️</span>}
        </div>
        <span style={{...S.statusBadge,background:sc.bg,color:sc.color,flexShrink:0}}><span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,display:"inline-block",marginRight:4}}/>{sc.label}</span>
      </div>
      {m.adminNote&&<div style={{fontSize:11,color:"#9a5a10",background:"#fffaeb",borderRadius:6,padding:"3px 8px",marginBottom:7,border:"1px dashed #e8c44a"}}>📝 {m.adminNote}</div>}

      {isOff?(
        <div style={{fontSize:11,color:"#b0a090",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          <span>종료</span>
          <span style={{fontWeight:600,color:"#c97474"}}>{fmt(end)}</span>
        </div>
      ):(
        <>
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
              <span style={{fontSize:11,color:"#9a8e80"}}>등록 <b style={{color:"#3a4a3a"}}>{m.total}회</b></span>
              <span style={{fontSize:11,color:"#9a8e80"}}>사용 <b style={{color:"#3a4a3a"}}>{usedCnt}</b></span>
              <span style={{fontSize:13,fontWeight:700,color:rem===0?"#9a5a10":"#2e5c3e"}}>잔여 <span style={{fontSize:20}}>{rem}</span>회</span>
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
                {(m.extensionDays||0)>0&&<span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{m.extensionDays}일</span>}
              </div>
            </div>
            <div style={{...S.dChip,background:dl<0?"#f5eeee":dl<=7?"#fdf3e3":"#eef4ee",color:dl<0?"#c97474":dl<=7?"#9a5a10":"#2e6e44"}}>{dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`}</div>
          </div>
        </>
      )}

      <div style={S.actions}>
        <button style={S.detailBtn} onClick={onDetail}>상세보기</button>
        <button style={S.editBtn} onClick={onEdit}>수정</button>
        <button style={S.delBtn} onClick={onDel}>삭제</button>
      </div>
    </div>
  );
}
