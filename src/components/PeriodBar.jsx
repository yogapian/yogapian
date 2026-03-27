import { useClosures } from "../context.js";
import { fmt } from "../utils.js";
import { effEnd, calcDL, getClosureExtDays } from "../memberCalc.js";

export default function PeriodBar({member}){
  const closures=useClosures();
  const end=effEnd(member,closures);
  const dl=calcDL(member,closures);
  const dlColor=dl<0?"#c97474":dl<=7?"#9a5a10":"#2e5c3e";
  const dlBg=dl<0?"#fef5f5":dl<=7?"#fdf3e3":"#eef5ee";
  const dlLabel=dl<0?`${Math.abs(dl)}일 초과`:dl===0?"오늘 만료":`D-${dl}`;
  const closureExt=getClosureExtDays(member,closures);
  const holdExt=member.extensionDays||0;
  return(
    <div style={{padding:"10px 16px",background:"#fafaf7",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",fontSize:12,color:"#7a6e60"}}>
        <span style={{fontWeight:600}}>{fmt(member.startDate)}</span>
        <span style={{color:"#c8c0b0"}}>→</span>
        <span style={{fontWeight:600,color:dl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(end)}</span>
        {closureExt>0&&<span style={{fontSize:10,background:"#f0ede8",color:"#8a7e70",borderRadius:4,padding:"1px 5px",fontWeight:600}}>휴강+{closureExt}일</span>}
        {holdExt>0&&<span style={{fontSize:10,background:"#e8eaed",color:"#7a8090",borderRadius:4,padding:"1px 5px",fontWeight:600}}>홀딩+{holdExt}일</span>}
      </div>
      <div style={{fontSize:13,fontWeight:700,color:dlColor,background:dlBg,borderRadius:8,padding:"4px 10px",flexShrink:0}}>{dlLabel}</div>
    </div>
  );
}
