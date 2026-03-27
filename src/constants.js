export const SCHEDULE = {0:[],1:["dawn","morning","lunch","evening"],2:["lunch","evening"],3:["dawn","morning","lunch","evening"],4:["lunch","evening"],5:["dawn","morning","evening"],6:[]};
export const TIME_SLOTS = [
  {key:"dawn",      label:"새벽",time:"06:30",color:"#3d5494",bg:"#edf0f8",icon:"🌙"},
  {key:"morning",   label:"오전",time:"08:30",color:"#3d6e45",bg:"#eaf4ea",icon:"🌤️"},
  {key:"lunch",     label:"점심",time:"11:50",color:"#8a5510",bg:"#fdf3e3",icon:"☀️"},
  {key:"afternoon", label:"오후",time:"14:00",color:"#6a5494",bg:"#f0edf8",icon:"🌞"},
  {key:"evening",   label:"저녁",time:"19:30",color:"#5c3070",bg:"#f2edf8",icon:"🌛"},
];
export const DOW_KO=["일","월","화","수","목","금","토"];
export const FONT="'Malgun Gothic','맑은 고딕',-apple-system,sans-serif";

// 한국 공휴일 (2025~2026)
export const KR_HOLIDAYS={
  "2025-01-01":"신정","2025-01-28":"설날연휴","2025-01-29":"설날","2025-01-30":"설날연휴",
  "2025-03-01":"삼일절","2025-05-05":"어린이날","2025-05-06":"대체공휴일",
  "2025-05-15":"부처님오신날","2025-06-06":"현충일",
  "2025-08-15":"광복절","2025-10-03":"개천절","2025-10-05":"추석연휴",
  "2025-10-06":"추석","2025-10-07":"추석연휴","2025-10-08":"대체공휴일",
  "2025-10-09":"한글날","2025-12-25":"크리스마스",
  "2025-12-31":"연말 무료수업",
  "2026-01-01":"신년 무료수업","2026-02-15":"설날연휴","2026-02-16":"설날","2026-02-17":"설날연휴","2026-02-18":"설날연휴",
  "2026-03-01":"삼일절","2026-03-02":"대체공휴일","2026-05-05":"어린이날","2026-05-24":"부처님오신날","2026-05-25":"대체공휴일",
  "2026-06-06":"현충일","2026-06-08":"대체공휴일","2026-08-15":"광복절","2026-08-17":"대체공휴일",
  "2026-09-24":"추석연휴","2026-09-25":"추석","2026-09-26":"추석연휴","2026-09-28":"대체공휴일",
  "2026-10-03":"개천절","2026-10-05":"대체공휴일","2026-10-09":"한글날","2026-12-25":"크리스마스",
};

export const LOGO_B64="/logo.png";

// 오늘 날짜를 항상 실제 현재 날짜로 동적 계산
const _now=new Date();
export const TODAY_STR=`${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,"0")}-${String(_now.getDate()).padStart(2,"0")}`;
export const TODAY=new Date(_now.getFullYear(),_now.getMonth(),_now.getDate());
export const ADMIN_PIN="0066";

export const SC={on:{label:"ON",bg:"#e8f0e8",color:"#2e6e44",dot:"#3d8a55"},off:{label:"OFF",bg:"#f5eeee",color:"#8e3030",dot:"#c97474"},hold:{label:"HOLD",bg:"#edf0f8",color:"#3d5494",dot:"#6a7fc8"}};
export const GE={F:"🧘🏻‍♀️",M:"🧘🏻‍♂️"};
export const TYPE_CFG={"1month":{label:"1개월",bg:"#e0f2e9",color:"#1e6040"},"3month":{label:"3개월",bg:"#ede9fe",color:"#5b30b8"}};

export const BOOKING_STATUS={
  reserved: {label:"출석",bg:"#e8f0e8",color:"#2e6e44",icon:"✓"},
  attended: {label:"출석",bg:"#e8f0e8",color:"#2e6e44",icon:"✓"},
  waiting:  {label:"대기",bg:"#fdf3e3",color:"#9a5a10",icon:"⏳"},
  cancelled:{label:"취소",bg:"#f0ece4",color:"#9a8e80",icon:"×"},
};
