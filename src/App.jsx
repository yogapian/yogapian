import { useState, useEffect, useRef, useCallback } from "react";
import { Agentation } from "agentation";
import { FONT, TODAY_STR } from "./constants.js";
import { ClosuresContext } from "./context.js";
import { isPushSupported, subscribePush } from "./pushUtils.js";
import {
  _supabase,
  dbLoadAll,
  dbUpsertMember, dbUpsertBooking, dbUpsertNotice, dbUpsertSpecial, dbUpsertClosure,
  dbDeleteMember, dbDeleteBooking, dbDeleteNotice, dbDeleteSpecial, dbDeleteClosure,
  dbUpsertSale, dbDeleteSale,
  saveAutoLogin, loadAutoLogin, saveScheduleTemplate,
  fromSnakeNotice, dbSavePushSubscription,
} from "./db.js";
import MemberLoginPage from "./components/MemberLoginPage.jsx";
import AdminLoginPage from "./components/AdminLoginPage.jsx";
import MemberView from "./components/MemberView.jsx";
import AdminApp from "./components/AdminApp.jsx";

export default function App(){
  const [screen,setScreen]=useState("memberLogin");
  const [loggedMember,setLoggedMember]=useState(null);
  const [members,setMembersState]=useState([]);
  const [bookings,setBookingsState]=useState([]);
  const [notices,setNoticesState]=useState([]);
  const [specialSchedules,setSpecialSchedulesState]=useState([]);
  const [closures,setClosuresState]=useState([]);
  const [scheduleTemplate,setScheduleTemplateState]=useState({});
  const [sales,setSalesState]=useState([]);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const loadedRef = useRef(false);

  useEffect(()=>{
    (async()=>{
      try {
        const all = await dbLoadAll();
        if(all.members.length)   setMembersState(all.members);
        if(all.bookings.length){
          const processed = all.bookings.map(b=>{
            if(b.status==="attended" && b.date<TODAY_STR && b.confirmedAttend==null)
              return {...b, confirmedAttend:true};
            return b;
          });
          setBookingsState(processed);
        }
        if(all.notices.length)          setNoticesState(all.notices);
        if(all.specialSchedules.length) setSpecialSchedulesState(all.specialSchedules);
        if(all.closures.length)         setClosuresState(all.closures);
        if(all.scheduleTemplate && Object.keys(all.scheduleTemplate).length) setScheduleTemplateState(all.scheduleTemplate);
        if(all.sales?.length) setSalesState(all.sales);

        try {
          const autoLogin = await loadAutoLogin();
          if(autoLogin?.memberId && all.members.length){
            const m = all.members.find(mb=>mb.id===autoLogin.memberId);
            if(m){ setLoggedMember(m); setScreen("memberView"); }
          }
        } catch(e){}
      } catch(e){ console.warn("DB 로드 실패:", e); }
      loadedRef.current = true;
      setLoading(false);
    })();
  }, []);

  const setMembers = useCallback((updater) => {
    setMembersState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      const prevMap = new Map(prev.map(m=>[m.id, m]));
      const nextMap = new Map(next.map(m=>[m.id, m]));
      const changed = next.filter(m => {
        const old = prevMap.get(m.id);
        return !old || JSON.stringify(old) !== JSON.stringify(m);
      });
      // 삭제된 회원 DB에서도 제거 (기존에 누락되어 새로고침 시 복구되는 버그)
      const toDelete = prev.filter(m => !nextMap.has(m.id));
      changed.forEach(m => dbUpsertMember(m));
      toDelete.forEach(m => dbDeleteMember(m.id));
      return next;
    });
  }, []);

  const setBookings = useCallback((updater) => {
    setBookingsState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      setSaving(true);
      const prevMap = new Map(prev.map(b=>[b.id, b]));
      const nextMap = new Map(next.map(b=>[b.id, b]));
      const toUpsert = next.filter(b => {
        const old = prevMap.get(b.id);
        return !old || JSON.stringify(old) !== JSON.stringify(b);
      });
      const toDelete = prev.filter(b => !nextMap.has(b.id));
      Promise.all([
        ...toUpsert.map(b => dbUpsertBooking(b)),
        ...toDelete.map(b => dbDeleteBooking(b.id)),
      ]).finally(()=>setSaving(false));
      return next;
    });
  }, []);

  const setNotices = useCallback((updater) => {
    setNoticesState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      const prevMap = new Map(prev.map(n=>[n.id, n]));
      const nextMap = new Map(next.map(n=>[n.id, n]));
      next.filter(n => {
        const old = prevMap.get(n.id);
        return !old || JSON.stringify(old) !== JSON.stringify(n);
      }).forEach(n => dbUpsertNotice(n));
      prev.filter(n => !nextMap.has(n.id)).forEach(n => dbDeleteNotice(n.id));
      return next;
    });
  }, []);

  const setSpecialSchedules = useCallback((updater) => {
    setSpecialSchedulesState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      const prevMap = new Map(prev.map(s=>[s.id, s]));
      const nextMap = new Map(next.map(s=>[s.id, s]));
      next.filter(s => {
        const old = prevMap.get(s.id);
        return !old || JSON.stringify(old) !== JSON.stringify(s);
      }).forEach(s => dbUpsertSpecial(s));
      prev.filter(s => !nextMap.has(s.id)).forEach(s => dbDeleteSpecial(s.id));
      return next;
    });
  }, []);

  const setClosures = useCallback((updater) => {
    setClosuresState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      const prevMap = new Map(prev.map(c=>[c.id, c]));
      const nextMap = new Map(next.map(c=>[c.id, c]));
      next.filter(c => {
        const old = prevMap.get(c.id);
        return !old || JSON.stringify(old) !== JSON.stringify(c);
      }).forEach(c => dbUpsertClosure(c));
      prev.filter(c => !nextMap.has(c.id)).forEach(c => dbDeleteClosure(c.id));
      return next;
    });
  }, []);

  // 회원 로그인 후 푸시 알림 구독 (이미 허용된 경우 조용히 처리)
  useEffect(() => {
    if(screen !== "memberView" || !loggedMember) return;
    if(!isPushSupported()) return;
    const alreadyAsked = localStorage.getItem("push_asked_" + loggedMember.id);
    if(Notification.permission === "granted") {
      subscribePush(loggedMember.id, dbSavePushSubscription);
    } else if(Notification.permission === "default" && !alreadyAsked) {
      // 1초 후 권한 요청 (UX: 로그인 직후 바로 뜨지 않도록)
      const t = setTimeout(async () => {
        localStorage.setItem("push_asked_" + loggedMember.id, "1");
        const result = await Notification.requestPermission();
        if(result === "granted") subscribePush(loggedMember.id, dbSavePushSubscription);
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [screen, loggedMember?.id]); // eslint-disable-line

  // 관리자 로그인 후 푸시 알림 구독 (예약/취소 알림 수신)
  useEffect(() => {
    if(screen !== "admin") return;
    if(!isPushSupported()) return;
    if(Notification.permission === "granted") {
      subscribePush("admin", dbSavePushSubscription);
    } else if(Notification.permission === "default") {
      const alreadyAsked = localStorage.getItem("push_asked_admin");
      if(!alreadyAsked) {
        const t = setTimeout(async () => {
          localStorage.setItem("push_asked_admin", "1");
          const result = await Notification.requestPermission();
          if(result === "granted") subscribePush("admin", dbSavePushSubscription);
        }, 1000);
        return () => clearTimeout(t);
      }
    }
  }, [screen]); // eslint-disable-line

  // 회원 화면에서 실시간 공지 수신 — 관리자가 공지 발송 즉시 팝업 표시
  useEffect(() => {
    if(screen !== "memberView" || !loggedMember) return;
    const channel = _supabase.channel("member-notices-" + loggedMember.id)
      .on("postgres_changes", {event:"INSERT", schema:"public", table:"notices"},
        payload => {
          const n = fromSnakeNotice(payload.new);
          if(n.targetMemberId === loggedMember.id) {
            setNoticesState(prev => [n, ...prev]);
          }
        }
      ).subscribe();
    return () => _supabase.removeChannel(channel);
  }, [screen, loggedMember?.id]); // eslint-disable-line

  const setScheduleTemplate = useCallback((updater) => {
    setScheduleTemplateState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(loadedRef.current) saveScheduleTemplate(next);
      return next;
    });
  }, []);

  const setSales = useCallback((updater) => {
    setSalesState(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      if(!loadedRef.current) return next;
      const prevMap = new Map(prev.map(s=>[s.id, s]));
      const nextMap = new Map(next.map(s=>[s.id, s]));
      next.filter(s => { const old=prevMap.get(s.id); return !old||JSON.stringify(old)!==JSON.stringify(s); }).forEach(s=>dbUpsertSale(s));
      prev.filter(s => !nextMap.has(s.id)).forEach(s=>dbDeleteSale(s.id));
      return next;
    });
  }, []);

  const SaveBadge = ()=>(
    <div style={{position:"fixed",bottom:16,right:16,zIndex:999,display:"flex",alignItems:"center",gap:5,
      background:saving?"#fdf3e3":"#eef5ee",
      border:`1px solid ${saving?"#e8c44a":"#a0d0a0"}`,
      borderRadius:20,padding:"5px 12px",fontSize:11,
      color:saving?"#9a5a10":"#2e6e44",fontFamily:FONT,
      boxShadow:"0 2px 8px rgba(0,0,0,.08)"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:saving?"#e8a44a":"#5a9e6a",display:"inline-block"}}/>
      {saving?"저장 중…":"저장됨 ✓"}
    </div>
  );

  if(loading) return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f3ef",fontFamily:FONT,color:"#9a8e80",fontSize:14}}>
      불러오는 중…
    </div>
  );

  if(screen==="memberLogin") return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f5f3ef;font-family:${FONT}}button,input{font-family:${FONT};outline:none;-webkit-appearance:none}button:active{opacity:.72}@media(max-width:390px){html{font-size:14px}}`}</style>
      <MemberLoginPage members={members} onLogin={m=>{setLoggedMember(m);setScreen("memberView");}} onGoAdmin={()=>setScreen("adminLogin")}/>
    </div>
    </ClosuresContext.Provider>
  );
  if(screen==="memberView"&&loggedMember) return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f5f3ef;font-family:${FONT}}button,input{font-family:${FONT};outline:none;-webkit-appearance:none}button:active{opacity:.72;transform:scale(.97)}@media(max-width:390px){html{font-size:14px}}.member-header{flex-wrap:wrap;gap:8px!important}`}</style>
      <MemberView member={members.find(m=>m.id===loggedMember.id)||loggedMember} bookings={bookings} setBookings={setBookings} setMembers={setMembers} specialSchedules={specialSchedules} closures={closures} notices={notices} setNotices={setNotices} scheduleTemplate={scheduleTemplate} onLogout={()=>{setLoggedMember(null);setScreen("memberLogin");saveAutoLogin(null);}}/>
    </div>
    </ClosuresContext.Provider>
  );
  if(screen==="adminLogin") return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}body{background:#2e3a2e}button,input{font-family:${FONT};outline:none;-webkit-appearance:none}button:active{opacity:.72}`}</style>
      <AdminLoginPage onLogin={()=>setScreen("admin")} onGoMember={()=>setScreen("memberLogin")}/>
    </div>
    </ClosuresContext.Provider>
  );
  if(screen==="admin") return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f5f3ef;font-family:${FONT}}button,input,select,textarea{font-family:${FONT};outline:none;-webkit-appearance:none}.card{transition:box-shadow .2s,transform .15s}@media(hover:hover){.card:hover{box-shadow:0 6px 24px rgba(60,50,30,.14);transform:translateY(-2px)}}.pill:hover{opacity:.78}button:active{opacity:.72}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#c8c0b0;border-radius:4px}@media(max-width:600px){html{font-size:14px}.admin-grid{grid-template-columns:1fr!important}.admin-pillrow{gap:5px!important}.admin-toolbar{flex-direction:column!important}}`}</style>
      <SaveBadge/>
      <AdminApp members={members} setMembers={setMembers} bookings={bookings} setBookings={setBookings} notices={notices} setNotices={setNotices} specialSchedules={specialSchedules} setSpecialSchedules={setSpecialSchedules} closures={closures} setClosures={setClosures} scheduleTemplate={scheduleTemplate} setScheduleTemplate={setScheduleTemplate} sales={sales} setSales={setSales} onLogout={()=>setScreen("memberLogin")}/>
      {process.env.NODE_ENV === "development" && <Agentation />}
    </div>
    </ClosuresContext.Provider>
  );
  return null;
}
