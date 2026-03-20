import { useState, useMemo, useCallback, useEffect } from "react";

// debounce 헬퍼
function debounce(fn, delay){
  let timer;
  return (...args)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...args), delay); };
}

// ─── Supabase 클라이언트 ─────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
async function sbGet(table){const{data,error}=await supabase.from(table).select('*').order('id');if(error)throw error;return data||[];}
async function sbUpsert(table,rows){if(!rows?.length)return;const{error}=await supabase.from(table).upsert(rows,{onConflict:'id'});if(error)throw error;}
async function sbDelete(table,id){const{error}=await supabase.from(table).delete().eq('id',id);if(error)throw error;}

// ─── Constants ────────────────────────────────────────────────
const SLOT_LIMIT = 10; // 타임당 최대 예약 인원
const SCHEDULE = {0:[],1:["dawn","morning","lunch","evening"],2:["lunch","evening"],3:["dawn","morning","lunch","evening"],4:["lunch","evening"],5:["dawn","morning","evening"],6:[]};
const TIME_SLOTS = [
  {key:"dawn",   label:"새벽",time:"06:30",color:"#3d5494",bg:"#edf0f8",icon:"🌙"},
  {key:"morning",label:"오전",time:"08:30",color:"#3d6e45",bg:"#eaf4ea",icon:"🌤️"},
  {key:"lunch",  label:"점심",time:"11:50",color:"#8a5510",bg:"#fdf3e3",icon:"☀️"},
  {key:"evening",label:"저녁",time:"19:30",color:"#5c3070",bg:"#f2edf8",icon:"🌛"},
];
const DOW_KO=["일","월","화","수","목","금","토"];
const FONT="'Malgun Gothic','맑은 고딕',-apple-system,sans-serif";
const TODAY_STR="2026-03-20";
const TODAY=new Date(2026,2,20); // 로컬 날짜
const ADMIN_PIN="0000";

// ─── Helpers ──────────────────────────────────────────────────
const parseLocal=s=>{if(!s)return TODAY;const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);};
const fmt=d=>{const dt=parseLocal(d);return`${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,"0")}.${String(dt.getDate()).padStart(2,"0")}`;};
const fmtWithDow=d=>`${fmt(d)} (${DOW_KO[parseLocal(d).getDay()]})`;
const addDays=(s,n)=>{const d=parseLocal(s);d.setDate(d.getDate()+n);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const calcDL=(m)=>{const e=parseLocal(addDays(m.endDate,(m.extensionDays||0)+(m.holdingDays||0)));return Math.ceil((e-TODAY)/86400000);};
const effEnd=(m)=>addDays(m.endDate,(m.extensionDays||0)+(m.holdingDays||0));
function wdInMonth(y,mo){let c=0,days=new Date(y,mo+1,0).getDate();for(let d=1;d<=days;d++){const w=new Date(y,mo,d).getDay();if(w&&w!==6)c++;}return c;}
function countWorkdays(s,e){let c=0,cur=parseLocal(s),end=parseLocal(e);while(cur<=end){const d=cur.getDay();if(d&&d!==6)c++;cur.setDate(cur.getDate()+1);}return c;}

// 익월 말일 계산 (신규 1개월 회원 자동 종료일)
function endOfNextMonth(fromStr){
  const d=parseLocal(fromStr);
  // 다음 달의 마지막 날
  const nextMonth=new Date(d.getFullYear(), d.getMonth()+2, 0);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth()+1).padStart(2,'0')}-${String(nextMonth.getDate()).padStart(2,'0')}`;
}

// 60 워크데이 기준 3개월 종료일 (closures의 휴강일 제외하여 추가 연장)
function calc3MonthEnd(startStr, closures=[]) {
  const closedDates = new Set(
    closures.filter(cl=>!cl.timeSlot).map(cl=>cl.date)
  );
  let workdays = 0, cur = parseLocal(startStr);
  // 60 워크데이가 될 때까지 전진
  while(workdays < 60) {
    const dow = cur.getDay();
    const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
    if(dow !== 0 && dow !== 6 && !closedDates.has(ds)) workdays++;
    cur.setDate(cur.getDate()+1);
  }
  // cur is now day after the 60th workday
  cur.setDate(cur.getDate()-1);
  return `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
}

// 홀딩 경과일 (오늘 기준)
function holdingElapsed(holding) {
  if(!holding || !holding.startDate) return 0;
  return Math.max(0, Math.ceil((TODAY - parseLocal(holding.startDate)) / 86400000));
}
function get3MonthsInfo(s){const st=parseLocal(s);return Array.from({length:3},(_,i)=>{const rm=st.getMonth()+i,y=st.getFullYear()+Math.floor(rm/12),mo=rm%12,wd=wdInMonth(y,mo);return{year:y,month:mo,monthName:`${y}.${String(mo+1).padStart(2,"0")}`,workingDays:wd,surplus:Math.max(0,wd-20)};});}

// 특정 날짜 기준 사용 횟수 계산 (출석 보드 슬롯에서 날짜별 잔여 표시용)
function usedAsOf(memberId, targetDate, bookings, members){
  // 현재 회원권 startDate 이후부터만 카운트
  const member = members ? members.find(m=>m.id===memberId) : null;
  const startDate = member ? member.startDate : "2000-01-01";
  return bookings.filter(b=>
    b.memberId===memberId &&
    b.status!=="cancelled" &&
    b.date>=startDate &&
    b.date<=targetDate
  ).length;
}

const getStatus=m=>{const rem=m.total-m.used,dl=calcDL(m);if(m.holdingDays>0||m.holding)return"hold";if(dl<0||rem===0)return"off";return"on";};
const SC={on:{label:"ON",bg:"#e8f0e8",color:"#2e6e44",dot:"#3d8a55"},off:{label:"OFF",bg:"#f5eeee",color:"#8e3030",dot:"#c97474"},hold:{label:"HOLD",bg:"#edf0f8",color:"#3d5494",dot:"#6a7fc8"}};
const GE={F:"🧘🏻‍♀️",M:"🧘🏻‍♂️"};
const TYPE_CFG={"1month":{label:"1개월",bg:"#e0f2e9",color:"#1e6040"},"3month":{label:"3개월",bg:"#ede9fe",color:"#5b30b8"}};

// booking status: "reserved"|"attended"|"cancelled"
const BOOKING_STATUS={
  reserved: {label:"출석",bg:"#e8f0e8",color:"#2e6e44",icon:"✓"},
  attended: {label:"출석",bg:"#e8f0e8",color:"#2e6e44",icon:"✓"},
  cancelled:{label:"취소",bg:"#f0ece4",color:"#9a8e80",icon:"×"},
};

// ─── Initial Data ─────────────────────────────────────────────
const INIT_NOTICES=[
  {id:1,title:"3월 수업 일정 안내",content:"3월 1일 삼일절은 오전 10시, 오후 5시 특별 수업이 있습니다. 네이버 예약 또는 이 페이지에서 예약해주세요 🙏",pinned:true,createdAt:"2026-03-01"},
  {id:2,title:"4주 단위 수련 안내",content:"요가피안은 4주 단위로 운영됩니다. 매월 휴강 일정을 꼭 확인해주세요. 수련실은 시작 20분 전 개방됩니다.",pinned:false,createdAt:"2026-01-02"},
];

const INIT_MEMBERS=[
  {id:1,gender:"F",name:"김미림",adminNickname:"",adminNote:"",phone4:"7571",firstDate:"2026-03-09",memberType:"1month",isNew:true,total:6,used:3,startDate:"2026-03-09",endDate:"2026-04-13",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-03-09",endDate:"2026-04-13",total:6,memberType:"1month",payment:""}]},
  {id:2,gender:"F",name:"황지민",adminNickname:"",adminNote:"",phone4:"7571",firstDate:"2026-03-09",memberType:"1month",isNew:true,total:6,used:3,startDate:"2026-03-09",endDate:"2026-04-13",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-03-09",endDate:"2026-04-13",total:6,memberType:"1month",payment:""}]},
  {id:3,gender:"M",name:"김건태",adminNickname:"",adminNote:"",phone4:"5224",firstDate:"2026-01-26",memberType:"3month",isNew:false,total:24,used:12,startDate:"2026-01-26",endDate:"2026-04-28",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-01-26",endDate:"2026-04-28",total:24,memberType:"3month",payment:""}]},
  {id:4,gender:"F",name:"최지혜",adminNickname:"",adminNote:"",phone4:"0520",firstDate:"2026-01-26",memberType:"3month",isNew:false,total:24,used:12,startDate:"2026-01-26",endDate:"2026-04-28",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-01-26",endDate:"2026-04-28",total:24,memberType:"3month",payment:""}]},
  {id:5,gender:"F",name:"김윤진",adminNickname:"",adminNote:"",phone4:"2272",firstDate:"2025-07-07",memberType:"3month",isNew:false,total:36,used:6,startDate:"2026-03-02",endDate:"2026-06-02",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-07-01",endDate:"2025-07-31",total:0,memberType:"1month",payment:""},{id:2,startDate:"2025-08-01",endDate:"2025-08-31",total:0,memberType:"1month",payment:""},{id:3,startDate:"2025-09-01",endDate:"2025-09-30",total:0,memberType:"1month",payment:""},{id:4,startDate:"2026-03-02",endDate:"2026-06-02",total:36,memberType:"3month",payment:""}]},
  {id:6,gender:"F",name:"김현지(1호)",adminNickname:"1호/저녁반",adminNote:"저녁수업 고정",phone4:"0425",firstDate:"2026-03-09",memberType:"1month",isNew:true,total:10,used:7,startDate:"2026-03-03",endDate:"2026-04-07",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-06-01",endDate:"2025-06-30",total:0,memberType:"1month",payment:""},{id:2,startDate:"2025-07-01",endDate:"2025-07-31",total:0,memberType:"1month",payment:""},{id:3,startDate:"2025-08-01",endDate:"2025-08-31",total:0,memberType:"1month",payment:""},{id:4,startDate:"2025-09-01",endDate:"2025-09-30",total:0,memberType:"1month",payment:""},{id:5,startDate:"2025-10-01",endDate:"2025-10-31",total:0,memberType:"1month",payment:""},{id:6,startDate:"2025-11-01",endDate:"2025-11-30",total:0,memberType:"1month",payment:""},{id:7,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:8,startDate:"2026-03-03",endDate:"2026-04-07",total:10,memberType:"1month",payment:""}]},
  {id:7,gender:"F",name:"김현지(2호)/트레이너",adminNickname:"2호/트레이너",adminNote:"트레이너. 저녁반",phone4:"2486",firstDate:"2026-03-16",memberType:"3month",isNew:true,total:30,used:1,startDate:"2026-03-12",endDate:"2026-06-12",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-03-12",endDate:"2026-06-12",total:30,memberType:"3month",payment:""}]},
  {id:8,gender:"F",name:"김현지(3호)/새벽",adminNickname:"3호/새벽반",adminNote:"새벽 고정",phone4:"0046",firstDate:"2026-03-13",memberType:"3month",isNew:true,total:30,used:4,startDate:"2026-03-09",endDate:"2026-06-09",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-03-09",endDate:"2026-06-09",total:30,memberType:"3month",payment:""}]},
  {id:9,gender:"F",name:"박소연",adminNickname:"",adminNote:"",phone4:"3217",firstDate:"2025-12-15",memberType:"3month",isNew:false,total:24,used:10,startDate:"2026-02-04",endDate:"2026-05-07",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:2,startDate:"2026-02-04",endDate:"2026-05-07",total:24,memberType:"3month",payment:""}]},
  {id:10,gender:"F",name:"박주희",adminNickname:"",adminNote:"",phone4:"4872",firstDate:"2025-11-25",memberType:"1month",isNew:false,total:8,used:6,startDate:"2026-03-03",endDate:"2026-04-07",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-11-01",endDate:"2025-11-30",total:0,memberType:"1month",payment:""},{id:2,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:3,startDate:"2026-03-03",endDate:"2026-04-07",total:8,memberType:"1month",payment:""}]},
  {id:11,gender:"F",name:"손하윤",adminNickname:"",adminNote:"새벽반 (권민경 대리예약)",phone4:"4929",firstDate:"2026-03-04",memberType:"1month",isNew:true,total:8,used:6,startDate:"2026-03-04",endDate:"2026-04-08",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-03-04",endDate:"2026-04-08",total:8,memberType:"1month",payment:""}]},
  {id:12,gender:"M",name:"유태균",adminNickname:"",adminNote:"",phone4:"7360",firstDate:"2026-01-02",memberType:"3month",isNew:false,total:18,used:15,startDate:"2026-01-02",endDate:"2026-04-04",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-01-02",endDate:"2026-04-04",total:18,memberType:"3month",payment:""}]},
  {id:13,gender:"F",name:"조진선",adminNickname:"",adminNote:"",phone4:"3508",firstDate:"2025-09-08",memberType:"3month",isNew:false,total:30,used:23,startDate:"2026-01-02",endDate:"2026-04-04",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-09-01",endDate:"2025-09-30",total:0,memberType:"1month",payment:""},{id:2,startDate:"2025-10-01",endDate:"2025-10-31",total:0,memberType:"1month",payment:""},{id:3,startDate:"2025-11-01",endDate:"2025-11-30",total:0,memberType:"1month",payment:""},{id:4,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:5,startDate:"2026-01-02",endDate:"2026-04-04",total:30,memberType:"3month",payment:""}]},
  {id:14,gender:"M",name:"윤상섭",adminNickname:"",adminNote:"새벽 고정",phone4:"6937",firstDate:"2025-12-23",memberType:"3month",isNew:false,total:36,used:19,startDate:"2026-01-27",endDate:"2026-04-29",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:2,startDate:"2026-01-27",endDate:"2026-04-29",total:36,memberType:"3month",payment:""}]},
  {id:15,gender:"F",name:"정순주",adminNickname:"",adminNote:"",phone4:"4348",firstDate:"2025-12-23",memberType:"3month",isNew:false,total:24,used:16,startDate:"2026-01-26",endDate:"2026-04-28",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:2,startDate:"2026-01-26",endDate:"2026-04-28",total:24,memberType:"3month",payment:""}]},
  {id:16,gender:"F",name:"이민지",adminNickname:"",adminNote:"네이버예약",phone4:"9034",firstDate:"2026-02-20",memberType:"1month",isNew:true,total:8,used:8,startDate:"2026-02-20",endDate:"2026-03-27",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-02-20",endDate:"2026-03-27",total:8,memberType:"1month",payment:""}]},
  {id:17,gender:"F",name:"이예인",adminNickname:"",adminNote:"네이버예약",phone4:"9791",firstDate:"2025-12-10",memberType:"3month",isNew:false,total:24,used:11,startDate:"2026-01-06",endDate:"2026-04-08",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:2,startDate:"2026-01-06",endDate:"2026-04-08",total:24,memberType:"3month",payment:""}]},
  {id:18,gender:"F",name:"임선영",adminNickname:"",adminNote:"",phone4:"5863",firstDate:"2025-11-25",memberType:"3month",isNew:false,total:24,used:15,startDate:"2026-01-05",endDate:"2026-04-07",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-11-01",endDate:"2025-11-30",total:0,memberType:"1month",payment:""},{id:2,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:3,startDate:"2026-01-05",endDate:"2026-04-07",total:24,memberType:"3month",payment:""}]},
  {id:19,gender:"F",name:"장미순",adminNickname:"",adminNote:"",phone4:"7853",firstDate:"2026-02-02",memberType:"3month",isNew:true,total:18,used:3,startDate:"2026-03-02",endDate:"2026-06-02",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-03-02",endDate:"2026-06-02",total:18,memberType:"3month",payment:""}]},
  {id:20,gender:"F",name:"조성경",adminNickname:"",adminNote:"새벽반",phone4:"8966",firstDate:"2025-12-12",memberType:"3month",isNew:false,total:24,used:5,startDate:"2026-03-04",endDate:"2026-06-04",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:2,startDate:"2026-03-04",endDate:"2026-06-04",total:24,memberType:"3month",payment:""}]},
  {id:21,gender:"F",name:"조수현",adminNickname:"",adminNote:"",phone4:"1193",firstDate:"2025-11-13",memberType:"3month",isNew:false,total:30,used:19,startDate:"2026-01-05",endDate:"2026-04-07",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-11-01",endDate:"2025-11-30",total:0,memberType:"1month",payment:""},{id:2,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:3,startDate:"2026-01-05",endDate:"2026-04-07",total:30,memberType:"3month",payment:""}]},
  {id:22,gender:"M",name:"최내권",adminNickname:"",adminNote:"",phone4:"4597",firstDate:"2026-02-25",memberType:"3month",isNew:true,total:24,used:4,startDate:"2026-02-25",endDate:"2026-05-28",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-02-25",endDate:"2026-05-28",total:24,memberType:"3month",payment:""}]},
  {id:23,gender:"F",name:"최지영",adminNickname:"",adminNote:"거의 매일 출석",phone4:"0484",firstDate:"2025-12-29",memberType:"3month",isNew:false,total:36,used:30,startDate:"2026-01-21",endDate:"2026-04-23",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:2,startDate:"2026-01-21",endDate:"2026-04-23",total:36,memberType:"3month",payment:""}]},
  {id:24,gender:"F",name:"하지원",adminNickname:"",adminNote:"",phone4:"1023",firstDate:"2026-03-02",memberType:"3month",isNew:true,total:12,used:1,startDate:"2026-03-02",endDate:"2026-06-02",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-03-02",endDate:"2026-06-02",total:12,memberType:"3month",payment:""}]},
  {id:25,gender:"F",name:"한소리",adminNickname:"",adminNote:"개근 가까움",phone4:"9488",firstDate:"2025-05-22",memberType:"3month",isNew:false,total:24,used:22,startDate:"2026-01-05",endDate:"2026-04-07",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-05-01",endDate:"2025-05-31",total:0,memberType:"1month",payment:""},{id:2,startDate:"2025-06-01",endDate:"2025-06-30",total:0,memberType:"1month",payment:""},{id:3,startDate:"2025-07-01",endDate:"2025-07-31",total:0,memberType:"1month",payment:""},{id:4,startDate:"2025-08-01",endDate:"2025-08-31",total:0,memberType:"1month",payment:""},{id:5,startDate:"2025-09-01",endDate:"2025-09-30",total:0,memberType:"1month",payment:""},{id:6,startDate:"2025-10-01",endDate:"2025-10-31",total:0,memberType:"1month",payment:""},{id:7,startDate:"2025-11-01",endDate:"2025-11-30",total:0,memberType:"1month",payment:""},{id:8,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:9,startDate:"2026-01-05",endDate:"2026-04-07",total:24,memberType:"3month",payment:""}]},
  {id:26,gender:"F",name:"박차오름",adminNickname:"",adminNote:"",phone4:"1303",firstDate:"2025-12-10",memberType:"3month",isNew:false,total:24,used:2,startDate:"2026-03-17",endDate:"2026-06-17",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2025-12-01",endDate:"2025-12-31",total:0,memberType:"1month",payment:""},{id:2,startDate:"2026-03-17",endDate:"2026-06-17",total:24,memberType:"3month",payment:""}]},
  {id:27,gender:"F",name:"김수민",adminNickname:"",adminNote:"",phone4:"7524",firstDate:"2026-03-20",memberType:"3month",isNew:true,total:24,used:0,startDate:"2026-01-26",endDate:"2026-04-28",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-01-26",endDate:"2026-04-28",total:24,memberType:"3month",payment:""}]},
  {id:28,gender:"F",name:"박수지",adminNickname:"",adminNote:"",phone4:"9587",firstDate:"2026-02-04",memberType:"1month",isNew:true,total:4,used:1,startDate:"2026-03-19",endDate:"2026-04-23",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-03-19",endDate:"2026-04-23",total:4,memberType:"1month",payment:""}]},
  {id:29,gender:"F",name:"윤자경",adminNickname:"",adminNote:"",phone4:"9176",firstDate:"2026-03-20",memberType:"1month",isNew:true,total:15,used:1,startDate:"2026-03-20",endDate:"2026-04-24",extensionDays:0,holdingDays:0,holding:null,renewalHistory:[{id:1,startDate:"2026-03-20",endDate:"2026-04-24",total:15,memberType:"1month",payment:""}]}
];

// bookings: 예약 + 출석 통합
// status: "reserved"|"attended"|"cancelled"
// session deducted on reservation; restored only on cancellation
const mkB=(id,date,mid,slot,status="attended",walkIn=false,cancelNote="",cancelledBy="")=>({id,date,memberId:mid,timeSlot:slot,walkIn,status,cancelNote,cancelledBy});
const INIT_BOOKINGS=[
  {id:1,date:"2025-05-22",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:2,date:"2025-05-28",memberId:25,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:3,date:"2025-06-03",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:4,date:"2025-06-04",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:5,date:"2025-06-09",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:6,date:"2025-06-16",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:7,date:"2025-06-16",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:8,date:"2025-06-16",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:9,date:"2025-06-20",memberId:25,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:10,date:"2025-06-23",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:11,date:"2025-06-23",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:12,date:"2025-06-24",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:13,date:"2025-06-24",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:14,date:"2025-06-25",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:15,date:"2025-07-02",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:16,date:"2025-07-07",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:17,date:"2025-07-07",memberId:5,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:18,date:"2025-07-09",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:19,date:"2025-07-09",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:20,date:"2025-07-09",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:21,date:"2025-07-11",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:22,date:"2025-07-14",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:23,date:"2025-07-14",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:24,date:"2025-07-16",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:25,date:"2025-07-16",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:26,date:"2025-07-16",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:27,date:"2025-07-18",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:28,date:"2025-07-21",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:29,date:"2025-07-22",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:30,date:"2025-07-25",memberId:6,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:31,date:"2025-07-25",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:32,date:"2025-07-28",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:33,date:"2025-07-29",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:34,date:"2025-07-29",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:35,date:"2025-08-01",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:36,date:"2025-08-01",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:37,date:"2025-08-04",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:38,date:"2025-08-04",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:39,date:"2025-08-04",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:40,date:"2025-08-05",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:41,date:"2025-08-06",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:42,date:"2025-08-06",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:43,date:"2025-08-08",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:44,date:"2025-08-11",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:45,date:"2025-08-11",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:46,date:"2025-08-14",memberId:5,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:47,date:"2025-08-15",memberId:6,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:48,date:"2025-08-15",memberId:25,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:49,date:"2025-08-18",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:50,date:"2025-08-18",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:51,date:"2025-08-20",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:52,date:"2025-08-21",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:53,date:"2025-08-22",memberId:6,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:54,date:"2025-08-25",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:55,date:"2025-08-25",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:56,date:"2025-08-25",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:57,date:"2025-08-26",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:58,date:"2025-08-28",memberId:6,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:59,date:"2025-09-03",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:60,date:"2025-09-03",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:61,date:"2025-09-04",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:62,date:"2025-09-05",memberId:5,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:63,date:"2025-09-08",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:64,date:"2025-09-08",memberId:13,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:65,date:"2025-09-08",memberId:5,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:66,date:"2025-09-09",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:67,date:"2025-09-10",memberId:13,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:68,date:"2025-09-10",memberId:5,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:69,date:"2025-09-15",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:70,date:"2025-09-15",memberId:6,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:71,date:"2025-09-15",memberId:13,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:72,date:"2025-09-17",memberId:13,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:73,date:"2025-09-19",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:74,date:"2025-09-22",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:75,date:"2025-09-22",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:76,date:"2025-09-22",memberId:13,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:77,date:"2025-09-24",memberId:13,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:78,date:"2025-09-25",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:79,date:"2025-09-26",memberId:13,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:80,date:"2025-09-29",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:81,date:"2025-10-01",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:82,date:"2025-10-09",memberId:25,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:83,date:"2025-10-10",memberId:13,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:84,date:"2025-10-10",memberId:25,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:85,date:"2025-10-13",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:86,date:"2025-10-13",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:87,date:"2025-10-16",memberId:13,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:88,date:"2025-10-17",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:89,date:"2025-10-20",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:90,date:"2025-10-20",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:91,date:"2025-10-22",memberId:13,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:92,date:"2025-10-24",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:93,date:"2025-10-27",memberId:13,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:94,date:"2025-10-27",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:95,date:"2025-10-28",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:96,date:"2025-10-29",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:97,date:"2025-10-30",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:98,date:"2025-10-31",memberId:25,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:99,date:"2025-10-31",memberId:13,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:100,date:"2025-11-03",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:101,date:"2025-11-04",memberId:13,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:102,date:"2025-11-06",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:103,date:"2025-11-10",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:104,date:"2025-11-10",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:105,date:"2025-11-12",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:106,date:"2025-11-13",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:107,date:"2025-11-13",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:108,date:"2025-11-14",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:109,date:"2025-11-18",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:110,date:"2025-11-18",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:111,date:"2025-11-19",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:112,date:"2025-11-19",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:113,date:"2025-11-20",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:114,date:"2025-11-21",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:115,date:"2025-11-24",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:116,date:"2025-11-24",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:117,date:"2025-11-25",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:118,date:"2025-11-25",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:119,date:"2025-11-25",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:120,date:"2025-11-25",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:121,date:"2025-11-27",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:122,date:"2025-11-27",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:123,date:"2025-12-02",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:124,date:"2025-12-02",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:125,date:"2025-12-04",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:126,date:"2025-12-04",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:127,date:"2025-12-04",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:128,date:"2025-12-04",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:129,date:"2025-12-05",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:130,date:"2025-12-05",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:131,date:"2025-12-08",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:132,date:"2025-12-08",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:133,date:"2025-12-09",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:134,date:"2025-12-09",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:135,date:"2025-12-09",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:136,date:"2025-12-09",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:137,date:"2025-12-10",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:138,date:"2025-12-10",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:139,date:"2025-12-10",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:140,date:"2025-12-10",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:141,date:"2025-12-11",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:142,date:"2025-12-11",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:143,date:"2025-12-11",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:144,date:"2025-12-11",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:145,date:"2025-12-12",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:146,date:"2025-12-12",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:147,date:"2025-12-12",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:148,date:"2025-12-15",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:149,date:"2025-12-15",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:150,date:"2025-12-15",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:151,date:"2025-12-15",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:152,date:"2025-12-15",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:153,date:"2025-12-16",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:154,date:"2025-12-16",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:155,date:"2025-12-17",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:156,date:"2025-12-17",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:157,date:"2025-12-17",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:158,date:"2025-12-17",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:159,date:"2025-12-18",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:160,date:"2025-12-18",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:161,date:"2025-12-18",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:162,date:"2025-12-18",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:163,date:"2025-12-19",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:164,date:"2025-12-22",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:165,date:"2025-12-22",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:166,date:"2025-12-22",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:167,date:"2025-12-22",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:168,date:"2025-12-22",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:169,date:"2025-12-22",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:170,date:"2025-12-22",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:171,date:"2025-12-22",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:172,date:"2025-12-23",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:173,date:"2025-12-23",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:174,date:"2025-12-23",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:175,date:"2025-12-23",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:176,date:"2025-12-23",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:177,date:"2025-12-23",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:178,date:"2025-12-24",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:179,date:"2025-12-24",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:180,date:"2025-12-24",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:181,date:"2025-12-24",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:182,date:"2025-12-26",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:183,date:"2025-12-26",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:184,date:"2025-12-26",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:185,date:"2025-12-26",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:186,date:"2025-12-26",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:187,date:"2025-12-29",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:188,date:"2025-12-29",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:189,date:"2025-12-29",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:190,date:"2025-12-29",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:191,date:"2025-12-29",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:192,date:"2025-12-29",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:193,date:"2025-12-30",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:194,date:"2025-12-30",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:195,date:"2025-12-30",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:196,date:"2025-12-30",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:197,date:"2025-12-30",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:198,date:"2026-01-02",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:199,date:"2026-01-02",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:200,date:"2026-01-02",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:201,date:"2026-01-02",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:202,date:"2026-01-02",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:203,date:"2026-01-02",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:204,date:"2026-01-02",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:205,date:"2026-01-02",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:206,date:"2026-01-02",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:207,date:"2026-01-05",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:208,date:"2026-01-05",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:209,date:"2026-01-05",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:210,date:"2026-01-05",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:211,date:"2026-01-05",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:212,date:"2026-01-05",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:213,date:"2026-01-05",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:214,date:"2026-01-06",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:215,date:"2026-01-06",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:216,date:"2026-01-06",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:217,date:"2026-01-06",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:218,date:"2026-01-06",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:219,date:"2026-01-07",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:220,date:"2026-01-07",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:221,date:"2026-01-07",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:222,date:"2026-01-07",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:223,date:"2026-01-07",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:224,date:"2026-01-07",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:225,date:"2026-01-08",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:226,date:"2026-01-08",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:227,date:"2026-01-08",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:228,date:"2026-01-08",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:229,date:"2026-01-09",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:230,date:"2026-01-09",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:231,date:"2026-01-09",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:232,date:"2026-01-09",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:233,date:"2026-01-09",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:234,date:"2026-01-09",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:235,date:"2026-01-09",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:236,date:"2026-01-09",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:237,date:"2026-01-09",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:238,date:"2026-01-12",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:239,date:"2026-01-12",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:240,date:"2026-01-12",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:241,date:"2026-01-12",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:242,date:"2026-01-12",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:243,date:"2026-01-12",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:244,date:"2026-01-12",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:245,date:"2026-01-13",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:246,date:"2026-01-13",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:247,date:"2026-01-13",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:248,date:"2026-01-13",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:249,date:"2026-01-14",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:250,date:"2026-01-14",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:251,date:"2026-01-14",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:252,date:"2026-01-14",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:253,date:"2026-01-14",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:254,date:"2026-01-14",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:255,date:"2026-01-14",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:256,date:"2026-01-14",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:257,date:"2026-01-15",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:258,date:"2026-01-15",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:259,date:"2026-01-15",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:260,date:"2026-01-15",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:261,date:"2026-01-15",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:262,date:"2026-01-15",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:263,date:"2026-01-16",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:264,date:"2026-01-16",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:265,date:"2026-01-16",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:266,date:"2026-01-16",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:267,date:"2026-01-16",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:268,date:"2026-01-19",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:269,date:"2026-01-19",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:270,date:"2026-01-19",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:271,date:"2026-01-19",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:272,date:"2026-01-19",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:273,date:"2026-01-19",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:274,date:"2026-01-19",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:275,date:"2026-01-19",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:276,date:"2026-01-20",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:277,date:"2026-01-20",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:278,date:"2026-01-20",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:279,date:"2026-01-21",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:280,date:"2026-01-21",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:281,date:"2026-01-21",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:282,date:"2026-01-21",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:283,date:"2026-01-21",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:284,date:"2026-01-22",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:285,date:"2026-01-22",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:286,date:"2026-01-22",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:287,date:"2026-01-22",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:288,date:"2026-01-22",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:289,date:"2026-01-22",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:290,date:"2026-01-23",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:291,date:"2026-01-23",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:292,date:"2026-01-23",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:293,date:"2026-01-23",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:294,date:"2026-01-23",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:295,date:"2026-01-23",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:296,date:"2026-01-26",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:297,date:"2026-01-26",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:298,date:"2026-01-26",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:299,date:"2026-01-26",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:300,date:"2026-01-26",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:301,date:"2026-01-26",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:302,date:"2026-01-26",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:303,date:"2026-01-26",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:304,date:"2026-01-26",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:305,date:"2026-01-26",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:306,date:"2026-01-26",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:307,date:"2026-01-26",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:308,date:"2026-01-27",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:309,date:"2026-01-27",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:310,date:"2026-01-27",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:311,date:"2026-01-27",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:312,date:"2026-01-27",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:313,date:"2026-01-27",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:314,date:"2026-01-27",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:315,date:"2026-01-28",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:316,date:"2026-01-28",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:317,date:"2026-01-28",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:318,date:"2026-01-28",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:319,date:"2026-01-28",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:320,date:"2026-01-28",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:321,date:"2026-01-28",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:322,date:"2026-01-28",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:323,date:"2026-01-28",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:324,date:"2026-01-28",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:325,date:"2026-01-28",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:326,date:"2026-01-28",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:327,date:"2026-01-29",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:328,date:"2026-01-29",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:329,date:"2026-01-29",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:330,date:"2026-02-02",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:331,date:"2026-02-02",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:332,date:"2026-02-02",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:333,date:"2026-02-02",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:334,date:"2026-02-02",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:335,date:"2026-02-02",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:336,date:"2026-02-02",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:337,date:"2026-02-02",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:338,date:"2026-02-03",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:339,date:"2026-02-03",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:340,date:"2026-02-03",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:341,date:"2026-02-03",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:342,date:"2026-02-03",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:343,date:"2026-02-03",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:344,date:"2026-02-03",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:345,date:"2026-02-04",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:346,date:"2026-02-04",memberId:28,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:347,date:"2026-02-04",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:348,date:"2026-02-04",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:349,date:"2026-02-04",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:350,date:"2026-02-04",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:351,date:"2026-02-04",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:352,date:"2026-02-04",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:353,date:"2026-02-05",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:354,date:"2026-02-05",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:355,date:"2026-02-05",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:356,date:"2026-02-05",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:357,date:"2026-02-06",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:358,date:"2026-02-06",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:359,date:"2026-02-06",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:360,date:"2026-02-06",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:361,date:"2026-02-06",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:362,date:"2026-02-06",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:363,date:"2026-02-09",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:364,date:"2026-02-09",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:365,date:"2026-02-09",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:366,date:"2026-02-09",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:367,date:"2026-02-09",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:368,date:"2026-02-09",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:369,date:"2026-02-10",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:370,date:"2026-02-10",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:371,date:"2026-02-10",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:372,date:"2026-02-10",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:373,date:"2026-02-10",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:374,date:"2026-02-11",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:375,date:"2026-02-11",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:376,date:"2026-02-11",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:377,date:"2026-02-11",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:378,date:"2026-02-12",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:379,date:"2026-02-12",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:380,date:"2026-02-12",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:381,date:"2026-02-12",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:382,date:"2026-02-12",memberId:28,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:383,date:"2026-02-12",memberId:21,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:384,date:"2026-02-13",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:385,date:"2026-02-13",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:386,date:"2026-02-13",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:387,date:"2026-02-13",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:388,date:"2026-02-13",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:389,date:"2026-02-13",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:390,date:"2026-02-13",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:391,date:"2026-02-18",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:392,date:"2026-02-18",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:393,date:"2026-02-18",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:394,date:"2026-02-18",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:395,date:"2026-02-18",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:396,date:"2026-02-18",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:397,date:"2026-02-18",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:398,date:"2026-02-18",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:399,date:"2026-02-18",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:400,date:"2026-02-18",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:401,date:"2026-02-19",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:402,date:"2026-02-19",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:403,date:"2026-02-19",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:404,date:"2026-02-19",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:405,date:"2026-02-20",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:406,date:"2026-02-20",memberId:28,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:407,date:"2026-02-20",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:408,date:"2026-02-20",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:409,date:"2026-02-20",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:410,date:"2026-02-20",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:411,date:"2026-02-20",memberId:16,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:412,date:"2026-02-20",memberId:20,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:413,date:"2026-02-20",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:414,date:"2026-02-20",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:415,date:"2026-02-20",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:416,date:"2026-02-20",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:417,date:"2026-02-20",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:418,date:"2026-02-22",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:419,date:"2026-02-22",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:420,date:"2026-02-22",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:421,date:"2026-02-22",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:422,date:"2026-02-22",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:423,date:"2026-02-22",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:424,date:"2026-02-22",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:425,date:"2026-02-22",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:426,date:"2026-02-23",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:427,date:"2026-02-23",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:428,date:"2026-02-23",memberId:20,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:429,date:"2026-02-23",memberId:21,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:430,date:"2026-02-23",memberId:23,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:431,date:"2026-02-23",memberId:15,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:432,date:"2026-02-23",memberId:14,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:433,date:"2026-02-23",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:434,date:"2026-02-24",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:435,date:"2026-02-24",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:436,date:"2026-02-24",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:437,date:"2026-02-24",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:438,date:"2026-02-24",memberId:23,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:439,date:"2026-02-24",memberId:21,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:440,date:"2026-02-25",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:441,date:"2026-02-25",memberId:22,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:442,date:"2026-02-25",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:443,date:"2026-02-25",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:444,date:"2026-02-25",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:445,date:"2026-02-25",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:446,date:"2026-02-25",memberId:10,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:447,date:"2026-02-25",memberId:23,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:448,date:"2026-02-25",memberId:21,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:449,date:"2026-02-25",memberId:13,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:450,date:"2026-02-25",memberId:20,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:451,date:"2026-02-25",memberId:14,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:452,date:"2026-02-25",memberId:15,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:453,date:"2026-02-25",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:454,date:"2026-02-26",memberId:28,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:455,date:"2026-02-26",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:456,date:"2026-02-26",memberId:23,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:457,date:"2026-02-27",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:458,date:"2026-02-27",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:459,date:"2026-02-27",memberId:22,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:460,date:"2026-02-27",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:461,date:"2026-02-27",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:462,date:"2026-02-27",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:463,date:"2026-02-27",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:464,date:"2026-02-27",memberId:13,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:465,date:"2026-02-27",memberId:12,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:466,date:"2026-02-27",memberId:20,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:467,date:"2026-02-27",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:468,date:"2026-03-02",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:469,date:"2026-03-02",memberId:24,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:470,date:"2026-03-02",memberId:15,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:471,date:"2026-03-02",memberId:14,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:472,date:"2026-03-02",memberId:5,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:473,date:"2026-03-02",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:474,date:"2026-03-03",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:475,date:"2026-03-03",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:476,date:"2026-03-03",memberId:22,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:477,date:"2026-03-03",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:478,date:"2026-03-03",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:479,date:"2026-03-03",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:480,date:"2026-03-03",memberId:18,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:481,date:"2026-03-03",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:482,date:"2026-03-03",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:483,date:"2026-03-03",memberId:16,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:484,date:"2026-03-04",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:485,date:"2026-03-04",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:486,date:"2026-03-04",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:487,date:"2026-03-04",memberId:12,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:488,date:"2026-03-04",memberId:11,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:489,date:"2026-03-04",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:490,date:"2026-03-04",memberId:16,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:491,date:"2026-03-04",memberId:20,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:492,date:"2026-03-05",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:493,date:"2026-03-05",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:494,date:"2026-03-05",memberId:10,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:495,date:"2026-03-05",memberId:21,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:496,date:"2026-03-05",memberId:13,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:497,date:"2026-03-06",memberId:15,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:498,date:"2026-03-06",memberId:14,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:499,date:"2026-03-06",memberId:11,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:500,date:"2026-03-09",memberId:1,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:501,date:"2026-03-09",memberId:2,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:502,date:"2026-03-09",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:503,date:"2026-03-09",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:504,date:"2026-03-09",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:505,date:"2026-03-09",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:506,date:"2026-03-09",memberId:21,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:507,date:"2026-03-09",memberId:6,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:508,date:"2026-03-09",memberId:16,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:509,date:"2026-03-09",memberId:15,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:510,date:"2026-03-09",memberId:14,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:511,date:"2026-03-10",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:512,date:"2026-03-11",memberId:16,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:513,date:"2026-03-11",memberId:10,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:514,date:"2026-03-11",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:515,date:"2026-03-11",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:516,date:"2026-03-11",memberId:19,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:517,date:"2026-03-11",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:518,date:"2026-03-11",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:519,date:"2026-03-11",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:520,date:"2026-03-11",memberId:20,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:521,date:"2026-03-11",memberId:15,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:522,date:"2026-03-11",memberId:14,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:523,date:"2026-03-11",memberId:11,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:524,date:"2026-03-12",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:525,date:"2026-03-12",memberId:17,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:526,date:"2026-03-12",memberId:2,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:527,date:"2026-03-12",memberId:1,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:528,date:"2026-03-12",memberId:10,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:529,date:"2026-03-13",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:530,date:"2026-03-13",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:531,date:"2026-03-13",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:532,date:"2026-03-13",memberId:15,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:533,date:"2026-03-13",memberId:14,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:534,date:"2026-03-13",memberId:16,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:535,date:"2026-03-13",memberId:12,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:536,date:"2026-03-13",memberId:20,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:537,date:"2026-03-13",memberId:11,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:538,date:"2026-03-13",memberId:8,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:539,date:"2026-03-16",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:540,date:"2026-03-16",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:541,date:"2026-03-16",memberId:13,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:542,date:"2026-03-16",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:543,date:"2026-03-16",memberId:7,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:544,date:"2026-03-16",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:545,date:"2026-03-16",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:546,date:"2026-03-16",memberId:21,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:547,date:"2026-03-16",memberId:17,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:548,date:"2026-03-16",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:549,date:"2026-03-16",memberId:20,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:550,date:"2026-03-16",memberId:8,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:551,date:"2026-03-17",memberId:26,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:552,date:"2026-03-17",memberId:5,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:553,date:"2026-03-17",memberId:23,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:554,date:"2026-03-18",memberId:16,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:555,date:"2026-03-18",memberId:3,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:556,date:"2026-03-18",memberId:4,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:557,date:"2026-03-18",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:558,date:"2026-03-18",memberId:9,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:559,date:"2026-03-18",memberId:22,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:560,date:"2026-03-18",memberId:23,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:561,date:"2026-03-18",memberId:25,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:562,date:"2026-03-18",memberId:21,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:563,date:"2026-03-18",memberId:17,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:564,date:"2026-03-18",memberId:10,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:565,date:"2026-03-18",memberId:20,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:566,date:"2026-03-18",memberId:14,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:567,date:"2026-03-18",memberId:13,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:568,date:"2026-03-18",memberId:12,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:569,date:"2026-03-18",memberId:11,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:570,date:"2026-03-18",memberId:8,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:571,date:"2026-03-19",memberId:6,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:572,date:"2026-03-19",memberId:28,timeSlot:"evening",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:573,date:"2026-03-19",memberId:26,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:574,date:"2026-03-19",memberId:10,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:575,date:"2026-03-19",memberId:5,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:576,date:"2026-03-19",memberId:2,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:577,date:"2026-03-19",memberId:1,timeSlot:"lunch",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:578,date:"2026-03-20",memberId:11,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:579,date:"2026-03-20",memberId:8,timeSlot:"dawn",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:580,date:"2026-03-20",memberId:5,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:581,date:"2026-03-20",memberId:29,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""},
  {id:582,date:"2026-03-20",memberId:16,timeSlot:"morning",walkIn:false,status:"attended",cancelNote:"",cancelledBy:""}
];

const INIT_SPECIAL=[
  {id:1,date:"2026-03-01",label:"삼일절 특별수업",activeSlots:["morning","evening"],customTimes:{morning:"10:00",evening:"17:00"}},
];

// 휴강: {id, date, timeSlot(null=전체), reason}
const INIT_CLOSURES=[
  {id:1,date:"2026-03-28",timeSlot:null,reason:"3월 정기 휴강"},
  {id:2,date:"2026-03-25",timeSlot:"dawn",reason:"새벽 수업 강사 사정"},
];

// ─── CalendarPicker ──────────────────────────────────────────
function CalendarPicker({value,onChange,onClose}){
  const sel=parseLocal(value||TODAY_STR);
  const [vy,setVy]=useState(sel.getFullYear());
  const [vm,setVm]=useState(sel.getMonth());
  const fd=new Date(vy,vm,1).getDay(),dim=new Date(vy,vm+1,0).getDate();
  const cells=[...Array(fd).fill(null),...Array.from({length:dim},(_,i)=>i+1)];
  const isSel=day=>day&&new Date(vy,vm,day).toDateString()===sel.toDateString();
  const isTod=day=>day&&new Date(vy,vm,day).toDateString()===TODAY.toDateString();
  const pick=day=>{if(!day)return;const mm=String(vm+1).padStart(2,"0"),dd=String(day).padStart(2,"0");onChange(`${vy}-${mm}-${dd}`);onClose();};
  const pm=()=>{if(vm===0){setVy(y=>y-1);setVm(11);}else setVm(m=>m-1);};
  const nm=()=>{if(vm===11){setVy(y=>y+1);setVm(0);}else setVm(m=>m+1);};
  return(
    <div style={{position:"absolute",top:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",zIndex:200,background:"#fff",border:"1.5px solid #ddd",borderRadius:14,boxShadow:"0 8px 32px rgba(40,35,25,.18)",padding:14,minWidth:270,fontFamily:FONT}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <button onClick={pm} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#555",padding:"2px 10px"}}>‹</button>
        <span style={{fontWeight:700,fontSize:14,color:"#1e2e1e"}}>{vy}년 {vm+1}월</span>
        <button onClick={nm} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#555",padding:"2px 10px"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {DOW_KO.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:i===0?"#e05050":i===6?"#4a70d0":"#9a8e80"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((day,i)=>{const dow=day?new Date(vy,vm,day).getDay():null,sel2=isSel(day),tod=isTod(day);return(
          <div key={i} onClick={()=>pick(day)} style={{textAlign:"center",fontSize:13,padding:"6px 2px",borderRadius:8,cursor:day?"pointer":"default",background:sel2?"#4a6a4a":tod&&!sel2?"#eef5ee":"transparent",color:day?(sel2?"#fff":dow===0?"#e05050":dow===6?"#4a70d0":"#2e2e2e"):"transparent",fontWeight:sel2||tod?700:400}}>{day||""}</div>
        );})}
      </div>
    </div>
  );
}

// ─── Mini Attendance Calendar ─────────────────────────────────
// ─── 출석 달력 + 이력 통합 컴포넌트 ────────────────────────────
function MiniCalendar({memberId, bookings, member}){
  const now=new Date(TODAY);
  const [vy,setVy]=useState(now.getFullYear());
  const [vm,setVm]=useState(now.getMonth());
  const fd=new Date(vy,vm,1).getDay(),dim=new Date(vy,vm+1,0).getDate();
  const cells=[...Array(fd).fill(null),...Array.from({length:dim},(_,i)=>i+1)];
  const ymStr=`${vy}-${String(vm+1).padStart(2,'0')}`;

  // 이번 달 출석일 (Set)
  const attendedDays=new Set(
    bookings.filter(b=>{
      if(b.memberId!==memberId||b.status!=="attended")return false;
      const d=parseLocal(b.date);
      return d.getFullYear()===vy&&d.getMonth()===vm;
    }).map(b=>parseLocal(b.date).getDate())
  );
  const monthCount=attendedDays.size;

  // 이번 달 해당하는 갱신이력 찾기
  const renewalForMonth=member?.renewalHistory?.find(r=>
    r.startDate.slice(0,7)<=ymStr && r.endDate.slice(0,7)>=ymStr
  );
  const TYPE_LABEL={'1month':'1개월권','3month':'3개월권'};

  // 이번 달 출석 상세 목록
  const monthRecs=bookings
    .filter(b=>b.memberId===memberId&&b.status==="attended"&&b.date.startsWith(ymStr))
    .sort((a,b2)=>b2.date.localeCompare(a.date));

  const prevM=()=>{if(vm===0){setVy(y=>y-1);setVm(11);}else setVm(m=>m-1);};
  const nextM=()=>{if(vm===11){setVy(y=>y+1);setVm(0);}else setVm(m=>m+1);};

  return(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #e4e0d8",overflow:"hidden",marginBottom:14}}>
      {/* 헤더: 화살표 + 연월 + 출석수 */}
      <div style={{padding:"11px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #f0ece4"}}>
        <button onClick={prevM} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#7a6e60",padding:"0 6px",lineHeight:1}}>‹</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#1e2e1e"}}>{vy}년 {vm+1}월</div>
          {renewalForMonth&&(
            <div style={{fontSize:10,color:"#9a8e80",marginTop:2}}>
              {TYPE_LABEL[renewalForMonth.memberType]||''}
              {renewalForMonth.total>0&&` ${renewalForMonth.total}회`}
            </div>
          )}
        </div>
        <button onClick={nextM} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#7a6e60",padding:"0 6px",lineHeight:1}}>›</button>
      </div>

      {/* 달력 그리드 */}
      <div style={{padding:"10px 10px 8px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
          {DOW_KO.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:i===0?"#e05050":i===6?"#4a70d0":"#b0a090"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {cells.map((day,i)=>{
            const dow=day?new Date(vy,vm,day).getDay():null;
            const attended=day&&attendedDays.has(day);
            const isToday=day&&new Date(vy,vm,day).toDateString()===TODAY.toDateString();
            return(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 2px",borderRadius:8,background:isToday?"#f0f8f0":"transparent"}}>
                <span style={{fontSize:12,color:day?(attended?"#2e6e44":isToday?"#4a6a4a":dow===0?"#e05050":dow===6?"#4a70d0":"#c8c0b0"):"transparent",fontWeight:attended||isToday?700:400}}>{day||""}</span>
                {attended&&<span style={{width:6,height:6,borderRadius:"50%",background:"#5a9e6a",marginTop:1,display:"block"}}/>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 이번 달 출석 수 + 상세 */}
      <div style={{borderTop:"1px solid #f0ece4",padding:"10px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:monthRecs.length>0?8:0}}>
          <span style={{fontSize:12,color:"#9a8e80"}}>이번 달 출석</span>
          <span style={{fontSize:14,fontWeight:700,color:monthCount>0?"#2e6e44":"#b0a090"}}>{monthCount}회 🌿</span>
        </div>
        {monthRecs.map((b,i)=>{
          const sl=TIME_SLOTS.find(t=>t.key===b.timeSlot);
          return(
            <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderTop:i>0?"1px solid #f8f4ef":"none"}}>
              <span style={{fontSize:14,width:20,textAlign:"center"}}>{sl?.icon||"📍"}</span>
              <span style={{fontSize:12,color:"#3a4a3a",flex:1}}>{fmtWithDow(b.date)}</span>
              <span style={{fontSize:11,color:sl?.color,fontWeight:600}}>{sl?.label}</span>
            </div>
          );
        })}
        {monthRecs.length===0&&<div style={{fontSize:11,color:"#c8c0b0",textAlign:"center",padding:"2px 0"}}>이번 달 출석 없음</div>}
      </div>
    </div>
  );
}

// ─── Notice Board ─────────────────────────────────────────────
function NoticeBoard({notices}){
  const [expanded,setExpanded]=useState(null);
  const visible=notices.filter(n=>n.pinned).concat(notices.filter(n=>!n.pinned)).slice(0,3);
  if(!visible.length)return null;
  return(
    <div style={{marginBottom:16}}>
      {visible.map(n=>(
        <div key={n.id} style={{background:n.pinned?"#fffaeb":"#fff",border:`1px solid ${n.pinned?"#e8c44a":"#e4e0d8"}`,borderRadius:12,padding:"12px 14px",marginBottom:8,cursor:"pointer"}} onClick={()=>setExpanded(expanded===n.id?null:n.id)}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {n.pinned&&<span style={{fontSize:11,background:"#fef3c7",color:"#92610a",borderRadius:5,padding:"1px 6px",fontWeight:700,flexShrink:0}}>📌 공지</span>}
            <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e",flex:1}}>{n.title}</span>
            <span style={{fontSize:12,color:"#9a8e80",flexShrink:0}}>{expanded===n.id?"▴":"▾"}</span>
          </div>
          {expanded===n.id&&(
            <div style={{marginTop:8,borderTop:"1px solid #f0ece4",paddingTop:8}}>
              {n.content&&<div style={{fontSize:13,color:"#5a5a5a",lineHeight:1.7,marginBottom:n.imageUrl?10:0}}>{n.content}</div>}
              {n.imageUrl&&<img src={n.imageUrl} alt="공지 이미지" style={{width:"100%",borderRadius:8,maxHeight:320,objectFit:"contain",background:"#f7f4ef"}}/>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Member Reservation Page ──────────────────────────────────
// ─── 기간 바 / 홀딩 배너 (회원 뷰 전용) ──────────────────────
function PeriodBar({member}){
  const end=effEnd(member);
  const dl=calcDL(member);
  const dlColor=dl<0?"#c97474":dl<=7?"#9a5a10":"#2e5c3e";
  const dlBg=dl<0?"#fef5f5":dl<=7?"#fdf3e3":"#eef5ee";
  const dlLabel=dl<0?`${Math.abs(dl)}일 초과`:dl===0?"오늘 만료":`D-${dl}`;
  return(
    <div style={{padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fafaf7"}}>
      <div style={{fontSize:12,color:"#7a6e60"}}>
        <span style={{fontWeight:600}}>{fmt(member.startDate)}</span>
        <span style={{color:"#c8c0b0",margin:"0 6px"}}>→</span>
        <span style={{fontWeight:600,color:dl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(end)}</span>
      </div>
      <div style={{fontSize:13,fontWeight:700,color:dlColor,background:dlBg,borderRadius:8,padding:"4px 10px"}}>
        {dlLabel}
      </div>
    </div>
  );
}

function HoldBanner({member}){
  const elapsed=holdingElapsed(member.holding);
  return(
    <div style={{padding:"8px 16px",background:"#edf0f8",display:"flex",alignItems:"center",gap:8,fontSize:12}}>
      <span style={{fontSize:14}}>⏸️</span>
      <span style={{color:"#3d5494",fontWeight:600}}>홀딩 중</span>
      <span style={{color:"#6a7ab8"}}>{fmt(member.holding.startDate)} ~ {fmt(member.holding.endDate)}</span>
      <span style={{marginLeft:"auto",color:"#3d5494",fontWeight:700}}>+{elapsed}일 경과</span>
    </div>
  );
}

function MemberReservePage({member,bookings,setBookings,setMembers,specialSchedules,closures,notices,onBack}){
  const [tab,setTab]=useState("reserve"); // "reserve"|"history"
  const [selDate,setSelDate]=useState(TODAY_STR);
  const [showCal,setShowCal]=useState(false);
  const [confirmCancel,setConfirmCancel]=useState(null);

  const dow=parseLocal(selDate).getDay();
  const special=specialSchedules.find(s=>s.date===selDate);
  const isWeekend=dow===0||dow===6;
  const isSpecial=!!special;
  const isFuture=selDate>=TODAY_STR;
  const isToday=selDate===TODAY_STR;
  // 휴강 체크
  const dayClosure=closures.find(cl=>cl.date===selDate&&!cl.timeSlot);
  const getSlotClosure=k=>closures.find(cl=>cl.date===selDate&&cl.timeSlot===k);

  const getSlots=()=>{
    if(isSpecial)return TIME_SLOTS.filter(s=>special.activeSlots.includes(s.key)).map(s=>({...s,time:special.customTimes?.[s.key]||s.time}));
    if(isWeekend)return[];
    return TIME_SLOTS.filter(s=>SCHEDULE[dow]?.includes(s.key));
  };
  const slots=getSlots();

  // non-cancelled bookings for selected date
  const dayActive=bookings.filter(b=>b.date===selDate&&b.status!=="cancelled");
  const rem=member.total-member.used;

  function slotActiveCount(k){return dayActive.filter(b=>b.timeSlot===k).length;}
  function mySlot(k){return dayActive.find(b=>b.memberId===member.id&&b.timeSlot===k);}

  function reserve(slotKey){
    if(rem<=0||slotActiveCount(slotKey)>=SLOT_LIMIT||mySlot(slotKey)||getSlotClosure(slotKey)||dayClosure)return;
    const nid=Math.max(...bookings.map(b=>b.id),0)+1;
    setBookings(p=>[...p,{id:nid,date:selDate,memberId:member.id,timeSlot:slotKey,walkIn:false,status:"attended",cancelNote:"",cancelledBy:""}]);
    setMembers(p=>p.map(m=>m.id===member.id?{...m,used:m.used+1}:m));
  }

  function cancelBooking(bId){
    setBookings(p=>p.map(b=>b.id===bId?{...b,status:"cancelled",cancelledBy:"member"}:b));
    setMembers(p=>p.map(m=>m.id===member.id?{...m,used:Math.max(0,m.used-1)}:m));
    setConfirmCancel(null);
  }

  // my all bookings sorted newest first
  const myAll=bookings.filter(b=>b.memberId===member.id&&b.status!=="cancelled").sort((a,b)=>b.date.localeCompare(a.date));
  const myUpcoming=myAll.filter(b=>b.date>=TODAY_STR&&b.status==="reserved");
  const myHistory=myAll.filter(b=>b.status==="attended"||b.date<TODAY_STR);

  return(
    <div style={{padding:"16px 16px max(80px,calc(env(safe-area-inset-bottom)+60px))",maxWidth:480,margin:"0 auto"}}>
      {/* 공지사항 */}
      <NoticeBoard notices={notices}/>

      {/* 잔여 횟수 + 기간 카드 */}
      <div style={{background:"#fff",borderRadius:14,border:"1px solid #e4e0d8",marginBottom:14,overflow:"hidden"}}>
        {/* 잔여 횟수 */}
        <div style={{padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #f0ece4"}}>
          <div>
            <div style={{fontSize:11,color:"#9a8e80",marginBottom:3}}>남은 수업</div>
            <div style={{display:"flex",alignItems:"baseline",gap:4}}>
              <span style={{fontSize:32,fontWeight:700,color:rem===0?"#c97474":"#2e5c3e"}}>{rem}</span>
              <span style={{fontSize:14,color:"#9a8e80"}}>/ {member.total}회</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            {myUpcoming.length>0&&<><div style={{fontSize:11,color:"#9a8e80",marginBottom:3}}>예약 완료</div><div style={{fontSize:18,fontWeight:700,color:"#3d5494"}}>{myUpcoming.length}개</div></>}
          </div>
        </div>
        {/* 등록 기간 + D-day */}
        <PeriodBar member={member}/>
        {/* HOLD 중 표시 */}
        {member.holdingDays>0&&member.holding&&<HoldBanner member={member}/>}
      </div>

      {/* 탭 */}
      <div style={{display:"flex",gap:0,marginBottom:16,background:"#e8e4dc",borderRadius:10,padding:3}}>
        {[["reserve","🗓️ 수업 예약"],["history","📋 내 기록"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,border:"none",borderRadius:8,padding:"9px 0",fontSize:13,fontWeight:tab===k?700:400,background:tab===k?"#fff":"transparent",color:tab===k?"#1e2e1e":"#9a8e80",cursor:"pointer",fontFamily:FONT,boxShadow:tab===k?"0 1px 4px rgba(60,50,40,.1)":"none"}}>{l}</button>
        ))}
      </div>

      {/* ── 예약 탭 ── */}
      {tab==="reserve"&&(
        <div>
          {/* 날짜 선택 */}
          <div style={{position:"relative",marginBottom:14}}>
            <div onClick={()=>setShowCal(s=>!s)} style={{background:showCal?"#eef5ee":"#fff",border:`1.5px solid ${showCal?"#4a6a4a":"#ddd"}`,borderRadius:10,padding:"11px 14px",fontSize:14,fontWeight:700,color:"#1e2e1e",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span>{fmtWithDow(selDate)}</span>
                {selDate===TODAY_STR&&<span style={{fontSize:11,background:"#4a6a4a",color:"#fff",borderRadius:5,padding:"2px 7px",fontWeight:700}}>오늘</span>}
              </div>
              <span style={{fontSize:12,color:"#9a8e80"}}>▾</span>
            </div>
            {showCal&&(<><div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setShowCal(false)}/><CalendarPicker value={selDate} onChange={v=>{setSelDate(v);setShowCal(false);}} onClose={()=>setShowCal(false)}/></>)}
          </div>

          {/* 과거 날짜 안내 */}
          {!isFuture&&<div style={{textAlign:"center",padding:"20px 0",color:"#b0a090",fontSize:13}}>과거 날짜는 예약할 수 없어요.</div>}

          {/* 수업 없는 날 */}
          {isFuture&&!isSpecial&&isWeekend&&<div style={{textAlign:"center",padding:"28px 0",color:"#b0a090"}}><div style={{fontSize:32,marginBottom:8}}>🌿</div><div style={{fontSize:14}}>이 날은 수업이 없습니다.</div></div>}

          {/* 전체 휴강 안내 */}
          {isFuture&&dayClosure&&<div style={{background:"#fff3f0",border:"1px solid #f0b0a0",borderRadius:10,padding:"12px 14px",marginBottom:12,display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:20}}>🔕</span><div><div style={{fontSize:13,fontWeight:700,color:"#8e3030"}}>전체 휴강</div><div style={{fontSize:12,color:"#9a5a50",marginTop:2}}>{dayClosure.reason}</div></div></div>}

          {/* 슬롯 목록 */}
          {isFuture&&!dayClosure&&slots.map(slot=>{
            const slClosure=getSlotClosure(slot.key);
            const cnt=slotActiveCount(slot.key);
            const remaining=SLOT_LIMIT-cnt;
            const myB=mySlot(slot.key);
            const full=(remaining<=0&&!myB)||!!slClosure;
            return(
              <div key={slot.key} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${slClosure?"#f0b0a0":myB?"#4a6a4a":full?"#f0ece4":slot.color+"33"}`,marginBottom:10,overflow:"hidden"}}>
                <div style={{background:slClosure?"#fff3f0":slot.bg,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:20}}>{slot.icon}</span>
                    <div>
                      <div style={{fontSize:15,fontWeight:700,color:slClosure?"#8e3030":slot.color}}>{slot.label} <span style={{fontSize:13,opacity:.8}}>{slot.time}</span></div>
                      <div style={{fontSize:12,color:slClosure?"#9a5a50":remaining<=2&&!myB?"#c97474":slot.color}}>
                        {slClosure?`🔕 ${slClosure.reason}`:full?"마감":myB?`예약됨 · 잔여 ${remaining}석`:`잔여 ${remaining}석`}
                      </div>
                    </div>
                  </div>
                  {slClosure?(
                    <span style={{fontSize:12,background:"#f5eeee",color:"#8e3030",borderRadius:8,padding:"6px 12px",fontWeight:700}}>휴강</span>
                  ):myB?(
                    <button onClick={()=>setConfirmCancel(myB.id)} style={{background:"#f5eeee",color:"#c97474",border:"1px solid #e8a0a0",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>예약취소</button>
                  ):(
                    <button onClick={()=>reserve(slot.key)} disabled={full||rem<=0} style={{background:full||rem<=0?"#f0ece4":slot.color,color:full||rem<=0?"#b0a090":"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:700,cursor:full||rem<=0?"not-allowed":"pointer",fontFamily:FONT,opacity:full||rem<=0?0.7:1}}>
                      {rem<=0?"잔여없음":"예약하기"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 내 기록 탭 ── */}
      {tab==="history"&&(
        <div>
          {/* 총 출석 수 */}
          <div style={{background:"#fff",borderRadius:12,border:"1px solid #e4e0d8",padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:13,color:"#7a6e60"}}>총 출석 <span style={{fontSize:11,color:"#9a8e80"}}>({fmt(member.firstDate||member.startDate)} 이후)</span></span>
            <span style={{fontSize:18,fontWeight:700,color:"#2e6e44"}}>{myHistory.filter(b=>b.status==="attended").length}회</span>
          </div>

          {/* 출석 달력 (갱신이력 포함) */}
          <MiniCalendar memberId={member.id} bookings={bookings} member={member}/>

          {/* 예정 예약 */}
          {myUpcoming.length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1e2e1e",marginBottom:8}}>예약 완료 ({myUpcoming.length})</div>
              {myUpcoming.map(b=>{const sl=TIME_SLOTS.find(t=>t.key===b.timeSlot);return(
                <div key={b.id} style={{background:"#edf0f8",borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"#2a5abf"}}>{fmtWithDow(b.date)}</div>
                    <div style={{fontSize:12,color:"#5a6a9a",marginTop:2}}>{sl?.icon} {sl?.label} {sl?.time}</div>
                  </div>
                  <button onClick={()=>setConfirmCancel(b.id)} style={{background:"#f5eeee",color:"#c97474",border:"1px solid #e8a0a0",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>취소</button>
                </div>
              );})}
            </div>
          )}
        </div>
      )}

      {/* 예약 취소 확인 */}
      {confirmCancel&&(
        <div style={S.overlay} className="ovl" onClick={()=>setConfirmCancel(null)}>
          <div style={{...S.modal,maxWidth:300,textAlign:"center"}} className="mbox" onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:30,marginBottom:10}}>🌿</div>
            <div style={{...S.modalTitle,marginBottom:6}}>예약을 취소할까요?</div>
            <div style={{fontSize:13,color:"#9a8e80",marginBottom:20}}>취소하면 잔여 횟수가 복구됩니다.</div>
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setConfirmCancel(null)}>아니오</button>
              <button style={{...S.saveBtn,background:"#c97474"}} onClick={()=>cancelBooking(confirmCancel)}>취소하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Member View (wrapper) ────────────────────────────────────
function MemberView({member,bookings,setBookings,setMembers,specialSchedules,closures,notices,onLogout}){
  const m=member;
  const status=getStatus(m),sc=SC[status];
  const tc=TYPE_CFG[m.memberType]||TYPE_CFG["1month"];
  return(
    <div style={{minHeight:"100vh",background:"#f5f3ef",fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f5f3ef;font-family:${FONT};-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}button,input{font-family:${FONT};outline:none;-webkit-appearance:none;border-radius:0}.ovl{animation:fi .18s}.mbox{animation:su .22s ease}@keyframes fi{from{opacity:0}to{opacity:1}}@keyframes su{from{transform:translateY(18px);opacity:0}to{transform:translateY(0);opacity:1}}button:active{opacity:.7;transform:scale(.97)}`}</style>
      {/* 헤더 */}
      <div style={{background:"#fff",borderBottom:"1px solid #e8e4dc",padding:"max(14px,env(safe-area-inset-top)) 16px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>{GE[m.gender]}</span>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:15,fontWeight:700,color:"#1e2e1e"}}>{m.name}</span>
              {m.isNew&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
            </div>
            <div style={{display:"flex",gap:5,marginTop:3}}>
              <span style={{fontSize:10,borderRadius:10,padding:"1px 7px",background:tc.bg,color:tc.color,fontWeight:700}}>{tc.label}</span>
              <span style={{fontSize:10,borderRadius:10,padding:"1px 7px",background:sc.bg,color:sc.color,fontWeight:700}}>{sc.label}</span>
            </div>
          </div>
        </div>
        <button onClick={onLogout} style={{background:"#f0ece4",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,color:"#7a6e60",cursor:"pointer",fontFamily:FONT,fontWeight:600}}>로그아웃</button>
      </div>
      <MemberReservePage member={m} bookings={bookings} setBookings={setBookings} setMembers={setMembers} specialSchedules={specialSchedules} closures={closures} notices={notices} onBack={()=>{}}/>
    </div>
  );
}

// ─── Admin: Notice Manager ────────────────────────────────────
function NoticeManager({notices,setNotices,onClose}){
  const [form,setForm]=useState(null);
  const [editId,setEditId]=useState(null);
  function openAdd(){setEditId(null);setForm({title:"",content:"",pinned:false,imageUrl:""});}
  function openEdit(n){setEditId(n.id);setForm({title:n.title,content:n.content,pinned:n.pinned,imageUrl:n.imageUrl||""});}
  function save(){
    if(!form.title)return;
    if(editId){setNotices(p=>p.map(n=>n.id===editId?{...n,...form}:n));}
    else{const nid=Math.max(...notices.map(n=>n.id),0)+1;setNotices(p=>[...p,{id:nid,...form,createdAt:TODAY_STR}]);}
    setForm(null);
  }
  function handleImageUpload(e){
    const file=e.target.files[0];
    if(!file)return;
    if(file.size>3*1024*1024){alert("이미지는 3MB 이하로 올려주세요.");return;}
    const reader=new FileReader();
    reader.onload=ev=>setForm(f=>({...f,imageUrl:ev.target.result}));
    reader.readAsDataURL(file);
  }
  return(
    <div style={S.overlay} className="ovl" onClick={onClose}>
      <div style={{...S.modal,maxWidth:440,maxHeight:"85vh",display:"flex",flexDirection:"column"}} className="mbox" onClick={e=>e.stopPropagation()}>
        <div style={{...S.modalHead,justifyContent:"space-between"}}>
          <div style={S.modalHead}><span style={{fontSize:20}}>📢</span><span style={S.modalTitle}>공지사항 관리</span></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:"#9a8e80",cursor:"pointer"}}>×</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {!form&&(<>
            <button onClick={openAdd} style={{...S.saveBtn,width:"100%",marginBottom:12,textAlign:"center"}}>+ 새 공지 작성</button>
            {notices.length===0&&<div style={{textAlign:"center",color:"#b0a090",fontSize:13,padding:"20px 0"}}>공지사항이 없습니다.</div>}
            {notices.map(n=>(
              <div key={n.id} style={{background:n.pinned?"#fffaeb":"#f7f4ef",borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${n.pinned?"#e8c44a":"#e4e0d8"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  {n.pinned&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:5,padding:"1px 6px",fontWeight:700}}>📌 고정</span>}
                  <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e",flex:1}}>{n.title}</span>
                </div>
                <div style={{fontSize:12,color:"#7a6e60",marginBottom:8,lineHeight:1.5}}>{n.content}</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>openEdit(n)} style={{...S.editBtn,fontSize:11,padding:"4px 10px"}}>수정</button>
                  <button onClick={()=>setNotices(p=>p.filter(x=>x.id!==n.id))} style={{...S.delBtn,fontSize:11,padding:"4px 10px"}}>삭제</button>
                  <button onClick={()=>setNotices(p=>p.map(x=>x.id===n.id?{...x,pinned:!x.pinned}:x))} style={{fontSize:11,background:"#fdf3e3",color:"#9a5a10",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontFamily:FONT}}>{n.pinned?"고정해제":"고정"}</button>
                </div>
              </div>
            ))}
          </>)}
          {form&&(<>
            <div style={S.fg}><label style={S.lbl}>제목</label><input style={S.inp} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="공지 제목"/></div>
            <div style={S.fg}><label style={S.lbl}>내용</label><textarea style={{...S.inp,height:90,resize:"vertical"}} value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="공지 내용 (선택)"/></div>
            <div style={S.fg}>
              <label style={S.lbl}>이미지 첨부 (선택 · 시간표 등 · 최대 3MB)</label>
              <label style={{display:"block",border:"1.5px dashed #c8c0b0",borderRadius:9,padding:"12px",textAlign:"center",cursor:"pointer",background:"#fafaf7",color:"#9a8e80",fontSize:13}}>
                {form.imageUrl?"✓ 이미지 첨부됨":"📷 이미지 선택"}
                <input type="file" accept="image/*" style={{display:"none"}} onChange={handleImageUpload}/>
              </label>
              {form.imageUrl&&(
                <div style={{marginTop:8,position:"relative"}}>
                  <img src={form.imageUrl} alt="" style={{width:"100%",borderRadius:8,maxHeight:180,objectFit:"contain",background:"#f7f4ef"}}/>
                  <button onClick={()=>setForm(f=>({...f,imageUrl:""}))} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.5)",color:"#fff",border:"none",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
              )}
            </div>
            <div style={{...S.fg}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                <div onClick={()=>setForm(f=>({...f,pinned:!f.pinned}))} style={{width:38,height:20,borderRadius:10,background:form.pinned?"#4a6a4a":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
                  <div style={{position:"absolute",top:2,left:form.pinned?19:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </div>
                <span style={{color:"#4a4a4a"}}>상단 고정 (중요 공지)</span>
              </label>
            </div>
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setForm(null)}>취소</button>
              <button style={S.saveBtn} onClick={save}>저장</button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}

// ─── Admin: Force Cancel Modal ────────────────────────────────
function AdminCancelModal({booking,member,onClose,onConfirm}){
  const [note,setNote]=useState("");
  const sl=TIME_SLOTS.find(t=>t.key===booking.timeSlot);
  return(
    <div style={S.overlay} className="ovl" onClick={onClose}>
      <div style={{...S.modal,maxWidth:360}} className="mbox" onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span style={{fontSize:20}}>⚠️</span><div><div style={S.modalTitle}>예약 강제 취소</div><div style={{fontSize:12,color:"#9a8e80",marginTop:2}}>{member?.name}</div></div></div>
        <div style={{background:"#fdf3e3",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#8a5510",marginBottom:14}}>
          {fmtWithDow(booking.date)} {sl?.label} {sl?.time}<br/>취소 시 잔여 횟수가 복구됩니다.
        </div>
        <div style={S.fg}><label style={S.lbl}>취소 사유 (선택)</label>
          <textarea style={{...S.inp,height:80,resize:"none"}} value={note} onChange={e=>setNote(e.target.value)} placeholder="예: 노쇼 처리, 강사 사정 등"/>
        </div>
        <div style={S.modalBtns}>
          <button style={S.cancelBtn} onClick={onClose}>닫기</button>
          <button style={{...S.saveBtn,background:"#c97474"}} onClick={()=>onConfirm(note)}>강제 취소</button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin: Attendance Board ──────────────────────────────────
function AttendanceBoard({members,bookings,setBookings,setMembers,specialSchedules,setSpecialSchedules,closures,setClosures}){
  const [date,setDate]=useState(TODAY_STR);
  const [showCal,setShowCal]=useState(false);
  const [addModal,setAddModal]=useState(null);
  const [addForm,setAddForm]=useState({type:"member",memberId:"",onedayName:"",walkIn:false});
  const [convertModal,setConvertModal]=useState(null);
  const [showSpecialMgr,setShowSpecialMgr]=useState(false);
  const [newSp,setNewSp]=useState({date:TODAY_STR,label:"",activeSlots:["morning","evening"],customTimes:{dawn:"06:30",morning:"10:00",lunch:"11:50",evening:"17:00"}});
  const [cancelModal,setCancelModal]=useState(null);
  const [dragId,setDragId]=useState(null);
  const [dragOver,setDragOver]=useState(null);
  const [showClosureMgr,setShowClosureMgr]=useState(false);
  const [closureForm,setClosureForm]=useState({date:TODAY_STR,timeSlot:"",reason:""});

  const dow=parseLocal(date).getDay();
  const special=specialSchedules.find(s=>s.date===date);
  const isWeekend=dow===0||dow===6;
  const isSpecial=!!special;
  const dayClosure=closures.find(cl=>cl.date===date&&!cl.timeSlot);
  const getSlotClosure=k=>closures.find(cl=>cl.date===date&&cl.timeSlot===k);

  const getSlots=()=>{
    if(isSpecial)return TIME_SLOTS.filter(s=>special.activeSlots.includes(s.key)).map(s=>({...s,time:special.customTimes?.[s.key]||s.time}));
    if(isWeekend)return[];
    return TIME_SLOTS.filter(s=>SCHEDULE[dow]?.includes(s.key));
  };
  const slots=getSlots();
  const dayActive=bookings.filter(b=>b.date===date&&b.status!=="cancelled");

  function adminCancel(id,note){
    const b=bookings.find(bk=>bk.id===id);
    if(!b)return;
    setBookings(p=>p.map(bk=>bk.id===id?{...bk,status:"cancelled",cancelledBy:"admin",cancelNote:note}:bk));
    if(b.memberId) setMembers(p=>p.map(m=>m.id===b.memberId?{...m,used:Math.max(0,m.used-1)}:m));
    setCancelModal(null);
  }
  function addRecord(){
    const nid=Math.max(...bookings.map(b=>b.id),0)+1;
    if(addForm.type==="oneday"){
      if(!addForm.onedayName.trim())return;
      setBookings(p=>[...p,{id:nid,date,memberId:null,onedayName:addForm.onedayName.trim(),timeSlot:addModal,walkIn:true,status:"attended",cancelNote:"",cancelledBy:""}]);
    } else {
      if(!addForm.memberId)return;
      setBookings(p=>[...p,{id:nid,date,memberId:+addForm.memberId,timeSlot:addModal,walkIn:addForm.walkIn,status:"attended",cancelNote:"",cancelledBy:""}]);
      setMembers(p=>p.map(m=>m.id===+addForm.memberId?{...m,used:m.used+1}:m));
    }
    setAddModal(null);setAddForm({type:"member",memberId:"",onedayName:"",walkIn:false});
  }

  // drag & drop
  function onDragStart(e,id){setDragId(id);e.dataTransfer.effectAllowed="move";}
  function onDragEnd(){setDragId(null);setDragOver(null);}
  function onDropSlot(e,slotKey){
    e.preventDefault();
    if(!dragId)return;
    const rec=bookings.find(b=>b.id===dragId);
    if(!rec||rec.timeSlot===slotKey)return;
    const alreadyIn=dayActive.filter(b=>b.timeSlot===slotKey&&b.memberId).map(b=>b.memberId);
    if(rec.memberId&&alreadyIn.includes(rec.memberId))return;
    setBookings(p=>p.map(b=>b.id===dragId?{...b,timeSlot:slotKey}:b));
    setDragOver(null);setDragId(null);
  }

  const slotMids=k=>dayActive.filter(b=>b.timeSlot===k&&b.memberId).map(b=>b.memberId);
  const avail=k=>members.filter(m=>!slotMids(k).includes(m.id)&&getStatus(m)!=="off").sort((a,b)=>a.name.localeCompare(b.name,"ko"));

  function addSpecial(){if(!newSp.label||!newSp.date)return;const nid=Math.max(...specialSchedules.map(s=>s.id),0)+1;setSpecialSchedules(p=>[...p.filter(s=>s.date!==newSp.date),{...newSp,id:nid}]);setShowSpecialMgr(false);}
  const toggleSp=sl=>setNewSp(f=>({...f,activeSlots:f.activeSlots.includes(sl)?f.activeSlots.filter(s=>s!==sl):[...f.activeSlots,sl]}));

  const totalDay=dayActive.length;
  const attendedDay=dayActive.filter(b=>b.status==="attended").length;


  return(
    <div>
      {/* 날짜 네비 */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
          <button style={{...S.navBtn,padding:"10px 14px",fontSize:16,minWidth:44,flexShrink:0}} onClick={()=>setDate(d=>addDays(d,-1))}>←</button>
          <div style={{flex:1,position:"relative"}}>
            <div onClick={()=>setShowCal(s=>!s)} style={{background:showCal?"#eef5ee":"#fff",border:`1.5px solid ${showCal?"#4a6a4a":"#ddd"}`,borderRadius:10,padding:"10px 12px",fontSize:14,fontWeight:700,color:"#1e2e1e",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              {fmtWithDow(date)}
              {isSpecial&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:5,padding:"1px 6px",fontWeight:700}}>{special.label}</span>}
              <span style={{fontSize:12,color:"#9a8e80"}}>▾</span>
            </div>
            {showCal&&(<><div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setShowCal(false)}/><CalendarPicker value={date} onChange={v=>{setDate(v);setShowCal(false);}} onClose={()=>setShowCal(false)}/></>)}
          </div>
          <button style={{...S.navBtn,padding:"10px 14px",fontSize:16,minWidth:44,flexShrink:0}} onClick={()=>setDate(d=>addDays(d,1))}>→</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <button style={{...S.navBtn,fontSize:12,padding:"7px 11px",color:"#5a7a5a",fontWeight:600}} onClick={()=>setDate(TODAY_STR)}>오늘</button>
          {slots.length>0&&<>
            <div style={{background:"#eaf4ea",color:"#2e6e44",borderRadius:8,padding:"5px 10px",fontSize:12,fontWeight:700}}>출석 {attendedDay}</div>
            {dayActive.filter(b=>b.status==="reserved").length>0&&<div style={{background:"#e8f0fc",color:"#2a5abf",borderRadius:8,padding:"5px 10px",fontSize:12,fontWeight:700}}>예약 {dayActive.filter(b=>b.status==="reserved").length}</div>}
          </>}
          <button style={{...S.navBtn,fontSize:11,padding:"6px 10px",color:"#8a5510",background:isSpecial?"#fdf3e3":"#fff"}} onClick={()=>{setNewSp(f=>({...f,date}));setShowSpecialMgr(true);}}>
            {isSpecial?"✏️ 특별수업":"🗓️ 특별수업"}
          </button>
          <button style={{...S.navBtn,fontSize:11,padding:"6px 10px",color:"#8e3030",background:dayClosure?"#fdf3e3":"#fff"}} onClick={()=>{setClosureForm({date,timeSlot:"",reason:""});setShowClosureMgr(true);}}>
            🔕 휴강설정
          </button>
        </div>
      </div>

      {!isSpecial&&isWeekend&&<div style={{textAlign:"center",padding:"50px 0",color:"#b0a090"}}><div style={{fontSize:36,marginBottom:10}}>🌿</div><div style={{fontSize:14,fontWeight:700}}>{DOW_KO[dow]}요일은 수업이 없습니다</div><button onClick={()=>{setNewSp(f=>({...f,date}));setShowSpecialMgr(true);}} style={{marginTop:14,...S.navBtn,fontSize:12,color:"#8a5510"}}>🗓️ 특별수업 추가</button></div>}
      {dayClosure&&<div style={{background:"#fdf3e3",border:"1px solid #e8a44a",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8,fontSize:13}}><span style={{fontSize:18}}>🔕</span><div><b>전체 휴강</b> — {dayClosure.reason}</div><button onClick={()=>{const nc=closures.filter(cl=>cl.id!==dayClosure.id);setClosures(nc);setMembers(prev=>prev.map(m=>m.memberType==="3month"?{...m,endDate:calc3MonthEnd(m.startDate,nc)}:m));}} style={{marginLeft:"auto",background:"none",border:"none",color:"#c97474",cursor:"pointer",fontSize:12,fontFamily:FONT}}>삭제</button></div>}

      {/* 슬롯 */}
      {slots.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
          {slots.map(slot=>{
            const recs=dayActive.filter(b=>b.timeSlot===slot.key);
            const isDT=dragOver===slot.key;
            const slotCl=getSlotClosure(slot.key);
            return(
              <div key={slot.key}
                onDragOver={e=>{e.preventDefault();setDragOver(slot.key);}}
                onDrop={e=>onDropSlot(e,slot.key)}
                onDragLeave={()=>setDragOver(null)}
                style={{background:"#fff",borderRadius:14,overflow:"hidden",border:`2px solid ${slotCl?"#f0b0a0":isDT?slot.color:"#e8e4dc"}`,boxShadow:isDT?`0 0 0 3px ${slot.bg}`:"0 2px 8px rgba(60,50,40,.06)"}}>
                {slotCl&&<div style={{background:"#fff3f0",padding:"6px 12px",fontSize:11,color:"#8e3030",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #f0d0c0"}}>
                  <span>🔕 {slotCl.reason}</span>
                  <button onClick={()=>setClosures(p=>p.filter(cl=>cl.id!==slotCl.id))} style={{background:"none",border:"none",color:"#c97474",cursor:"pointer",fontSize:11,fontFamily:FONT}}>삭제</button>
                </div>}
                <div style={{background:slot.bg,padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:17}}>{slot.icon}</span>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:slot.color}}>{slot.label}</div>
                      <div style={{fontSize:11,color:slot.color,opacity:.8}}>{slot.time}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <span style={{fontSize:12,color:slot.color,fontWeight:700}}>{recs.length}명</span>
                    <button onClick={()=>{setAddModal(slot.key);setAddForm({type:"member",memberId:"",onedayName:"",walkIn:false});}} style={{fontSize:11,background:slot.color,color:"#fff",border:"none",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontFamily:FONT,fontWeight:700,minHeight:26}}>+ 추가</button>
                  </div>
                </div>
                <div style={{minHeight:44}}>
                  {isDT&&recs.length===0&&<div style={{padding:12,textAlign:"center",fontSize:12,color:slot.color,fontWeight:600,background:slot.bg,opacity:.5}}>여기에 놓기</div>}
                  {!isDT&&recs.length===0&&<div style={{padding:12,textAlign:"center",fontSize:12,color:"#c8c0b0"}}>없음</div>}
                  {recs.map(rec=>{
                    const isOneday=!rec.memberId;
                    const mem=isOneday?null:members.find(m=>m.id===rec.memberId);
                    const usedSoFar=mem?usedAsOf(mem.id,date,bookings,members):0;
                    const rem=mem?mem.total-usedSoFar:null;
                    const bs=BOOKING_STATUS[rec.status]||BOOKING_STATUS.attended;
                    const isDragging=dragId===rec.id;
                    return(
                      <div key={rec.id} draggable onDragStart={e=>onDragStart(e,rec.id)} onDragEnd={onDragEnd}
                        style={{padding:"7px 10px",borderBottom:"1px solid #f8f4ef",display:"flex",alignItems:"center",gap:6,opacity:isDragging?0.4:1,background:"#fff",cursor:"grab",WebkitUserSelect:"none",userSelect:"none"}}>
                        <span style={{fontSize:11,color:"#c8c0b0",flexShrink:0}}>⠿</span>
                        <span style={{fontSize:17,flexShrink:0}}>{isOneday?"🙋":GE[mem.gender]}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:"#1e2e1e",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isOneday?rec.onedayName:mem.name}</div>
                          {isOneday
                            ?<span style={{fontSize:10,background:"#fdf3e3",color:"#9a6020",border:"1px solid #e8a44a",borderRadius:4,padding:"1px 5px",fontWeight:700}}>원데이</span>
                            :<div style={{fontSize:11,color:rem<=1?"#c97474":"#8a9e8a",fontWeight:600}}>{usedSoFar}/{mem.total}회</div>
                          }
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end",flexShrink:0}}>
                          <span style={{fontSize:10,background:bs.bg,color:bs.color,borderRadius:5,padding:"1px 6px",fontWeight:700}}>{bs.icon} {bs.label}</span>
                          {rec.walkIn&&!isOneday&&<span style={{fontSize:10,background:"#fdf3e3",color:"#9a6020",border:"1px solid #e8a44a",borderRadius:5,padding:"1px 5px",fontWeight:700}}>워크인</span>}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
                          {isOneday&&<button onClick={()=>setConvertModal(rec)} style={{fontSize:10,background:"#edf0f8",color:"#3d5494",border:"none",borderRadius:5,padding:"2px 6px",cursor:"pointer",fontFamily:FONT,fontWeight:700}}>회원전환</button>}
                          <button onClick={()=>setCancelModal(rec)} style={{fontSize:10,background:"#f5eeee",color:"#c97474",border:"none",borderRadius:5,padding:"2px 6px",cursor:"pointer",fontFamily:FONT}}>취소</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {slots.length>0&&<div style={{marginTop:10,display:"flex",gap:10,flexWrap:"wrap",fontSize:11,color:"#9a8e80"}}>
        <span>⠿ 드래그로 타임 이동</span>
        <span>· 🙋 원데이 참여자</span>
        <span>· 예약대기 → 출석✓ 버튼으로 확정</span>
        <span>· 취소 시 회차 복구됨</span>
      </div>}

      {/* 출석 추가 모달 — 회원 / 원데이 */}
      {addModal&&(
        <div style={S.overlay} className="ovl" onClick={()=>setAddModal(null)}>
          <div style={{...S.modal,maxWidth:350}} className="mbox" onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}><span style={{fontSize:22}}>{TIME_SLOTS.find(t=>t.key===addModal)?.icon}</span><div><div style={S.modalTitle}>{TIME_SLOTS.find(t=>t.key===addModal)?.label} 출석 추가</div><div style={{fontSize:12,color:"#9a8e80",marginTop:2}}>{fmtWithDow(date)}</div></div></div>
            {/* 회원 / 원데이 탭 */}
            <div style={{display:"flex",gap:0,marginBottom:14,background:"#e8e4dc",borderRadius:9,padding:3}}>
              {[["member","🧘🏻‍♀️ 회원"],["oneday","🙋 원데이"]].map(([v,l])=>(
                <button key={v} onClick={()=>setAddForm(f=>({...f,type:v}))} style={{flex:1,border:"none",borderRadius:7,padding:"8px 0",fontSize:13,fontWeight:addForm.type===v?700:400,background:addForm.type===v?"#fff":"transparent",color:addForm.type===v?"#1e2e1e":"#9a8e80",cursor:"pointer",fontFamily:FONT,boxShadow:addForm.type===v?"0 1px 4px rgba(60,50,40,.1)":"none"}}>{l}</button>
              ))}
            </div>
            {addForm.type==="member"&&(<>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {[[false,"🟦 네이버예약"],[true,"🚶 워크인"]].map(([v,l])=>(
                  <button key={String(v)} onClick={()=>setAddForm(f=>({...f,walkIn:v}))} style={{flex:1,padding:"8px 0",borderRadius:9,border:"1.5px solid",cursor:"pointer",fontSize:12,fontFamily:FONT,borderColor:addForm.walkIn===v?"#5a7a5a":"#e0d8cc",background:addForm.walkIn===v?"#eef5ee":"#faf8f5",color:addForm.walkIn===v?"#2e5c3e":"#9a8e80",fontWeight:addForm.walkIn===v?700:400}}>{l}</button>
                ))}
              </div>
              <div style={S.fg}><label style={S.lbl}>회원 선택</label>
                <select style={{...S.inp,appearance:"auto"}} value={addForm.memberId} onChange={e=>setAddForm(f=>({...f,memberId:e.target.value}))}>
                  <option value="">-- 회원을 선택하세요 --</option>
                  {avail(addModal).map(m=><option key={m.id} value={m.id}>{m.gender==="F"?"🧘🏻‍♀️":"🧘🏻‍♂️"} {m.name} (잔여 {m.total-m.used}회)</option>)}
                </select>
              </div>
              <div style={{background:"#f0f8f0",borderRadius:7,padding:"7px 10px",fontSize:11,color:"#3d6e45",marginBottom:12}}>✓ 즉시 출석 처리 + 회차 차감</div>
            </>)}
            {addForm.type==="oneday"&&(
              <div style={S.fg}>
                <label style={S.lbl}>참여자 이름</label>
                <input style={S.inp} value={addForm.onedayName} onChange={e=>setAddForm(f=>({...f,onedayName:e.target.value}))} placeholder="원데이 참여자 이름" autoFocus/>
                <div style={{background:"#fdf9f0",borderRadius:7,padding:"7px 10px",fontSize:11,color:"#8a6020",marginTop:7}}>💡 회차 차감 없이 출석 등록. 나중에 회원전환 가능해요.</div>
              </div>
            )}
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setAddModal(null)}>취소</button>
              <button style={{...S.saveBtn,opacity:(addForm.type==="member"?addForm.memberId:addForm.onedayName.trim())?1:0.5}}
                onClick={addRecord}
                disabled={!(addForm.type==="member"?addForm.memberId:addForm.onedayName.trim())}>
                출석 추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 원데이 → 회원 전환 안내 */}
      {convertModal&&(
        <div style={S.overlay} className="ovl" onClick={()=>setConvertModal(null)}>
          <div style={{...S.modal,maxWidth:300,textAlign:"center"}} className="mbox" onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:28,marginBottom:8}}>🌱</div>
            <div style={{...S.modalTitle,marginBottom:8}}>회원 전환</div>
            <div style={{fontSize:13,color:"#7a6e60",marginBottom:18,lineHeight:1.7}}><b>{convertModal.onedayName}</b>님을 정식 회원으로 추가하려면<br/>회원 관리 탭 → <b>+ 회원 추가</b>를<br/>눌러주세요 🙏</div>
            <button style={{...S.saveBtn,width:"100%"}} onClick={()=>setConvertModal(null)}>확인</button>
          </div>
        </div>
      )}

      {/* 휴강 설정 모달 */}
      {showClosureMgr&&(
        <div style={S.overlay} className="ovl" onClick={()=>setShowClosureMgr(false)}>
          <div style={{...S.modal,maxWidth:360}} className="mbox" onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}><span style={{fontSize:20}}>🔕</span><div style={S.modalTitle}>휴강 설정</div></div>
            <div style={{background:"#fff8f0",borderRadius:9,padding:"9px 12px",fontSize:12,color:"#8e3030",marginBottom:14}}>전체 휴강이면 타임을 비워두세요.<br/>특정 타임만 휴강이면 해당 타임을 선택하세요.</div>
            <div style={S.fg}><label style={S.lbl}>날짜</label><input style={S.inp} type="date" value={closureForm.date} onChange={e=>setClosureForm(f=>({...f,date:e.target.value}))}/></div>
            <div style={S.fg}><label style={S.lbl}>타임 (선택 — 비우면 전체 휴강)</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                <button onClick={()=>setClosureForm(f=>({...f,timeSlot:""}))} style={{padding:"8px 0",borderRadius:8,border:"1.5px solid",cursor:"pointer",fontSize:12,fontFamily:FONT,borderColor:closureForm.timeSlot===""?"#8e3030":"#e0d8cc",background:closureForm.timeSlot===""?"#fdf3e3":"#faf8f5",color:closureForm.timeSlot===""?"#8e3030":"#9a8e80",fontWeight:closureForm.timeSlot===""?700:400}}>전체</button>
                {TIME_SLOTS.map(sl=>(
                  <button key={sl.key} onClick={()=>setClosureForm(f=>({...f,timeSlot:sl.key}))} style={{padding:"8px 0",borderRadius:8,border:"1.5px solid",cursor:"pointer",fontSize:12,fontFamily:FONT,borderColor:closureForm.timeSlot===sl.key?"#8e3030":"#e0d8cc",background:closureForm.timeSlot===sl.key?"#fdf3e3":"#faf8f5",color:closureForm.timeSlot===sl.key?"#8e3030":"#9a8e80",fontWeight:closureForm.timeSlot===sl.key?700:400}}>{sl.icon} {sl.label}</button>
                ))}
              </div>
            </div>
            <div style={S.fg}><label style={S.lbl}>사유</label><input style={S.inp} value={closureForm.reason} onChange={e=>setClosureForm(f=>({...f,reason:e.target.value}))} placeholder="예: 강사 사정, 시설 공사 등"/></div>
            <div style={S.modalBtns}>
              <button style={S.cancelBtn} onClick={()=>setShowClosureMgr(false)}>취소</button>
              <button style={{...S.saveBtn,background:"#8e3030",opacity:closureForm.reason?1:0.5}} disabled={!closureForm.reason} onClick={()=>{const nid=Math.max(...closures.map(cl=>cl.id),0)+1;const newClosures=[...closures.filter(cl=>!(cl.date===closureForm.date&&cl.timeSlot===closureForm.timeSlot)),{id:nid,date:closureForm.date,timeSlot:closureForm.timeSlot||null,reason:closureForm.reason}];
setClosures(newClosures);
// 전체 휴강일 추가 시 3개월 회원 종료일 자동 연장
if(!closureForm.timeSlot){
  setMembers(prev=>prev.map(m=>m.memberType==="3month"?{...m,endDate:calc3MonthEnd(m.startDate,newClosures)}:m));
}
setShowClosureMgr(false);}}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 강제 취소 모달 */}
      {cancelModal&&<AdminCancelModal booking={cancelModal} member={members.find(m=>m.id===cancelModal.memberId)} onClose={()=>setCancelModal(null)} onConfirm={note=>adminCancel(cancelModal.id,note)}/>}

      {/* 특별 수업 모달 */}
      {showSpecialMgr&&(
        <div style={S.overlay} className="ovl" onClick={()=>setShowSpecialMgr(false)}>
          <div style={{...S.modal,maxWidth:400}} className="mbox" onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}><span style={{fontSize:20}}>🗓️</span><div style={S.modalTitle}>특별 수업 설정</div></div>
            <div style={{background:"#fdf9f0",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#8a6020",marginBottom:14}}>공휴일·특별 수업 날짜 설정. 기존 시간표를 덮어씁니다.</div>
            <div style={S.fg}><label style={S.lbl}>날짜</label><input style={S.inp} type="date" value={newSp.date} onChange={e=>setNewSp(f=>({...f,date:e.target.value}))}/></div>
            <div style={S.fg}><label style={S.lbl}>메모</label><input style={S.inp} value={newSp.label} onChange={e=>setNewSp(f=>({...f,label:e.target.value}))} placeholder="예: 어린이날 특별수업"/></div>
            <div style={S.fg}><label style={S.lbl}>운영 수업 (체크 + 시간 입력)</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {TIME_SLOTS.map(sl=>(
                  <div key={sl.key} style={{border:`1.5px solid ${newSp.activeSlots.includes(sl.key)?sl.color:"#e0d8cc"}`,borderRadius:10,padding:"10px",background:newSp.activeSlots.includes(sl.key)?sl.bg:"#faf8f5",cursor:"pointer"}} onClick={()=>toggleSp(sl.key)}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                      <span>{sl.icon}</span><span style={{fontWeight:700,color:sl.color,fontSize:13}}>{sl.label}</span>
                      {newSp.activeSlots.includes(sl.key)&&<span style={{marginLeft:"auto",color:sl.color}}>✓</span>}
                    </div>
                    {newSp.activeSlots.includes(sl.key)&&<input style={{...S.inp,padding:"5px 8px",fontSize:12}} value={newSp.customTimes[sl.key]||sl.time} onChange={e=>{e.stopPropagation();setNewSp(f=>({...f,customTimes:{...f.customTimes,[sl.key]:e.target.value}}))} } onClick={e=>e.stopPropagation()} placeholder="HH:MM"/>}
                  </div>
                ))}
              </div>
            </div>
            {special&&<button onClick={()=>{setSpecialSchedules(p=>p.filter(s=>s.date!==special.date));setShowSpecialMgr(false);}} style={{background:"#f5eeee",color:"#c97474",border:"none",borderRadius:8,padding:"8px 14px",fontSize:12,cursor:"pointer",fontFamily:FONT,fontWeight:700,marginBottom:12,width:"100%"}}>🗑️ 이 날 특별수업 삭제</button>}
            <div style={S.modalBtns}><button style={S.cancelBtn} onClick={()=>setShowSpecialMgr(false)}>취소</button><button style={{...S.saveBtn,opacity:newSp.label?1:0.5}} onClick={addSpecial} disabled={!newSp.label}>저장</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin modals (holding / renewal / extension / detail) ────
function HoldingModal({member,onClose,onSave}){
  const [start,setStart]=useState(TODAY_STR);
  const [end,setEnd]=useState(TODAY_STR);
  const [showCS,setShowCS]=useState(false);
  const [showCE,setShowCE]=useState(false);
  const wd=start&&end&&end>=start?countWorkdays(start,end):0;
  const hasH=!!member.holding;
  return(
    <div style={S.overlay} className="ovl" onClick={onClose}>
      <div style={{...S.modal,maxWidth:420}} className="mbox" onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>⏸️</span><div><div style={S.modalTitle}>홀딩 관리</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>
        {hasH&&<div style={{background:"#edf0f8",borderRadius:12,padding:"14px",marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"#3d5494",marginBottom:4}}>📌 홀딩 내역</div>
          <div style={{fontSize:13,color:"#4a4a4a"}}>{fmt(member.holding.startDate)} ~ {fmt(member.holding.endDate)} · {member.holding.workdays}일 연장</div>
          <button onClick={()=>onSave(null)} style={{marginTop:8,background:"#f5eeee",color:"#c97474",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:FONT,fontWeight:700}}>홀딩 취소</button>
        </div>}
        {!hasH&&<>
          <div style={{background:"#f5f9f5",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#5a7a5a",marginBottom:14,lineHeight:1.7}}>홀딩 기간의 <b>워킹데이</b>만큼 종료일이 자동 연장됩니다.</div>
          <div style={{display:"flex",gap:12,marginBottom:14}}>
            <div style={{flex:1}}><label style={S.lbl}>시작일</label><div style={{position:"relative"}}><input style={{...S.inp,cursor:"pointer"}} readOnly value={fmt(start)} onClick={()=>setShowCS(s=>!s)}/>{showCS&&<><div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setShowCS(false)}/><CalendarPicker value={start} onChange={v=>{setStart(v);setShowCS(false);}} onClose={()=>setShowCS(false)}/></>}</div></div>
            <div style={{flex:1}}><label style={S.lbl}>종료일</label><div style={{position:"relative"}}><input style={{...S.inp,cursor:"pointer"}} readOnly value={fmt(end)} onClick={()=>setShowCE(s=>!s)}/>{showCE&&<><div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setShowCE(false)}/><CalendarPicker value={end} onChange={v=>{setEnd(v);setShowCE(false);}} onClose={()=>setShowCE(false)}/></>}</div></div>
          </div>
          <div style={{background:"#f5f9f5",borderRadius:12,padding:"14px",marginBottom:4}}>
            {[["워킹데이",`${wd}일`,"#3d5494"],["연장 후 종료일",fmt(addDays(member.endDate,(member.extensionDays||0)+wd)),"#2e5c3e"]].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#7a6e60",marginBottom:6}}><span>{l}</span><span style={{color:c,fontWeight:700}}>{v}</span></div>
            ))}
          </div>
        </>}
        <div style={S.modalBtns}><button style={S.cancelBtn} onClick={onClose}>닫기</button>{!hasH&&<button style={S.saveBtn} onClick={()=>onSave({startDate:start,endDate:end,workdays:wd})} disabled={wd<=0}>적용</button>}</div>
      </div>
    </div>
  );
}

function RenewalModal({member,onClose,onSave}){
  const [form,setForm]=useState({startDate:TODAY_STR,endDate:"",total:member.memberType==="3month"?24:10,memberType:member.memberType,payment:""});
  return(
    <div style={S.overlay} className="ovl" onClick={onClose}>
      <div style={{...S.modal,maxWidth:420}} className="mbox" onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>🔄</span><div><div style={S.modalTitle}>회원권 갱신</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>
        <div style={S.fg}><label style={S.lbl}>갱신 타입</label>
          <div style={{display:"flex",gap:10}}>{[["1month","1개월"],["3month","3개월"]].map(([v,l])=>(<button key={v} onClick={()=>setForm(f=>({...f,memberType:v,total:v==="3month"?24:10}))} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:14,fontFamily:FONT,borderColor:form.memberType===v?"#4a7a5a":"#e0d8cc",background:form.memberType===v?"#eef5ee":"#faf8f5",color:form.memberType===v?"#2e5c3e":"#9a8e80",fontWeight:form.memberType===v?700:400}}>{l}</button>))}</div>
        </div>
        <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>시작일</label><input style={S.inp} type="date" value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}/></div><div style={{...S.fg,flex:1}}><label style={S.lbl}>종료일</label><input style={S.inp} type="date" value={form.endDate} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/></div></div>
        <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>총 회차</label><input style={S.inp} type="number" min="1" value={form.total} onChange={e=>setForm(f=>({...f,total:+e.target.value}))}/></div><div style={{...S.fg,flex:1}}><label style={S.lbl}>결제</label><input style={S.inp} value={form.payment} onChange={e=>setForm(f=>({...f,payment:e.target.value}))} placeholder="카드/현금"/></div></div>
        <div style={S.modalBtns}><button style={S.cancelBtn} onClick={onClose}>취소</button><button style={{...S.saveBtn,opacity:form.endDate?1:0.5}} disabled={!form.endDate} onClick={()=>onSave(form)}>갱신</button></div>
      </div>
    </div>
  );
}

function ExtensionModal({member,onClose,onSave}){
  const info=get3MonthsInfo(member.startDate);
  const [pm,setPm]=useState(info.map(m=>({...m,give:0})));
  const total=pm.reduce((s,m)=>s+m.give,0);
  const sg=(i,v)=>setPm(p=>p.map((m,idx)=>idx===i?{...m,give:Math.max(0,Math.min(m.surplus,v))}:m));
  return(
    <div style={S.overlay} className="ovl" onClick={onClose}>
      <div style={{...S.modal,maxWidth:440}} className="mbox" onClick={e=>e.stopPropagation()}>
        <div style={S.modalHead}><span>📅</span><div><div style={S.modalTitle}>5주 달 연장</div><div style={{fontSize:12,color:"#9a8e80"}}>{member.name}</div></div></div>
        {info.map((m,i)=>(<div key={m.monthName} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f0ece4"}}>
          <div><div style={{fontSize:14,fontWeight:700,color:"#2e3e2e",marginBottom:2}}>{m.monthName}</div><div style={{fontSize:12,color:"#9a8e80"}}>워킹데이 <b>{m.workingDays}일</b> {m.surplus>0&&<span style={{background:"#fdf3e3",color:"#9a5a10",borderRadius:5,padding:"1px 6px",fontSize:11,fontWeight:700}}>5주 +{m.surplus}일</span>}</div></div>
          {m.surplus>0?<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><span style={{fontSize:10,color:"#a09080"}}>연장일</span><div style={{display:"flex",alignItems:"center",gap:7}}><button style={S.stepper} onClick={()=>sg(i,pm[i].give-1)}>−</button><span style={{fontSize:15,fontWeight:700,color:"#2e5c3e",minWidth:24,textAlign:"center"}}>{pm[i].give}</span><button style={S.stepper} onClick={()=>sg(i,pm[i].give+1)}>+</button></div><span style={{fontSize:10,color:"#b0a090"}}>최대 {m.surplus}일</span></div>:<span style={{fontSize:12,color:"#c8c0b0"}}>해당없음</span>}
        </div>))}
        <div style={{background:"#f5f9f5",borderRadius:10,padding:"12px 14px",margin:"12px 0 4px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:14,fontWeight:700}}>적용 종료일</span>
          <span style={{fontSize:15,fontWeight:700,color:"#2e5c3e"}}>{fmt(addDays(member.endDate,total))}</span>
        </div>
        <div style={S.modalBtns}><button style={S.cancelBtn} onClick={onClose}>취소</button><button style={S.saveBtn} onClick={()=>onSave(total)}>저장</button></div>
      </div>
    </div>
  );
}

function AdminDetailModal({member,bookings,onClose,onRenew,onHolding,onExt}){
  const recs=bookings.filter(b=>b.memberId===member.id&&b.status!=="cancelled").sort((a,bk)=>bk.date.localeCompare(a.date));
  const attended=recs.filter(b=>b.status==="attended");
  const status=getStatus(member),sc=SC[status];
  const end=effEnd(member),dl=calcDL(member);
  const tc=TYPE_CFG[member.memberType]||TYPE_CFG["1month"];
  const byMonth={};recs.forEach(r=>{const m=r.date.slice(0,7);if(!byMonth[m])byMonth[m]=[];byMonth[m].push(r);});
  return(
    <div style={S.overlay} className="ovl" onClick={onClose}>
      <div style={{...S.modal,maxWidth:440,maxHeight:"92vh",display:"flex",flexDirection:"column"}} className="mbox" onClick={e=>e.stopPropagation()}>
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:12}}>
            {[["남은 회차",`${member.total-member.used}회`,member.total-member.used===0?"#c97474":"#2e6e44"],["총 출석",`${attended.length}/${member.total}`,"#3d5494"],["D-day",dl<0?`${Math.abs(dl)}일초과`:dl===0?"오늘":`D-${dl}`,dl<0?"#c97474":dl<=7?"#9a5a10":"#4a4a4a"]].map(([l,v,c])=>(
              <div key={l} style={{background:"#f7f4ef",borderRadius:9,padding:"9px",textAlign:"center"}}><div style={{fontSize:10,color:"#9a8e80",marginBottom:3}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div></div>
            ))}
          </div>
          <div style={{background:"#f7f4ef",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12}}>
            {[["최초등록",fmt(member.firstDate||member.startDate),"#7a6e60"],["현재시작",fmt(member.startDate),"#7a6e60"],["종료일(연장포함)",fmt(end),dl<0?"#c97474":dl<=7?"#9a5a10":"#3a4a3a"]].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#9a8e80"}}>{l}</span><span style={{color:c,fontWeight:700}}>{v}</span></div>
            ))}
          </div>
          {member.holding&&<div style={{background:"#edf0f8",borderRadius:9,padding:"10px 12px",marginBottom:12,fontSize:12}}><div style={{fontWeight:700,color:"#3d5494",marginBottom:3}}>⏸️ 홀딩</div><div style={{color:"#5a5a7a"}}>{fmt(member.holding.startDate)} ~ {fmt(member.holding.endDate)} ({member.holding.workdays}일)</div></div>}
          <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
            <button onClick={onRenew} style={{...S.saveBtn,fontSize:12,padding:"7px 12px"}}>🔄 갱신</button>
            {member.memberType==="3month"&&!member.holding&&<button onClick={onHolding} style={{background:"#edf0f8",color:"#3d5494",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>⏸️ 홀딩</button>}
            {member.memberType==="3month"&&<button onClick={onExt} style={{background:"#fdf3e3",color:"#9a5a10",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>📅 5주연장</button>}
          </div>
          {/* 갱신 이력 */}
          {member.renewalHistory?.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:700,color:"#3d4a3d",marginBottom:7}}>갱신 이력</div>
            {[...member.renewalHistory].reverse().map((r,i)=>(
              <div key={r.id} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 10px",background:i===0?"#f0f8f0":"#fafaf7",borderRadius:8,marginBottom:5,border:"1px solid #e8e4dc"}}>
                <span style={{fontSize:14}}>{i===0?"🟢":"⚪"}</span>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700}}>{fmt(r.startDate)} ~ {fmt(r.endDate)}</div><div style={{fontSize:11,color:"#9a8e80"}}>{TYPE_CFG[r.memberType]?.label} {r.total}회 {r.payment&&`· ${r.payment}`}</div></div>
                {i===0&&<span style={{fontSize:10,background:"#e0f2e9",color:"#1e6040",borderRadius:5,padding:"1px 6px",fontWeight:700}}>현재</span>}
              </div>
            ))}
          </div>}
          {/* 출석/예약 기록 */}
          <div style={{fontSize:12,fontWeight:700,color:"#3d4a3d",marginBottom:8}}>기록 ({recs.length}건)</div>
          {Object.entries(byMonth).map(([month,mrs])=>(
            <div key={month}>
              <div style={{fontSize:11,fontWeight:700,color:"#9a8e80",padding:"7px 0 4px",borderBottom:"1px solid #f0ece4",marginBottom:4}}>{month}</div>
              {mrs.map((r,i)=>{const sl=TIME_SLOTS.find(t=>t.key===r.timeSlot),bs=BOOKING_STATUS[r.status]||BOOKING_STATUS.attended;return(
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:i<mrs.length-1?"1px solid #f8f4ef":"none"}}>
                  <span style={{fontSize:13,width:20,textAlign:"center"}}>{sl?.icon||"📍"}</span>
                  <div style={{flex:1}}><span style={{fontSize:12,fontWeight:600,color:"#2e3e2e"}}>{fmtWithDow(r.date)}</span></div>
                  <span style={{fontSize:11,color:sl?.color,background:sl?.bg,borderRadius:5,padding:"1px 7px",fontWeight:600}}>{sl?.label}</span>
                  <span style={{fontSize:10,background:bs.bg,color:bs.color,borderRadius:5,padding:"1px 6px",fontWeight:700}}>{bs.icon} {bs.label}</span>
                </div>
              );})}
            </div>
          ))}
        </div>
        <div style={{padding:"10px 18px",borderTop:"1px solid #f0ece4"}}><button style={{...S.cancelBtn,width:"100%",textAlign:"center"}} onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}

// ─── Member Card ──────────────────────────────────────────────
function MemberCard({m,onEdit,onDel,onDetail}){
  const rem=m.total-m.used,pct=Math.round(m.used/m.total*100);
  const status=getStatus(m),sc=SC[status];
  const end=effEnd(m),dl=calcDL(m);
  const tc=TYPE_CFG[m.memberType]||TYPE_CFG["1month"];
  return(
    <div className="card" style={S.card}>
      {m.adminNickname&&<div style={{position:"absolute",top:10,right:10,background:"#2e3a2e",borderRadius:6,padding:"2px 7px",fontSize:10,color:"#a8e6a8",fontWeight:700}}>👀 {m.adminNickname}</div>}
      <div style={{...S.cardTop,paddingRight:m.adminNickname?76:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:20,lineHeight:1,flexShrink:0}}>{GE[m.gender]}</span>
          <span style={S.memberName}>{m.name}</span>
          {m.isNew&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:20,padding:"2px 7px",fontWeight:700}}>N</span>}
          <span style={{fontSize:11,borderRadius:20,padding:"2px 8px",background:tc.bg,color:tc.color,fontWeight:700}}>{tc.label}</span>
          {m.holding&&<span style={{fontSize:10,background:"#edf0f8",color:"#3d5494",borderRadius:20,padding:"2px 7px",fontWeight:700}}>⏸️홀딩</span>}
        </div>
        <span style={{...S.statusBadge,background:sc.bg,color:sc.color,flexShrink:0}}><span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,display:"inline-block",marginRight:4}}/>{sc.label}</span>
      </div>
      {m.adminNote&&<div style={{fontSize:11,color:"#9a5a10",background:"#fffaeb",borderRadius:6,padding:"3px 8px",marginBottom:7,border:"1px dashed #e8c44a"}}>📝 {m.adminNote}</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:7}}>
        <div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={{fontSize:30,fontWeight:700,color:rem===0?"#c97474":"#2e5c3e"}}>{rem}</span><span style={{fontSize:13,color:"#9a8e80"}}>/ {m.total} 회</span></div>
        <span style={{fontSize:12,color:"#b0a090"}}>사용 {m.used}회</span>
      </div>
      <div style={S.track}><div style={{...S.fill,width:`${pct}%`,background:status==="off"?"#c97474":status==="off"?"#e8a44a":status==="hold"?"#6a7fc8":"#5a9e6a"}}/></div>
      <div style={S.dateRow}>
        <div style={{display:"flex",flexDirection:"column",gap:1}}><span style={S.dateLabel}>등록일</span><span style={S.dateVal}>{fmt(m.startDate)}</span></div>
        <span style={{color:"#c8c0b0",fontSize:13,marginTop:9}}>→</span>
        <div style={{display:"flex",flexDirection:"column",gap:1}}>
          <span style={S.dateLabel}>종료일{(m.extensionDays||0)>0&&<span style={{color:"#2e6e44",marginLeft:3,fontSize:10,fontWeight:700}}>+{m.extensionDays}일</span>}{(m.holdingDays||0)>0&&<span style={{color:"#3d5494",marginLeft:3,fontSize:10,fontWeight:700}}>홀딩+{m.holdingDays}일</span>}</span>
          <span style={{...S.dateVal,color:dl<0?"#c97474":dl<=7?"#9a5a10":"#3a4a3a"}}>{fmt(end)}</span>
        </div>
        <div style={{...S.dChip,background:dl<0?"#f5eeee":dl<=7?"#fdf3e3":"#eef4ee",color:dl<0?"#c97474":dl<=7?"#9a5a10":"#2e6e44"}}>{dl<0?`${Math.abs(dl)}일 초과`:dl===0?"D-Day":`D-${dl}`}</div>
      </div>
      <div style={S.actions}>
        <button className="ibtn" style={S.detailBtn} onClick={onDetail}>상세보기</button>
        <button className="ibtn" style={S.editBtn} onClick={onEdit}>수정</button>
        <button className="ibtn" style={S.delBtn} onClick={onDel}>삭제</button>
      </div>
    </div>
  );
}

// ─── Admin App ────────────────────────────────────────────────
function AdminApp({members,setMembers,bookings,setBookings,notices,setNotices,specialSchedules,setSpecialSchedules,closures,setClosures,onLogout}){
  const [tab,setTab]=useState("attendance");
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [sortBy,setSortBy]=useState("name");
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({});
  const [detailM,setDetailM]=useState(null);
  const [renewT,setRenewT]=useState(null);
  const [holdT,setHoldT]=useState(null);
  const [extT,setExtT]=useState(null);
  const [delT,setDelT]=useState(null);
  const [showNotices,setShowNotices]=useState(false);

  const counts={all:members.length,on:members.filter(m=>getStatus(m)==="on").length,hold:members.filter(m=>getStatus(m)==="hold").length,off:members.filter(m=>getStatus(m)==="off").length};
  const filtered=useMemo(()=>members.filter(m=>{if(filter!=="all"&&getStatus(m)!==filter)return false;if(search&&!m.name.includes(search))return false;return true;}).sort((a,b)=>a.name.localeCompare(b.name,"ko")),[members,filter,search,sortBy]);

  function openAdd(){
    const autoEnd=endOfNextMonth(TODAY_STR);
    setEditId(null);
    setForm({gender:"F",name:"",adminNickname:"",adminNote:"",phone4:"",firstDate:TODAY_STR,memberType:"1month",isNew:true,total:6,used:0,startDate:TODAY_STR,endDate:autoEnd,extensionDays:0,holdingDays:0,holding:null,renewalHistory:[]});
    setShowForm(true);
  }
  function openEdit(m){setEditId(m.id);setForm({...m});setShowForm(true);}
  function saveForm(){
    if(!form.name||!form.startDate)return;
    // 3개월 회원 종료일이 비어있으면 closures 기반 자동계산
    let autoEnd = form.endDate;
    if(!autoEnd){
      autoEnd = form.memberType==="3month"
        ? calc3MonthEnd(form.startDate, closures)
        : endOfNextMonth(form.startDate);
    }
    const e={...form,endDate:autoEnd,total:+form.total,used:+form.used,extensionDays:+(form.extensionDays||0),holdingDays:+(form.holdingDays||0),isNew:!!form.isNew};
    if(editId)setMembers(p=>p.map(m=>m.id===editId?{...m,...e}:m));
    else{const id=Math.max(...members.map(m=>m.id),0)+1;setMembers(p=>[...p,{id,...e,renewalHistory:[{id:1,startDate:e.startDate,endDate:autoEnd,total:e.total,memberType:e.memberType,payment:e.payment||""}]}]);}
    setShowForm(false);
  }
  function applyRenewal(mid,rf){setMembers(p=>p.map(m=>{if(m.id!==mid)return m;return{...m,startDate:rf.startDate,endDate:rf.endDate,total:rf.total,used:0,memberType:rf.memberType,extensionDays:0,holdingDays:0,holding:null,renewalHistory:[...(m.renewalHistory||[]),{id:(m.renewalHistory?.length||0)+1,...rf}]};}));setRenewT(null);setDetailM(null);}
  function applyHolding(mid,hd){setMembers(p=>p.map(m=>{if(m.id!==mid)return m;if(!hd)return{...m,holding:null,holdingDays:0};return{...m,holding:hd,holdingDays:hd.workdays};}));setHoldT(null);setDetailM(null);}

  return(
    <div style={S.page} className="page-wrap">
      {/* 헤더 — 원복: 로고+날짜 왼쪽, 버튼 오른쪽 */}
      <div style={S.header}>
        <div>
          <div style={S.logoRow}>
            <span style={{fontSize:20,color:"#5a7a5a"}}>ॐ</span>
            <span style={S.studioName}>요가피안</span>
            <span style={{fontSize:11,background:"#2e3a2e",color:"#7a9a7a",borderRadius:5,padding:"2px 7px",fontWeight:700,marginLeft:4}}>관리자</span>
          </div>
          <div style={S.sub}>{fmtWithDow(TODAY_STR)}</div>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
          <button style={{...S.navBtn,fontSize:12,padding:"7px 11px",color:"#92610a",background:"#fef3c7",border:"1px solid #e8c44a",fontWeight:600}} onClick={()=>setShowNotices(true)}>📢 공지관리</button>
          <button onClick={onLogout} style={{background:"#f0ece4",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#7a6e60",cursor:"pointer",fontFamily:FONT}}>로그아웃</button>
        </div>
      </div>

      {/* 탭 + 회원추가 버튼 같은 줄 */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
        <div style={{display:"flex",gap:0,background:"#e8e4dc",borderRadius:11,padding:3}}>
          {[["attendance","📋 출석 보드"],["members","🧘🏻‍♀️ 회원 관리"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} className="tab-btn" style={{border:"none",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:tab===k?700:400,background:tab===k?"#fff":"transparent",color:tab===k?"#1e2e1e":"#9a8e80",boxShadow:tab===k?"0 1px 5px rgba(60,50,40,.12)":"none",cursor:"pointer",fontFamily:FONT,whiteSpace:"nowrap"}}>{l}</button>
          ))}
        </div>
        {tab==="members"&&<button style={{...S.addBtn,marginLeft:"auto"}} onClick={openAdd}>+ 회원 추가</button>}
      </div>

      {tab==="attendance"&&<AttendanceBoard members={members} bookings={bookings} setBookings={setBookings} setMembers={setMembers} specialSchedules={specialSchedules} setSpecialSchedules={setSpecialSchedules} closures={closures} setClosures={setClosures}/>}

      {tab==="members"&&(<>
        <div style={S.pillRow}>
          {[["all","전체"],["on","ON"],["hold","HOLD"],["off","OFF"]].map(([k,l])=>(
            <button key={k} className="pill" onClick={()=>setFilter(k)} style={{...S.pill,background:filter===k?"#4a6a4a":"#e8e4dc",color:filter===k?"#fff":"#7a6e60",fontWeight:filter===k?700:400}}>{l} <span style={{opacity:.75,fontSize:11}}>{counts[k]??0}</span></button>
          ))}
        </div>
        <div style={S.toolbar}>
          <div style={S.searchBox}><span style={{color:"#a09080",marginRight:5}}>🔍</span><input style={S.searchInput} placeholder="이름 검색" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </div>
        <div style={S.grid}>
          {filtered.length===0&&<div style={S.empty}>조건에 맞는 회원이 없습니다.</div>}
          {filtered.map(m=><MemberCard key={m.id} m={m} onDetail={()=>setDetailM(m)} onEdit={()=>openEdit(m)} onDel={()=>setDelT(m.id)}/>)}
        </div>
      </>)}

      {detailM&&<AdminDetailModal member={members.find(m=>m.id===detailM.id)||detailM} bookings={bookings} onClose={()=>setDetailM(null)} onRenew={()=>setRenewT(detailM.id)} onHolding={()=>setHoldT(detailM.id)} onExt={()=>setExtT(members.find(m=>m.id===detailM.id)||detailM)}/>}
      {renewT&&<RenewalModal member={members.find(m=>m.id===renewT)} onClose={()=>setRenewT(null)} onSave={rf=>applyRenewal(renewT,rf)}/>}
      {holdT&&<HoldingModal member={members.find(m=>m.id===holdT)} onClose={()=>setHoldT(null)} onSave={hd=>applyHolding(holdT,hd)}/>}
      {extT&&<ExtensionModal member={extT} onClose={()=>setExtT(null)} onSave={days=>{setMembers(p=>p.map(m=>m.id===extT.id?{...m,extensionDays:days}:m));setExtT(null);}}/>}
      {showNotices&&<NoticeManager notices={notices} setNotices={setNotices} onClose={()=>setShowNotices(false)}/>}

      {showForm&&(
        <div style={S.overlay} className="ovl" onClick={()=>setShowForm(false)}>
          <div style={{...S.modal,maxWidth:460,maxHeight:"90vh",overflowY:"auto"}} className="mbox" onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}><span>{editId?"✏️":"🌱"}</span><span style={S.modalTitle}>{editId?"회원 수정":"신규 회원 추가"}</span></div>
            <div style={S.fg}><label style={S.lbl}>성별</label><div style={{display:"flex",gap:10}}>{[["F","🧘🏻‍♀️","여성"],["M","🧘🏻‍♂️","남성"]].map(([v,emoji,label])=>(<button key={v} onClick={()=>setForm(f=>({...f,gender:v}))} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",borderColor:form.gender===v?"#4a7a5a":"#e0d8cc",background:form.gender===v?"#eef5ee":"#faf8f5",color:form.gender===v?"#2e5c3e":"#9a8e80",fontSize:22,display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:FONT}}><span>{emoji}</span><span style={{fontSize:11,fontWeight:600}}>{label}</span></button>))}</div></div>
            <div style={S.fg}><label style={S.lbl}>이름</label><input style={S.inp} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="회원 이름"/></div>
            <div style={S.fg}><label style={S.lbl}>전화번호 뒷 4자리</label><input style={S.inp} value={form.phone4||""} onChange={e=>setForm(f=>({...f,phone4:e.target.value.replace(/\D/g,"").slice(0,4)}))} placeholder="0000" maxLength={4} type="tel"/></div>
            <div style={{background:"#f5f9f5",borderRadius:10,padding:"12px 14px",marginBottom:12,border:"1px dashed #b8d8b8"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#3d6e45",marginBottom:7}}>👀 어드민 전용</div>
              <div style={S.fg}><label style={S.lbl}>별명 (구별용)</label><input style={S.inp} value={form.adminNickname||""} onChange={e=>setForm(f=>({...f,adminNickname:e.target.value}))} placeholder="예: 1호/저녁반"/></div>
              <div style={{marginBottom:0}}><label style={S.lbl}>메모</label><input style={S.inp} value={form.adminNote||""} onChange={e=>setForm(f=>({...f,adminNote:e.target.value}))} placeholder="특이사항"/></div>
            </div>
            <div style={{...S.fg}}><label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}><div onClick={()=>setForm(f=>({...f,isNew:!f.isNew}))} style={{width:36,height:20,borderRadius:10,background:form.isNew?"#4a6a4a":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}><div style={{position:"absolute",top:2,left:form.isNew?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></div><span style={{color:"#4a4a4a"}}>신규 회원 (N 표시)</span></label></div>
            <div style={S.fg}><label style={S.lbl}>회원권</label><div style={{display:"flex",gap:10}}>{[["1month","1개월"],["3month","3개월"]].map(([v,l])=>(<button key={v} onClick={()=>setForm(f=>{const newEnd=v==="1month"?endOfNextMonth(f.startDate||TODAY_STR):calc3MonthEnd(f.startDate||TODAY_STR);return{...f,memberType:v,total:v==="3month"?24:f.total,endDate:newEnd};})} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:14,fontFamily:FONT,borderColor:form.memberType===v?"#4a7a5a":"#e0d8cc",background:form.memberType===v?"#eef5ee":"#faf8f5",color:form.memberType===v?"#2e5c3e":"#9a8e80",fontWeight:form.memberType===v?700:400}}>{l}</button>))}</div></div>
            <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>총 회차</label><input style={S.inp} type="number" min="1" value={form.total||""} onChange={e=>setForm(f=>({...f,total:e.target.value}))}/></div><div style={{...S.fg,flex:1}}><label style={S.lbl}>사용 회차</label><input style={S.inp} type="number" min="0" value={form.used||0} onChange={e=>setForm(f=>({...f,used:e.target.value}))}/></div></div>
            <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>최초 등록일</label><input style={S.inp} type="date" value={form.firstDate||""} onChange={e=>setForm(f=>({...f,firstDate:e.target.value}))}/></div></div>
            <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>현재 시작일</label><input style={S.inp} type="date" value={form.startDate||""} onChange={e=>{const sd=e.target.value;setForm(f=>({...f,startDate:sd,endDate:f.memberType==="1month"?endOfNextMonth(sd):calc3MonthEnd(sd)}));}}/></div><div style={{...S.fg,flex:1}}><label style={S.lbl}>종료일 <span style={{fontSize:10,color:"#3d8a55",fontWeight:400}}>{form.memberType==="1month"?"(신규=익월말 자동)":"(3개월=60워크데이 자동)"}</span></label><input style={S.inp} type="date" value={form.endDate||""} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/></div></div>
            <div style={S.modalBtns}><button style={S.cancelBtn} onClick={()=>setShowForm(false)}>취소</button><button style={S.saveBtn} onClick={saveForm}>저장</button></div>
          </div>
        </div>
      )}

      {delT&&(
        <div style={S.overlay} className="ovl" onClick={()=>setDelT(null)}>
          <div style={{...S.modal,maxWidth:280,textAlign:"center"}} className="mbox" onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:28,marginBottom:8}}>🌿</div>
            <div style={{...S.modalTitle,marginBottom:6}}>회원을 삭제할까요?</div>
            <div style={{color:"#9a8e80",fontSize:13,marginBottom:18}}>삭제 후에는 복구가 어렵습니다.</div>
            <div style={S.modalBtns}><button style={S.cancelBtn} onClick={()=>setDelT(null)}>취소</button><button style={{...S.saveBtn,background:"#c97474"}} onClick={()=>{setMembers(p=>p.filter(m=>m.id!==delT));setDelT(null);}}>삭제</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Login Pages ──────────────────────────────────────────────
function MemberLoginPage({members,onLogin,onGoAdmin}){
  const [name,setName]=useState("");const [phone,setPhone]=useState("");const [error,setError]=useState("");const [shake,setShake]=useState(false);
  function tryLogin(){const found=members.find(m=>m.name.trim()===name.trim()&&m.phone4===phone.trim());if(found)onLogin(found);else{setError("이름 또는 전화번호 뒷자리가 일치하지 않습니다.");setShake(true);setTimeout(()=>setShake(false),500);}}
  return(
    <div style={{minHeight:"100vh",background:"#f5f3ef",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:FONT}}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}.shake{animation:shake .4s ease}*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f5f3ef;font-family:${FONT};-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}button,input{font-family:${FONT};outline:none;-webkit-appearance:none}.ovl{animation:fi .18s}.mbox{animation:su .22s ease}@keyframes fi{from{opacity:0}to{opacity:1}}@keyframes su{from{transform:translateY(18px);opacity:0}to{transform:translateY(0);opacity:1}}button:active{opacity:.72}`}</style>
      <div style={{textAlign:"center",marginBottom:28}}><div style={{fontSize:40,marginBottom:6}}>ॐ</div><div style={{fontSize:22,fontWeight:700,color:"#1e2e1e"}}>요가피안</div><div style={{fontSize:12,color:"#9a8e80",marginTop:4}}>회원 전용 페이지</div></div>
      <div className={shake?"shake":""} style={{background:"#fff",borderRadius:18,padding:"28px 24px",width:"100%",maxWidth:340,boxShadow:"0 4px 24px rgba(40,35,25,.1)"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#1e2e1e",marginBottom:18,textAlign:"center"}}>수업 예약 · 내 기록 확인</div>
        <div style={{marginBottom:12}}><label style={{display:"block",fontSize:12,fontWeight:700,color:"#9a8e80",marginBottom:5}}>이름</label><input style={{...S.inp,fontSize:15}} placeholder="이름을 입력하세요" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()}/></div>
        <div style={{marginBottom:8}}><label style={{display:"block",fontSize:12,fontWeight:700,color:"#9a8e80",marginBottom:5}}>전화번호 뒷 4자리</label><input style={{...S.inp,fontSize:16,letterSpacing:5,textAlign:"center"}} placeholder="0000" maxLength={4} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&tryLogin()} type="tel"/></div>
        {error&&<div style={{fontSize:12,color:"#c97474",marginBottom:10,padding:"7px 11px",background:"#fef5f5",borderRadius:8}}>{error}</div>}
        <button onClick={tryLogin} style={{width:"100%",background:"#4a6a4a",color:"#fff",border:"none",borderRadius:12,padding:13,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:FONT,marginTop:6}}>확인하기</button>
      </div>
      <button onClick={onGoAdmin} style={{marginTop:22,background:"none",border:"none",fontSize:12,color:"#c8c0b0",cursor:"pointer",fontFamily:FONT}}>관리자 페이지 →</button>
    </div>
  );
}

function AdminLoginPage({onLogin,onGoMember}){
  const [pin,setPin]=useState("");const [error,setError]=useState("");
  function tryLogin(){if(pin===ADMIN_PIN)onLogin();else{setError("PIN이 올바르지 않습니다.");setPin("");}}
  return(
    <div style={{minHeight:"100vh",background:"#2e3a2e",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}body{background:#2e3a2e;font-family:${FONT}}button,input{font-family:${FONT};outline:none;-webkit-appearance:none}button:active{opacity:.72}`}</style>
      <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:36,marginBottom:5}}>ॐ</div><div style={{fontSize:18,fontWeight:700,color:"#e8f0e8"}}>요가피안 관리자</div></div>
      <div style={{background:"rgba(255,255,255,.07)",borderRadius:18,padding:"24px 22px",width:"100%",maxWidth:280,border:"1px solid rgba(255,255,255,.1)"}}>
        <div style={{marginBottom:12}}><label style={{display:"block",fontSize:12,fontWeight:700,color:"#7a9a7a",marginBottom:5}}>관리자 PIN</label><input type="password" style={{width:"100%",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:10,padding:"12px 14px",fontSize:18,color:"#e8f0e8",background:"rgba(255,255,255,.05)",fontFamily:FONT,letterSpacing:6,textAlign:"center"}} placeholder="••••" maxLength={4} value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()}/></div>
        {error&&<div style={{fontSize:12,color:"#e8a0a0",marginBottom:10,textAlign:"center"}}>{error}</div>}
        <button onClick={tryLogin} style={{width:"100%",background:"#4a7a4a",color:"#fff",border:"none",borderRadius:12,padding:13,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>로그인</button>
      </div>
      <button onClick={onGoMember} style={{marginTop:18,background:"none",border:"none",fontSize:12,color:"#5a7a5a",cursor:"pointer",fontFamily:FONT}}>← 회원 페이지로</button>
    </div>
  );
}



// ── DB 변환 함수 ──────────────────────────────────────────────
const toDbMember=m=>({id:m.id,gender:m.gender,name:m.name,admin_nickname:m.adminNickname||"",admin_note:m.adminNote||"",phone4:m.phone4,first_date:m.firstDate,member_type:m.memberType,is_new:m.isNew,total:m.total,used:m.used,start_date:m.startDate,end_date:m.endDate,extension_days:m.extensionDays||0,holding_days:m.holdingDays||0,holding:m.holding||null,renewal_history:m.renewalHistory||[]});
const fromDbMember=r=>({id:r.id,gender:r.gender,name:r.name,adminNickname:r.admin_nickname||"",adminNote:r.admin_note||"",phone4:r.phone4,firstDate:r.first_date,memberType:r.member_type,isNew:r.is_new,total:r.total,used:r.used,startDate:r.start_date,endDate:r.end_date,extensionDays:r.extension_days||0,holdingDays:r.holding_days||0,holding:r.holding||null,renewalHistory:Array.isArray(r.renewal_history)?r.renewal_history:[]});
const toDbBooking=b=>({id:b.id,date:b.date,member_id:b.memberId||null,oneday_name:b.onedayName||"",time_slot:b.timeSlot,walk_in:b.walkIn||false,status:b.status,cancel_note:b.cancelNote||"",cancelled_by:b.cancelledBy||""});
const fromDbBooking=r=>({id:r.id,date:r.date,memberId:r.member_id,onedayName:r.oneday_name||"",timeSlot:r.time_slot,walkIn:r.walk_in||false,status:r.status,cancelNote:r.cancel_note||"",cancelledBy:r.cancelled_by||""});
const toDbNotice=n=>({id:n.id,title:n.title,content:n.content||"",pinned:n.pinned||false,image_url:n.imageUrl||"",created_at:n.createdAt});
const fromDbNotice=r=>({id:r.id,title:r.title,content:r.content||"",pinned:r.pinned||false,imageUrl:r.image_url||"",createdAt:r.created_at});
const toDbSpecial=s=>({id:s.id,date:s.date,label:s.label,active_slots:s.activeSlots||[],custom_times:s.customTimes||{}});
const fromDbSpecial=r=>({id:r.id,date:r.date,label:r.label,activeSlots:Array.isArray(r.active_slots)?r.active_slots:[],customTimes:r.custom_times||{}});
const toDbClosure=c=>({id:c.id,date:c.date,time_slot:c.timeSlot||null,reason:c.reason});
const fromDbClosure=r=>({id:r.id,date:r.date,timeSlot:r.time_slot||null,reason:r.reason});

export default function App(){
  const [screen,setScreen]=useState("memberLogin");
  const [loggedMember,setLoggedMember]=useState(null);
  const [members,setMembers]=useState(INIT_MEMBERS);
  const [bookings,setBookings]=useState(INIT_BOOKINGS);
  const [notices,setNotices]=useState(INIT_NOTICES);
  const [specialSchedules,setSpecialSchedules]=useState(INIT_SPECIAL);
  const [closures,setClosures]=useState(INIT_CLOSURES);
  const [dbReady,setDbReady]=useState(false);
  const [saving,setSaving]=useState(false);

  // DB 로드
  const loadFromDb = useCallback(async()=>{
    setSaving(true);
    try{
      const[mems,bkgs,nots,specs,cls]=await Promise.all([
        sbGet("members"),sbGet("bookings"),sbGet("notices"),
        sbGet("special_schedules"),sbGet("closures")
      ]);
      if(mems.length>0) setMembers(mems.map(fromDbMember));
      if(bkgs.length>0) setBookings(bkgs.map(fromDbBooking));
      if(nots.length>0) setNotices(nots.map(fromDbNotice));
      if(specs.length>0) setSpecialSchedules(specs.map(fromDbSpecial));
      if(cls.length>0) setClosures(cls.map(fromDbClosure));
      setDbReady(true);
    }catch(e){
      console.warn("DB 로드 실패:",e.message);
      setDbReady(false);
    }finally{setSaving(false);}
  },[]);

  useEffect(()=>{loadFromDb();},[loadFromDb]);

  // 초기 데이터 업로드 (DB 비어있을때)
  const seedDb = async()=>{
    setSaving(true);
    try{
      await sbUpsert("members",INIT_MEMBERS.map(toDbMember));
      const CHUNK=100,total=INIT_BOOKINGS.length;
      for(let i=0;i<total;i+=CHUNK) await sbUpsert("bookings",INIT_BOOKINGS.slice(i,i+CHUNK).map(toDbBooking));
      await sbUpsert("notices",INIT_NOTICES.map(toDbNotice));
      if(INIT_SPECIAL.length>0) await sbUpsert("special_schedules",INIT_SPECIAL.map(toDbSpecial));
      if(INIT_CLOSURES.length>0) await sbUpsert("closures",INIT_CLOSURES.map(toDbClosure));
      await loadFromDb();
      alert("✅ 초기 데이터 업로드 완료!");
    }catch(e){alert("❌ 오류: "+e.message);setSaving(false);}
  };

  // update 헬퍼 (UI 즉시 반영 + DB 저장)
  const updateMembers = useCallback((updater)=>{
    setMembers(prev=>{const next=typeof updater==="function"?updater(prev):updater;sbUpsert("members",next.map(toDbMember)).catch(console.warn);return next;});
  },[]);
  const updateBookings = useCallback((updater)=>{
    setBookings(prev=>{const next=typeof updater==="function"?updater(prev):updater;sbUpsert("bookings",next.map(toDbBooking)).catch(console.warn);return next;});
  },[]);
  const updateNotices = useCallback((updater)=>{
    setNotices(prev=>{const next=typeof updater==="function"?updater(prev):updater;sbUpsert("notices",next.map(toDbNotice)).catch(console.warn);return next;});
  },[]);
  const updateSpecials = useCallback((updater)=>{
    setSpecialSchedules(prev=>{const next=typeof updater==="function"?updater(prev):updater;sbUpsert("special_schedules",next.map(toDbSpecial)).catch(console.warn);return next;});
  },[]);
  const updateClosures = useCallback((updater)=>{
    setClosures(prev=>{const next=typeof updater==="function"?updater(prev):updater;sbUpsert("closures",next.map(toDbClosure)).catch(console.warn);return next;});
  },[]);

  // 저장 상태 뱃지
  const SaveBadge=()=>(
    <div style={{position:"fixed",bottom:16,right:16,zIndex:999,display:"flex",alignItems:"center",gap:5,
      background:saving?"#fdf3e3":"#eef5ee",border:`1px solid ${saving?"#e8c44a":"#a0d0a0"}`,
      borderRadius:20,padding:"5px 12px",fontSize:11,color:saving?"#9a5a10":"#2e6e44",fontFamily:FONT,
      boxShadow:"0 2px 8px rgba(0,0,0,.08)"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:saving?"#e8a44a":"#5a9e6a",display:"inline-block"}}/>
      {saving?"저장 중...":"저장됨 ✓"}
    </div>
  );

  if(screen==="memberLogin") return <MemberLoginPage members={members} onLogin={m=>{setLoggedMember(m);setScreen("memberView");}} onGoAdmin={()=>setScreen("adminLogin")}/>;
  if(screen==="memberView"&&loggedMember) return <MemberView member={members.find(m=>m.id===loggedMember.id)||loggedMember} bookings={bookings} setBookings={updateBookings} setMembers={updateMembers} specialSchedules={specialSchedules} closures={closures} notices={notices} onLogout={()=>{setLoggedMember(null);setScreen("memberLogin");}}/>;
  if(screen==="adminLogin") return <AdminLoginPage onLogin={()=>setScreen("admin")} onGoMember={()=>setScreen("memberLogin")}/>;
  if(screen==="admin") return(
    <div style={{fontFamily:FONT}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#f5f3ef;font-family:${FONT};-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent;overflow-x:hidden}
        button,input,select,textarea{font-family:${FONT};outline:none;-webkit-appearance:none}
        .card{transition:box-shadow .2s,transform .15s}
        @media(hover:hover){.card:hover{box-shadow:0 6px 24px rgba(60,50,30,.14);transform:translateY(-2px)}}
        .pill,.ibtn{transition:all .15s;cursor:pointer}
        .pill:hover,.ibtn:hover{opacity:.78}
        .ovl{animation:fi .18s}.mbox{animation:su .22s ease}
        @keyframes fi{from{opacity:0}to{opacity:1}}
        @keyframes su{from{transform:translateY(18px);opacity:0}to{transform:translateY(0);opacity:1}}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#c8c0b0;border-radius:4px}
        button:active{opacity:.72}
        input,select,textarea{font-size:16px !important}
      `}</style>
      <SaveBadge/>
      {!dbReady&&!saving&&(
        <div style={{position:"fixed",top:8,left:"50%",transform:"translateX(-50%)",zIndex:998,background:"#fff3f0",border:"1px solid #f0b0b0",borderRadius:10,padding:"8px 14px",fontSize:11,color:"#8e3030",fontFamily:FONT,display:"flex",gap:8,alignItems:"center",boxShadow:"0 2px 12px rgba(0,0,0,.1)"}}>
          <span>⚠️ DB 미연결 — 첫 실행이면 초기 데이터 업로드 필요</span>
          <button onClick={seedDb} style={{background:"#4a6a4a",color:"#fff",border:"none",borderRadius:7,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:FONT,fontWeight:700}}>초기 업로드</button>
          <button onClick={loadFromDb} style={{background:"#edf0f8",color:"#3d5494",border:"none",borderRadius:7,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:FONT}}>재연결</button>
        </div>
      )}
      <AdminApp members={members} setMembers={updateMembers} bookings={bookings} setBookings={updateBookings} notices={notices} setNotices={updateNotices} specialSchedules={specialSchedules} setSpecialSchedules={updateSpecials} closures={closures} setClosures={updateClosures} onLogout={()=>setScreen("memberLogin")}/>
    </div>
  );
  return null;
}

// ─── Styles ───────────────────────────────────────────────────
const S={
  page:{minHeight:"100vh",background:"#f5f3ef",fontFamily:FONT,padding:"20px 16px 80px",maxWidth:980,margin:"0 auto"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,gap:8},
  logoRow:{display:"flex",alignItems:"center",gap:7,marginBottom:3},
  studioName:{fontSize:21,fontWeight:700,color:"#1e2e1e"},
  sub:{fontSize:11,color:"#a09080"},
  addBtn:{background:"#4a6a4a",color:"#fff",border:"none",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,whiteSpace:"nowrap"},
  pillRow:{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"},
  pill:{border:"none",borderRadius:20,padding:"6px 14px",fontSize:12,cursor:"pointer",fontFamily:FONT},
  toolbar:{display:"flex",gap:10,marginBottom:18},
  searchBox:{background:"#fff",border:"1.5px solid #ddd",borderRadius:10,padding:"9px 12px",display:"flex",alignItems:"center",flex:1},
  searchInput:{border:"none",background:"transparent",fontSize:14,color:"#3a3a3a",width:"100%",fontFamily:FONT},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:12},
  empty:{color:"#b0a090",fontSize:14,padding:"36px 0",textAlign:"center",gridColumn:"1/-1"},
  card:{background:"#fff",borderRadius:13,padding:"14px 14px 12px",border:"1px solid #e4e0d8",boxShadow:"0 2px 8px rgba(60,50,30,.06)",position:"relative"},
  cardTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9,flexWrap:"wrap",gap:4},
  memberName:{fontSize:15,fontWeight:700,color:"#1e2e1e"},
  statusBadge:{display:"flex",alignItems:"center",fontSize:11,borderRadius:20,padding:"3px 8px",fontWeight:600},
  track:{height:5,background:"#e8e4dc",borderRadius:4,marginBottom:10,overflow:"hidden"},
  fill:{height:"100%",borderRadius:4,transition:"width .4s ease"},
  dateRow:{display:"flex",alignItems:"center",gap:7,marginBottom:10,flexWrap:"wrap"},
  dateLabel:{fontSize:10,color:"#b0a090",letterSpacing:".3px"},
  dateVal:{fontSize:11,color:"#4a4a4a",fontWeight:600},
  dChip:{marginLeft:"auto",fontSize:11,fontWeight:700,borderRadius:7,padding:"3px 8px"},
  actions:{display:"flex",gap:5},
  detailBtn:{flex:1,background:"#eef4ee",color:"#2e6e44",border:"none",borderRadius:7,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT},
  editBtn:{background:"#f0ece4",color:"#6a6050",border:"none",borderRadius:7,padding:"7px 9px",fontSize:11,cursor:"pointer",fontFamily:FONT},
  delBtn:{background:"#f5eeee",color:"#c97474",border:"none",borderRadius:7,padding:"7px 8px",fontSize:11,cursor:"pointer",fontFamily:FONT},
  navBtn:{background:"#fff",border:"1.5px solid #ddd",borderRadius:8,padding:"7px 11px",fontSize:13,color:"#4a4a4a",cursor:"pointer",fontFamily:FONT},
  overlay:{position:"fixed",inset:0,background:"rgba(40,35,25,.42)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:"16px 16px max(16px,env(safe-area-inset-bottom))"},
  modal:{background:"#fff",borderRadius:16,padding:"22px 20px",width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(40,35,25,.22)"},
  modalHead:{display:"flex",alignItems:"center",gap:9,marginBottom:14},
  modalTitle:{fontSize:16,fontWeight:700,color:"#1e2e1e"},
  fg:{marginBottom:12},
  lbl:{display:"block",fontSize:11,color:"#9a8e80",marginBottom:4,fontWeight:600},
  inp:{width:"100%",border:"1.5px solid #ddd",borderRadius:9,padding:"10px 11px",fontSize:14,color:"#3a3a3a",background:"#fafaf7",fontFamily:FONT},
  modalBtns:{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10},
  cancelBtn:{background:"#f0ece4",color:"#9a8e80",border:"none",borderRadius:9,padding:"9px 16px",fontSize:13,cursor:"pointer",fontFamily:FONT},
  saveBtn:{background:"#4a6a4a",color:"#fff",border:"none",borderRadius:9,padding:"9px 20px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT},
  stepper:{width:28,height:28,borderRadius:7,border:"1.5px solid #ddd",background:"#fafaf7",color:"#4a4a4a",fontSize:15,cursor:"pointer",fontFamily:FONT},
};
