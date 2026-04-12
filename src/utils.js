import { useState, useEffect } from "react";
import { DOW_KO, TODAY, TODAY_STR, KR_HOLIDAYS } from "./constants.js";

export function debounce(fn, delay){
  let timer;
  return (...args)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...args), delay); };
}

export function isHoliday(dateStr){ return !!KR_HOLIDAYS[dateStr]; }
export function holidayName(dateStr){ return KR_HOLIDAYS[dateStr]||""; }
export function toDateStr(y,m,d){ return`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }

export const parseLocal=s=>{if(!s)return TODAY;const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);};
export const fmt=d=>{const dt=parseLocal(d);return`${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,"0")}.${String(dt.getDate()).padStart(2,"0")}`;};
export const fmtWithDow=d=>`${fmt(d)} (${DOW_KO[parseLocal(d).getDay()]})`;

export function useClock(){
  const [now,setNow]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);
  // 기기 타임존 무관하게 항상 KST(UTC+9) 기준으로 날짜·시간 계산
  const kst=new Date(now.getTime()+9*3600*1000);
  const h=String(kst.getUTCHours()).padStart(2,"0"),mi=String(kst.getUTCMinutes()).padStart(2,"0"),s=String(kst.getUTCSeconds()).padStart(2,"0");
  const dateStr=`${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,"0")}-${String(kst.getUTCDate()).padStart(2,"0")}`;
  return{timeStr:`${h}:${mi}:${s}`,dateTimeStr:`${fmtWithDow(dateStr)} ${h}:${mi}:${s}`};
}

export const addDays=(s,n)=>{const d=parseLocal(s);d.setDate(d.getDate()+n);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};

export function wdInMonth(y,mo){let c=0,days=new Date(y,mo+1,0).getDate();for(let d=1;d<=days;d++){const w=new Date(y,mo,d).getDay();if(w&&w!==6)c++;}return c;}
export function countWorkdays(s,e){let c=0,cur=parseLocal(s),end=parseLocal(e);while(cur<=end){const d=cur.getDay();if(d&&d!==6)c++;cur.setDate(cur.getDate()+1);}return c;}

export function endOfNextMonth(fromStr){
  const d=parseLocal(fromStr);
  const nextMonth=new Date(d.getFullYear(), d.getMonth()+2, 0);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth()+1).padStart(2,'0')}-${String(nextMonth.getDate()).padStart(2,'0')}`;
}
export function endOfMonth(fromStr){
  const d=parseLocal(fromStr);
  const last=new Date(d.getFullYear(), d.getMonth()+1, 0);
  return `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
}
