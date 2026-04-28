import { useState, useEffect, useRef, useCallback } from "react";
import { Agentation } from "agentation";
import { FONT, TODAY_STR, getTodayStr, TIME_SLOTS, DOW_KO } from "./constants.js";
import { ClosuresContext } from "./context.js";
import { isPushSupported, subscribePush } from "./pushUtils.js";
import {
  _supabase,
  dbLoadAll,
  dbUpsertMember, dbUpsertBooking, dbUpsertNotice, dbUpsertSpecial, dbUpsertClosure,
  dbDeleteMember, dbDeleteBooking, dbDeleteNotice, dbDeleteSpecial, dbDeleteClosure,
  dbUpsertSale, dbDeleteSale,
  saveAutoLogin, loadAutoLogin, saveScheduleTemplate,
  fromSnakeNotice, fromSnakeBooking, fromSnakeMember, dbSavePushSubscription,
  dbInsertNotifLog,
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
  const membersRef = useRef([]); // stale closure 방지용 — realtime 리스너에서 회원명 조회에 사용
  const specialSchedulesRef = useRef([]); // 폴링 알람에서 특수수업 커스텀 시간 조회용
  const scheduleTemplateRef = useRef([]); // 폴링 알람에서 시간표 커스텀 시간 조회용
  const adminNotifChRef = useRef(null); // 관리자 알림 브로드캐스트 채널 (앱 전체 단일 인스턴스)
  const screenRef = useRef("memberLogin"); // 현재 screen — 브로드캐스트 수신 시 admin 여부 판별용
  const handleRefreshRef = useRef(null); // 브로드캐스트 수신 시 관리자 자동 새로고침용

  // 관리자 알림 로그 — localStorage에 오늘 날짜 키로 저장, 자정 지나면 자동 초기화
  const [adminNotifLog, setAdminNotifLog] = useState(() => {
    try {
      const k = `yogapian_admin_notif_${getTodayStr()}`;
      const s = localStorage.getItem(k);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [adminNotifUnread, setAdminNotifUnread] = useState(0);

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
          // 초기 로드 시 최대 ID·상태 저장 — 이후 refresh에서 변경분만 감지
          const initMaxId = Math.max(...processed.map(b=>b.id), 0);
          if(initMaxId > 0) lastSeenBookingIdRef.current = initMaxId;
          prevBookingStatusRef.current = Object.fromEntries(processed.map(b=>[b.id, b.status]));
        }
        if(all.notices.length)          setNoticesState(all.notices);
        if(all.specialSchedules.length) setSpecialSchedulesState(all.specialSchedules);
        if(all.closures.length)         setClosuresState(all.closures);
        if(all.scheduleTemplate && Object.keys(all.scheduleTemplate).length) setScheduleTemplateState(all.scheduleTemplate);
        if(all.sales?.length) setSalesState(all.sales);

        try {
          // 관리자 자동로그인
          if(localStorage.getItem("yogapian_admin_autologin")){
            setScreen("admin");
          } else {
            const autoLogin = await loadAutoLogin();
            if(autoLogin?.memberId && all.members.length){
              const m = all.members.find(mb=>mb.id===autoLogin.memberId);
              if(m){ setLoggedMember(m); setScreen("memberView"); }
            }
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

  // ref를 항상 최신 상태로 유지 (realtime 리스너의 stale closure 방지)
  membersRef.current = members;
  screenRef.current = screen;
  specialSchedulesRef.current = specialSchedules;
  scheduleTemplateRef.current = scheduleTemplate;
  // handleRefresh는 선언 후 아래에서 할당 (ref는 여기서 초기화만)

  // 알림 로그를 localStorage에 저장 (오늘 날짜 키, 구일 자동 삭제)
  useEffect(() => {
    const todayKey = `yogapian_admin_notif_${getTodayStr()}`;
    try {
      localStorage.setItem(todayKey, JSON.stringify(adminNotifLog));
      // 구일 로그 청소
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith("yogapian_admin_notif_") && k !== todayKey) localStorage.removeItem(k);
      }
    } catch {}
  }, [adminNotifLog]);

  // ── 관리자 알림 브로드캐스트 채널 — 앱 전체에서 단일 인스턴스 유지 ─────────
  // 크로스 디바이스(회원 폰 → 관리자 PC) 전용 수신
  // 같은 탭 시나리오는 onBookingNotif에서 직접 state 업데이트로 처리
  // 모바일 백그라운드 복귀 시 채널 재연결 + 즉시 폴링으로 누락 알림 보완
  useEffect(() => {
    function buildBroadcastChannel() {
      const ch = _supabase.channel("yogapian-admin-notif")
        .on("broadcast", { event: "booking_change" }, ({ payload }) => {
          // Supabase는 sender에게 echo 안 함 → 여기 오는 건 다른 기기에서 온 것
          // admin 화면 밖에서 도착해도 로그에는 저장 (화면 전환 시 뱃지 확인 가능)
          if (!payload) return;
          const kst = new Date(new Date().getTime() + 9*3600*1000);
          const t = `${String(kst.getUTCHours()).padStart(2,"0")}:${String(kst.getUTCMinutes()).padStart(2,"0")}`;
          // buildNotifText는 선언 전이므로 여기서 인라인 처리 (동일 포맷)
          // 포맷: ✅예약 [이름] MM.DD (요일) 슬롯명 시간
          const name  = payload.memberName || "?";
          const label = payload.slotLabel || payload.slotKey || "?";
          const time  = payload.slotTime  ? ` ${payload.slotTime}` : "";
          const [py, pm, pd] = (payload.date||"").split("-");
          const date  = (py && pm && pd) ? ` ${pm}.${pd} (${DOW_KO[new Date(Number(py),Number(pm)-1,Number(pd)).getDay()]})` : "";
          let text, type;
          if      (payload.event === "reserve") { text = `예약 [${name}]${date} ${label}${time}`; type = "reserve"; }
          else if (payload.event === "waiting") { text = `대기 [${name}]${date} ${label}${time}`; type = "waiting"; }
          else if (payload.event === "cancel")  { text = `취소 [${name}]${date} ${label}${time}`; type = "cancel"; }
          if (!text) return;
          const entry = { id: `${Date.now()}-${Math.random()}`, time: t, text, type };
          setAdminNotifLog(prev => [entry, ...prev]);
          setAdminNotifUnread(prev => prev + 1);
          // 다른 기기에서 예약/취소 시 관리자 화면 자동 새로고침
          handleRefreshRef.current?.().catch(()=>{});
        })
        .subscribe();
      adminNotifChRef.current = ch;
      return ch;
    }

    let ch = buildBroadcastChannel();

    // 모바일에서 백그라운드 → 포그라운드 복귀 시:
    // WebSocket이 끊겼을 수 있으므로 채널 재연결 + 누락 예약 즉시 감지 (폴링)
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      // 채널 재연결
      if (adminNotifChRef.current) _supabase.removeChannel(adminNotifChRef.current);
      ch = buildBroadcastChannel();
      // 폴링으로 백그라운드 중 누락된 예약/취소 즉시 감지
      if (screenRef.current === "admin") {
        handleRefreshRef.current?.().catch(()=>{});
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      _supabase.removeChannel(ch);
      adminNotifChRef.current = null;
    };
  }, []); // eslint-disable-line

  // notifDateLabel: "2026-04-10" → "04.10(금)" 형식으로 변환 (관리자 벨 알림용)
  const notifDateLabel = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    const dow = DOW_KO[new Date(Number(y), Number(m) - 1, Number(d)).getDay()];
    return `${m}.${d}(${dow})`;
  };

  // buildNotifText: 알림 종류별 텍스트 생성 (벨 + 브로드캐스트 수신 공통 사용)
  // 포맷: {타입이모지}{타입} {이름} {MM.DD(요일)} {슬롯명} {시간}
  const buildNotifText = (data) => {
    const name  = data.memberName || "?";
    const label = data.slotLabel  || data.slotKey || "?";
    const time  = data.slotTime   ? ` ${data.slotTime}` : "";
    const date  = data.date ? ` ${notifDateLabel(data.date)}` : "";
    if (data.event === "reserve") return { text:`예약 [${name}]${date} ${label}${time}`, type:"reserve" };
    if (data.event === "waiting") return { text:`대기 [${name}]${date} ${label}${time}`, type:"waiting" };
    if (data.event === "cancel")  return { text:`취소 [${name}]${date} ${label}${time}`, type:"cancel" };
    return null;
  };

  // onBookingNotif: 회원이 예약/취소 시 호출
  // 동작 1) 직접 state 업데이트 → 같은 탭에서 회원→관리자 전환 시 즉시 알림 표시
  //         (Supabase broadcast는 sender 에게 echo 없음 → 같은 탭 전환 시 수신 불가)
  // 동작 2) 브로드캐스트 전송 → 다른 기기/탭의 관리자 화면에서 수신
  const onBookingNotif = useCallback((data) => {
    // ── 1. 직접 state 업데이트 (같은 탭 시나리오) ─────────────────────────────
    const _kst = new Date(new Date().getTime() + 9*3600*1000);
    const _t = `${String(_kst.getUTCHours()).padStart(2,"0")}:${String(_kst.getUTCMinutes()).padStart(2,"0")}`;
    const built = buildNotifText(data);
    if (built) {
      const _entry = { id: `${Date.now()}-${Math.random()}`, time: _t, text: built.text, type: built.type };
      setAdminNotifLog(prev => [_entry, ...prev]);
      setAdminNotifUnread(prev => prev + 1);
    }
    // ── 2. DB 알림 로그 영구 저장 (기기 무관하게 누적 — 핸드폰 미수신 시에도 기록 보장)
    dbInsertNotifLog(data).catch(() => {});
    // ── 3. 브로드캐스트 (다른 기기/탭의 관리자에게 전송) ──────────────────────
    adminNotifChRef.current?.send({ type: "broadcast", event: "booking_change", payload: data })
      .catch(() => {});
  }, []); // eslint-disable-line

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

  // 관리자 화면 실시간 동기화 — 예약/회원 변경 즉시 반영
  useEffect(() => {
    if(screen !== "admin") return;

    // ── postgres_changes: 상태 동기화 전용 (알림은 Broadcast로 별도 처리) ──
    const ch = _supabase.channel("admin-realtime")
      .on("postgres_changes", {event:"*", schema:"public", table:"bookings"}, payload => {
        if(payload.eventType === "INSERT"){
          setBookingsState(prev => prev.some(b=>b.id===payload.new.id) ? prev : [...prev, fromSnakeBooking(payload.new)]);
        } else if(payload.eventType === "UPDATE"){
          setBookingsState(prev => prev.map(b=>b.id===payload.new.id ? fromSnakeBooking(payload.new) : b));
        } else if(payload.eventType === "DELETE"){
          setBookingsState(prev => prev.filter(b=>b.id!==payload.old.id));
        }
      })
      .on("postgres_changes", {event:"*", schema:"public", table:"members"}, payload => {
        if(payload.eventType === "INSERT"){
          setMembersState(prev => prev.some(m=>m.id===payload.new.id) ? prev : [...prev, fromSnakeMember(payload.new)]);
        } else if(payload.eventType === "UPDATE"){
          setMembersState(prev => prev.map(m=>m.id===payload.new.id ? fromSnakeMember(payload.new) : m));
        } else if(payload.eventType === "DELETE"){
          setMembersState(prev => prev.filter(m=>m.id!==payload.old.id));
        }
      })
      .subscribe();

    return () => _supabase.removeChannel(ch);
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

  // 마지막으로 본 booking ID 추적 — refresh 시 새 예약 감지
  const lastSeenBookingIdRef = useRef(0);
  // 이전 booking 상태 맵 — refresh 시 취소 감지 (status 변경은 ID가 그대로)
  const prevBookingStatusRef = useRef({}); // { [id]: status }

  // 수동 새로고침 — 관리자가 🔄 버튼 클릭 시 DB에서 최신 데이터 즉시 재로드
  // handleRefreshRef에 할당하여 브로드캐스트 수신/30초 폴링 시에도 사용
  const handleRefresh = useCallback(async () => {
    try {
      const all = await dbLoadAll();
      if(all.bookings.length){
        const processed = all.bookings.map(b=>{
          if(b.status==="attended" && b.date<TODAY_STR && b.confirmedAttend==null)
            return {...b, confirmedAttend:true};
          return b;
        });

        // ── 새 예약/취소 감지 → 벨 알람 자동 생성 (WebSocket 없이도 동작) ──
        if(lastSeenBookingIdRef.current > 0){
          const kst = new Date(new Date().getTime()+9*3600*1000);
          const t = `${String(kst.getUTCHours()).padStart(2,"0")}:${String(kst.getUTCMinutes()).padStart(2,"0")}`;
          const todayStr = getTodayStr();
          const newEntries = [];
          for(const b of processed){
            if(b.date < todayStr) continue; // 오늘 이전 과거 예약 무시
            const member = membersRef.current.find(m=>m.id===b.memberId);
            const name = member?.name || b.onedayName || "?";
            const slotObj = TIME_SLOTS.find(s=>s.key===b.timeSlot);
            const label = slotObj?.label || b.timeSlot || "?";
            // 실제 수업 시간: 특수수업 customTimes → scheduleTemplate 커스텀 시간 → 기본값 순서로
            const spSched = specialSchedulesRef.current.find(s=>s.date===b.date);
            const spTime = spSched?.customTimes?.[b.timeSlot];
            const tmpl = scheduleTemplateRef.current;
            const bDow = b.date ? new Date(b.date+"T00:00:00").getDay() : -1;
            const tmplEntry = Array.isArray(tmpl)
              ? tmpl.find(e=>e.slotKey===b.timeSlot&&e.days.includes(bDow)&&(!e.startDate||b.date>=e.startDate)&&(!e.endDate||b.date<=e.endDate))
              : null;
            const actualTime = spTime || tmplEntry?.time || slotObj?.time || "";
            const time = actualTime ? ` ${actualTime}` : "";
            const [py,pm,pd] = (b.date||"").split("-");
            const date = (py&&pm&&pd) ? ` ${pm}.${pd}(${DOW_KO[new Date(Number(py),Number(pm)-1,Number(pd)).getDay()]})` : "";
            let text, type;
            const prevStatus = prevBookingStatusRef.current[b.id];
            if(b.id > lastSeenBookingIdRef.current){
              // 새로 생긴 booking
              if(b.status==="reserved"){ text=`예약 [${name}]${date} ${label}${time}`; type="reserve"; }
              else if(b.status==="waiting"){ text=`대기 [${name}]${date} ${label}${time}`; type="waiting"; }
            } else if(prevStatus && prevStatus!=="cancelled" && b.status==="cancelled" && b.cancelledBy!=="admin"){
              // 기존 booking이 회원에 의해 취소됨
              text=`취소 [${name}]${date} ${label}${time}`; type="cancel";
            }
            if(text) newEntries.push({id:`${Date.now()}-${b.id}`,time:t,text,type});
          }
          if(newEntries.length){
            setAdminNotifLog(prev=>[...newEntries,...prev]);
            setAdminNotifUnread(prev=>prev+newEntries.length);
          }
        }
        // 상태 스냅샷 및 최대 ID 갱신
        const maxId = Math.max(...processed.map(b=>b.id), 0);
        if(maxId > 0) lastSeenBookingIdRef.current = Math.max(lastSeenBookingIdRef.current, maxId);
        prevBookingStatusRef.current = Object.fromEntries(processed.map(b=>[b.id, b.status]));

        setBookingsState(processed);
      }
      if(all.members.length)          setMembersState(all.members);
      if(all.specialSchedules.length) setSpecialSchedulesState(all.specialSchedules);
      if(all.closures.length)         setClosuresState(all.closures);
      if(all.sales?.length)           setSalesState(all.sales);
      if(all.notices.length)          setNoticesState(all.notices);
    } catch(e){ console.warn("수동 새로고침 실패:", e); }
  }, []); // eslint-disable-line
  handleRefreshRef.current = handleRefresh; // 항상 최신 함수 참조 유지

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

  // 관리자 화면에서 30초마다 자동 새로고침 — Broadcast 미수신 시 데이터 최신화 보장
  useEffect(()=>{
    if(screen!=="admin") return;
    const t=setInterval(()=>{ handleRefreshRef.current?.().catch(()=>{}); }, 10000); // 10초마다 폴링
    return()=>clearInterval(t);
  },[screen]);

  // KST 자정에 페이지 자동 리로드 — TODAY_STR·TODAY 상수가 모듈 로드 시 한 번만 계산되므로
  // 앱을 열어둔 채 자정이 지나면 날짜가 틀려지는 버그 방지
  useEffect(()=>{
    function msUntilKSTMidnight(){
      const now=new Date();
      const kst=new Date(now.getTime()+9*3600*1000);
      // KST 자정(00:00) = UTC 기준으로는 전날 15:00 (KST = UTC+9)
      // → Date.UTC(KST 다음날) - 9시간 = KST 다음날 자정의 UTC 타임스탬프
      const next=Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate()+1)-9*3600*1000;
      return next-now.getTime();
    }
    const t=setTimeout(()=>window.location.reload(),msUntilKSTMidnight());
    return()=>clearTimeout(t);
  },[]);

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
      <MemberView member={members.find(m=>m.id===loggedMember.id)||loggedMember} bookings={bookings} setBookings={setBookings} setMembers={setMembers} specialSchedules={specialSchedules} closures={closures} notices={notices} setNotices={setNotices} scheduleTemplate={scheduleTemplate} onBookingNotif={onBookingNotif} onRefresh={handleRefresh} onLogout={()=>{setLoggedMember(null);setScreen("memberLogin");saveAutoLogin(null);}}/>
    </div>
    </ClosuresContext.Provider>
  );
  if(screen==="adminLogin") return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}body{background:#2e3a2e}button,input{font-family:${FONT};outline:none;-webkit-appearance:none}button:active{opacity:.72}`}</style>
      <AdminLoginPage onLogin={()=>{localStorage.setItem("yogapian_admin_autologin","1");setScreen("admin");}} onGoMember={()=>setScreen("memberLogin")}/>
    </div>
    </ClosuresContext.Provider>
  );
  if(screen==="admin") return(
    <ClosuresContext.Provider value={closures}>
    <div style={{fontFamily:FONT}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f5f3ef;font-family:${FONT}}button,input,select,textarea{font-family:${FONT};outline:none;-webkit-appearance:none}.card{transition:box-shadow .2s,transform .15s}@media(hover:hover){.card:hover{box-shadow:0 6px 24px rgba(60,50,30,.14);transform:translateY(-2px)}}.pill:hover{opacity:.78}button:active{opacity:.72}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#c8c0b0;border-radius:4px}@media(max-width:600px){html{font-size:14px}.admin-grid{grid-template-columns:1fr!important}.admin-pillrow{gap:5px!important}.admin-toolbar{flex-direction:column!important}}`}</style>
      <SaveBadge/>
      {/* onRefresh: 🔄 버튼으로 DB 최신 데이터 즉시 재로드 */}
      <AdminApp members={members} setMembers={setMembers} bookings={bookings} setBookings={setBookings} notices={notices} setNotices={setNotices} specialSchedules={specialSchedules} setSpecialSchedules={setSpecialSchedules} closures={closures} setClosures={setClosures} scheduleTemplate={scheduleTemplate} setScheduleTemplate={setScheduleTemplate} sales={sales} setSales={setSales} adminNotifLog={adminNotifLog} adminNotifUnread={adminNotifUnread} onMarkNotifRead={()=>setAdminNotifUnread(0)} onClearNotifLog={()=>setAdminNotifLog([])} onRefresh={handleRefresh} onLogout={()=>{localStorage.removeItem("yogapian_admin_autologin");setScreen("memberLogin");}}/>
      {process.env.NODE_ENV === "development" && <Agentation />}
    </div>
    </ClosuresContext.Provider>
  );
  return null;
}
