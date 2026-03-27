import { fmt } from "../utils.js";
import { holdingElapsed } from "../memberCalc.js";

export default function HoldBanner({member}){
  const elapsed=holdingElapsed(member.holding);
  return(
    <div style={{padding:"8px 16px",background:"#edf0f8",display:"flex",alignItems:"center",gap:8,fontSize:12}}>
      <span style={{fontSize:14}}>⏸️</span>
      <span style={{color:"#6a7ab8"}}>{fmt(member.holding.startDate)} ~ 복귀 미정</span>
      <span style={{marginLeft:"auto",color:"#3d5494",fontWeight:700}}>+{elapsed}일 경과</span>
    </div>
  );
}
