import { useState, useRef, useMemo, useCallback, useEffect, createContext, useContext } from "react";
import { createClient } from "@supabase/supabase-js";

function debounce(fn, delay){
  let timer;
  return (...args)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...args), delay); };
}

const ClosuresContext = createContext([]);
const useClosures = () => useContext(ClosuresContext);

const SLOT_LIMIT = 10;
const SCHEDULE = {0:[],1:["dawn","morning","lunch","evening"],2:["lunch","evening"],3:["dawn","morning","lunch","evening"],4:["lunch","evening"],5:["dawn","morning","evening"],6:[]};
const TIME_SLOTS = [
  {key:"dawn",      label:"새벽",time:"06:30",color:"#3d5494",bg:"#edf0f8",icon:"🌙"},
  {key:"morning",   label:"오전",time:"08:30",color:"#3d6e45",bg:"#eaf4ea",icon:"🌤️"},
  {key:"lunch",     label:"점심",time:"11:50",color:"#8a5510",bg:"#fdf3e3",icon:"☀️"},
  {key:"afternoon", label:"오후",time:"14:00",color:"#6a5494",bg:"#f0edf8",icon:"🌞"},
  {key:"evening",   label:"저녁",time:"19:30",color:"#5c3070",bg:"#f2edf8",icon:"🌛"},
];
const DOW_KO=["일","월","화","수","목","금","토"];
const FONT="'Malgun Gothic','맑은 고딕',-apple-system,sans-serif";

// 한국 공휴일 (2025~2026)
const KR_HOLIDAYS={
  "2025-01-01":"신정","2025-01-28":"설날연휴","2025-01-29":"설날","2025-01-30":"설날연휴",
  "2025-03-01":"삼일절","2025-05-05":"어린이날","2025-05-06":"대체공휴일",
  "2025-05-15":"부처님오신날","2025-06-06":"현충일",
  "2025-08-15":"광복절","2025-10-03":"개천절","2025-10-05":"추석연휴",
  "2025-10-06":"추석","2025-10-07":"추석연휴","2025-10-08":"대체공휴일",
  "2025-10-09":"한글날","2025-12-25":"크리스마스",
  "2025-12-31":"연말 무료수업",
  "2026-01-01":"신년 무료수업","2026-02-15":"설날연휴","2026-02-16":"설날","2026-02-17":"설날연휴","2026-02-18":"설날연휴",
  "2026-03-01":"삼일절","2026-03-02":"대체공휴일","2026-05-05":"어린이날","2026-05-24":"부처님오신날",
  "2026-06-06":"현충일","2026-06-08":"대체공휴일","2026-08-15":"광복절","2026-08-17":"대체공휴일",
  "2026-09-24":"추석연휴","2026-09-25":"추석","2026-09-26":"추석연휴","2026-09-28":"대체공휴일",
  "2026-10-03":"개천절","2026-10-05":"대체공휴일","2026-10-09":"한글날","2026-12-25":"크리스마스",
};
function isHoliday(dateStr){ return !!KR_HOLIDAYS[dateStr]; }
function holidayName(dateStr){ return KR_HOLIDAYS[dateStr]||""; }
function toDateStr(y,m,d){ return`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
const LOGO_B64="/logo.png";
// 오늘 날짜를 항상 실제 현재 날짜로 동적 계산
const _now=new Date();
const TODAY_STR=`${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,"0")}-${String(_now.getDate()).padStart(2,"0")}`;
const TODAY=new Date(_now.getFullYear(),_now.getMonth(),_now.getDate());
const ADMIN_PIN="0066";

const parseLocal=s=>{if(!s)return TODAY;const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);};
const fmt=d=>{const dt=parseLocal(d);return`${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,"0")}.${String(dt.getDate()).padStart(2,"0")}`;};
const fmtWithDow=d=>`${fmt(d)} (${DOW_KO[parseLocal(d).getDay()]})`;
function useClock(){
  const [now,setNow]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);
  const h=String(now.getHours()).padStart(2,"0"),mi=String(now.getMinutes()).padStart(2,"0"),s=String(now.getSeconds()).padStart(2,"0");
  const dateStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  return{timeStr:`${h}:${mi}:${s}`,dateTimeStr:`${fmtWithDow(dateStr)} ${h}:${mi}:${s}`};
}
const addDays=(s,n)=>{const d=parseLocal(s);d.setDate(d.getDate()+n);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
// 3개월권: 휴강 반영 실제 종료일 (60평일 카운트)
// 홀딩 중인 기간은 카운트에서 제외 (홀딩 startDate까지만 카운트 후 복귀 후 이어서)
// 3개월권 60평일 기준 종료일 (휴강 반영, extensionDays 제외 - 순수 60평일)
// 3개월권 휴강 연장일수: startDate~endDate 사이 전체휴강 평일수
function getClosureExtDays(
