import { useState, useMemo } from "react";
import { FONT, TODAY_STR, SC, GE, TYPE_CFG } from "../constants.js";
import { fmt } from "../utils.js";
import { endOfNextMonth, endOfMonth } from "../utils.js";
import { getDisplayStatus, calc3MonthEnd } from "../memberCalc.js";
import { useClosures } from "../context.js";
import { useClock } from "../utils.js";
import S from "../styles.js";
import AttendanceBoard from "./AttendanceBoard.jsx";
import MemberCard from "./MemberCard.jsx";
import AdminDetailModal from "./AdminDetailModal.jsx";
import RenewalModal from "./RenewalModal.jsx";
import HoldingModal from "./HoldingModal.jsx";
import NoticeManager from "./NoticeManager.jsx";

export default function AdminApp({members,setMembers,bookings,setBookings,notices,setNotices,specialSchedules,setSpecialSchedules,closures,setClosures,scheduleTemplate,setScheduleTemplate,onLogout}){
  const [tab,setTab]=useState("attendance");
  const [filter,setFilter]=useState("on");
  const [search,setSearch]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({});
  const [detailM,setDetailM]=useState(null);
  const [renewT,setRenewT]=useState(null);
  const [holdT,setHoldT]=useState(null);
  const [delT,setDelT]=useState(null);
  const [showNotices,setShowNotices]=useState(false);
  const [showPendingPopup,setShowPendingPopup]=useState(true);

  const renewPendingMembers=useMemo(()=>members.filter(m=>bookings.some(b=>b.memberId===m.id&&b.renewalPending&&b.date===TODAY_STR)),[members,bookings]);
  const gds=(m)=>getDisplayStatus(m,closures,bookings);
  const counts={total:members.length,on:members.filter(m=>gds(m)==="on").length,renew:members.filter(m=>gds(m)==="renew").length,hold:members.filter(m=>gds(m)==="hold").length,off:members.filter(m=>gds(m)==="off").length};
  const filtered=useMemo(()=>{const gd=(m)=>getDisplayStatus(m,closures,bookings);return members.filter(m=>{if(filter!=="total"&&gd(m)!==filter)return false;if(search&&!m.name.includes(search))return false;return true;}).sort((a,b)=>a.name.localeCompare(b.name,"ko"));},[members,filter,search,closures,bookings]);

  function openAdd(){
    const autoEnd=endOfNextMonth(TODAY_STR);
    setEditId(null);
    setForm({gender:"F",name:"",adminNickname:"",adminNote:"",cardColor:"",phone:"",phone4:"",firstDate:TODAY_STR,memberType:"1month",isNew:true,total:6,startDate:TODAY_STR,endDate:autoEnd,extensionDays:0,holdingDays:0,holding:null,renewalHistory:[],manualStatus:null,payment:""});
    setShowForm(true);
  }
  function openEdit(m){
    setEditId(m.id);
    setForm({...m,phone:m.phone||"",phone4:m.phone4||"",manualStatus:m.manualStatus||null});
    setShowForm(true);
  }
  function saveForm(){
    if(!form.name)return;
    if(!editId&&!form.startDate)return;
    let autoEnd = form.endDate;
    if(!editId&&!autoEnd){autoEnd=form.memberType==="3month"?calc3MonthEnd(form.startDate,closures):endOfNextMonth(form.startDate);}
    const phone=form.phone||"";
    const phone4=(phone.replace(/\D/g,"")).slice(-4)||form.phone4||"";
    const e={...form,phone,phone4,endDate:autoEnd||form.endDate,total:+form.total,extensionDays:+(form.extensionDays||0),holdingDays:+(form.holdingDays||0),isNew:!!form.isNew,manualStatus:form.manualStatus||null};
    if(editId)setMembers(p=>p.map(m=>{
      if(m.id!==editId)return m;
      // 편집 시 renewalHistory 마지막 항목도 동기화 (total/날짜 불일치 버그 방지)
      const rh=m.renewalHistory||[];
      const updRH=rh.length>0?rh.map((r,i)=>i===rh.length-1?{...r,total:e.total,startDate:e.startDate,endDate:e.endDate,memberType:e.memberType}:r):rh;
      return{...m,...e,renewalHistory:updRH};
    }));
    else{const id=Math.max(...members.map(m=>m.id),0)+1;setMembers(p=>[...p,{id,...e,renewalHistory:[{id:1,startDate:e.startDate,endDate:autoEnd,total:e.total,memberType:e.memberType,payment:e.payment||""}]}]);}
    setShowForm(false);
  }
  function applyRenewal(mid,rf){
    // 갱신 시 manualStatus 초기화 — 갱신 전 수동으로 설정된 상태(renew 등)가 남지 않도록
    setMembers(p=>p.map(m=>{if(m.id!==mid)return m;return{...m,startDate:rf.startDate,endDate:rf.endDate,total:rf.total,memberType:rf.memberType,extensionDays:0,holdingDays:0,holding:null,manualStatus:null,renewalHistory:[...(m.renewalHistory||[]),{id:(m.renewalHistory?.length||0)+1,...rf}]};}));
    // 갱신 완료 시 이 회원의 renewalPending 플래그 항상 해제
    // includePending=true: 예약 유지(정상 예약으로 전환) / false: 예약 취소
    setBookings(p=>p.map(b=>{
      if(b.memberId!==mid||!b.renewalPending)return b;
      return{...b,renewalPending:false,status:rf.includePending?b.status:"cancelled"};
    }));
    setRenewT(null);setDetailM(null);
  }
  function applyHolding(mid,hd){setMembers(p=>p.map(m=>{if(m.id!==mid)return m;if(!hd)return{...m,holding:null,holdingDays:0};
    if(hd.resumed){
      const histEntry={startDate:m.holding?.startDate||hd.startDate,endDate:hd.endDate||TODAY_STR,workdays:hd.workdays};
      const newHistory=[...(m.holdingHistory||[]),histEntry];
      return{...m,holding:null,holdingDays:0,extensionDays:(m.extensionDays||0)+hd.workdays,holdingHistory:newHistory};
    }
    return{...m,holding:{startDate:hd.startDate,endDate:null,workdays:0},holdingDays:0};}));setHoldT(null);setDetailM(null);}
  function applyAdjust(mid,changes){setMembers(p=>p.map(m=>{
    if(m.id!==mid)return m;
    const rh=m.renewalHistory||[];
    // 이력이 있으면 마지막 항목 업데이트, 없으면 신규 생성
    const updRH=rh.length>0
      ?rh.map((r,i)=>{
          if(i!==rh.length-1)return r;
          const u={...r};
          if(changes.total!==undefined)u.total=changes.total;
          if(changes.startDate)u.startDate=changes.startDate;
          if(changes.endDate)u.endDate=changes.endDate;
          return u;
        })
      :[{id:1,total:changes.total??m.total,startDate:changes.startDate||m.startDate,endDate:changes.endDate||m.endDate,memberType:m.memberType}];
    return{...m,...changes,renewalHistory:updRH};
  }));}
  const {dateTimeStr}=useClock();

  return(
    <div style={S.page}>
      {/* 임시예약 회원 팝업 (로그인 후 1회) */}
      {showPendingPopup&&renewPendingMembers.length>0&&(
        <div style={S.overlay} onClick={()=>setShowPendingPopup(false)}>
          <div style={{...S.modal,maxWidth:360}} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}><span>🔔</span><div><div style={S.modalTitle}>갱신 대기 회원</div><div style={{fontSize:12,color:"#9a8e80"}}>임시 예약 처리된 회원입니다</div></div></div>
            <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:16}}>
              {renewPendingMembers.map(m=>(
                <div key={m.id} onClick={()=>{setShowPendingPopup(false);setDetailM(m);}} style={{display:"flex",alignItems:"center",gap:8,background:"#fffaeb",borderRadius:9,padding:"9px 12px",border:"1px solid #e8c44a",cursor:"pointer"}}>
                  <span style={{fontSize:16}}>{m.gender==="F"?"🧘🏻‍♀️":"🧘🏻‍♂️"}</span>
                  <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e"}}>{m.name}</span>
                  <span style={{marginLeft:"auto",fontSize:11,background:"#e8c44a",color:"#fff",borderRadius:8,padding:"2px 8px",fontWeight:700}}>갱신필요</span>
                </div>
              ))}
            </div>
            <button style={{...S.cancelBtn,width:"100%",textAlign:"center"}} onClick={()=>setShowPendingPopup(false)}>확인</button>
          </div>
        </div>
      )}

      <div style={S.header}>
        <div>
          <div style={S.logoRow}>
            <span style={{fontSize:20,color:"#5a7a5a"}}>ॐ</span>
            <span style={S.studioName}>요가피안</span>
            <span style={{fontSize:11,background:"#2e3a2e",color:"#7a9a7a",borderRadius:5,padding:"2px 7px",fontWeight:700,marginLeft:4}}>관리자</span>
          </div>
          <div style={S.sub}>{dateTimeStr}</div>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
          <button style={{...S.navBtn,fontSize:12,padding:"7px 11px",color:"#92610a",background:"#fef3c7",border:"1px solid #e8c44a",fontWeight:600}} onClick={()=>setShowNotices(true)}>📢 공지관리</button>
          <button onClick={onLogout} style={{background:"#f0ece4",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#7a6e60",cursor:"pointer",fontFamily:FONT}}>로그아웃</button>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {/* ─── 탭 전환 (출석/회원관리) ─── */}
        <div style={{display:"flex",gap:0,background:"#e8e4dc",borderRadius:11,padding:3}}>{/* ← 탭바 배경색/둥글기 */}
          {[["attendance","📋 출석"],["members","🧘🏻 회원 관리"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{border:"none",borderRadius:9,padding:"9px 14px",fontSize:13,/* ← 탭 글씨 크기 */fontWeight:tab===k?700:400,background:tab===k?"#fff":"transparent",/* ← 선택탭 배경 */color:tab===k?"#1e2e1e":"#9a8e80",/* ← 선택/비선택 글씨색 */boxShadow:tab===k?"0 1px 5px rgba(60,50,40,.12)":"none",cursor:"pointer",fontFamily:FONT,whiteSpace:"nowrap"}}>{l}</button>
          ))}
        </div>
        {tab==="members"&&<button style={{...S.addBtn,marginLeft:"auto"}} onClick={openAdd}>+ 회원 추가</button>}{/* ← 회원추가 버튼: styles.js S.addBtn 참고 */}
      </div>

      {tab==="attendance"&&<AttendanceBoard members={members} bookings={bookings} setBookings={setBookings} setMembers={setMembers} specialSchedules={specialSchedules} setSpecialSchedules={setSpecialSchedules} closures={closures} setClosures={setClosures} notices={notices} setNotices={setNotices} scheduleTemplate={scheduleTemplate} setScheduleTemplate={setScheduleTemplate} onMemberClick={(m)=>setDetailM(m)}/>}

      {tab==="members"&&(<>
        {/* ─── 상태 필터 pill ─── */}
        <div style={S.pillRow}>
          {/* ← 각 pill 활성 색상: Total=#4a4a4a / ON=#4a6a4a / RENEW=#9a5a10 / HOLD=#3d5494 / OFF=#8e3030 */}
          {[["total","Total","#4a4a4a"],["on","ON","#4a6a4a"],["renew","RENEW","#9a5a10"],["hold","HOLD","#3d5494"],["off","OFF","#8e3030"]].map(([k,l,ac])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{...S.pill,background:filter===k?ac:"#e8e4dc",/* ← 비활성 pill 배경 */color:filter===k?"#fff":"#7a6e60",fontWeight:filter===k?700:400}}>{l} <span style={{opacity:.75,fontSize:11}}>{counts[k]??0}</span></button>
          ))}
        </div>
        <div style={S.toolbar}>
          <div style={S.searchBox}><span style={{color:"#a09080",marginRight:5}}>🔍</span><input style={S.searchInput} placeholder="이름 검색" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </div>
        <div style={S.grid}>
          {filtered.length===0&&<div style={S.empty}>조건에 맞는 회원이 없습니다.</div>}
          {filtered.map(m=><MemberCard key={m.id} m={m} bookings={bookings} onDetail={()=>setDetailM(m)} onEdit={()=>openEdit(m)} onDel={()=>setDelT(m.id)}/>)}
        </div>
      </>)}

      {detailM&&<AdminDetailModal member={members.find(m=>m.id===detailM.id)||detailM} bookings={bookings} onClose={()=>setDetailM(null)} onRenew={()=>setRenewT(detailM.id)} onHolding={()=>setHoldT(detailM.id)} onAdjust={(changes)=>applyAdjust(detailM.id,changes)} onEdit={()=>{const m=members.find(x=>x.id===detailM.id)||detailM;setDetailM(null);openEdit(m);}} onDel={()=>{const id=detailM.id;setDetailM(null);setDelT(id);}}/>}
      {renewT&&<RenewalModal member={members.find(m=>m.id===renewT)} onClose={()=>setRenewT(null)} onSave={rf=>applyRenewal(renewT,rf)}/>}
      {holdT&&<HoldingModal member={members.find(m=>m.id===holdT)} onClose={()=>setHoldT(null)} onSave={hd=>applyHolding(holdT,hd)}/>}
      {showNotices&&<NoticeManager notices={notices} setNotices={setNotices} onClose={()=>setShowNotices(false)}/>}

      {showForm&&(
        <div style={S.overlay} onClick={()=>setShowForm(false)}>
          <div style={{...S.modal,maxWidth:460,/* ← 폼 모달 최대 너비 */maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{...S.modalHead,marginBottom:10}}><span>{editId?"✏️":"🌱"}</span><span style={S.modalTitle}>{editId?"회원 수정":"신규 회원 추가"}</span></div>

            {/* 성별 + 이름 한 줄 */}
            <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:10}}>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                {/* ← 성별 버튼: 선택 테두리=#4a7a5a, 선택 배경=#eef5ee / 미선택 배경=#faf8f5 */}
                {[["F",GE.F],["M",GE.M]].map(([v,icon])=>(
                  <button key={v} onClick={()=>setForm(f=>({...f,gender:v}))} style={{width:36,height:36,/* ← 버튼 크기 */borderRadius:8,border:"1.5px solid",cursor:"pointer",fontSize:18,fontFamily:FONT,lineHeight:1,borderColor:form.gender===v?"#4a7a5a":"#e0d8cc",background:form.gender===v?"#eef5ee":"#faf8f5"}}>{icon}</button>
                ))}
              </div>
              <input style={{...S.inp,marginBottom:0,flex:1}} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="회원 이름"/>
            </div>

            {/* 전화번호 단일 입력 */}
            <div style={{...S.fg}}>
              <label style={S.lbl}>전화번호</label>
              <input style={S.inp} type="tel" value={form.phone||""} onChange={e=>{
                const d=e.target.value.replace(/\D/g,"").slice(0,11); /* ← 숫자만 추출, 최대 11자리 */
                const fmt=d.length>7?d.slice(0,3)+"-"+d.slice(3,7)+"-"+d.slice(7):d.length>3?d.slice(0,3)+"-"+d.slice(3):d; /* ← 010-XXXX-XXXX 자동 포맷 */
                const p4=d.slice(-4); /* ← 로그인 비밀번호: 뒷 4자리 */
                setForm(f=>({...f,phone:fmt,phone4:p4}));
              }} placeholder="010-0000-0000"/>
              {form.phone&&<div style={{fontSize:10,color:"#9a8e80",marginTop:3}}>로그인 비밀번호: <b style={{color:"#4a4a4a"}}>{form.phone4||"-"}</b></div>}
            </div>

            {/* 어드민 전용 박스 */}
            <div style={{background:"#f5f9f5",/* ← 어드민 박스 배경색 */borderRadius:9,padding:"10px 12px",marginBottom:10,border:"1px dashed #b8d8b8"/* ← 점선 테두리색 */}}>
              <div style={{fontSize:11,fontWeight:700,color:"#3d6e45",marginBottom:6}}>👀 어드민 전용</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <div style={{flex:1}}><label style={S.lbl}>별명</label><input style={S.inp} value={form.adminNickname||""} onChange={e=>setForm(f=>({...f,adminNickname:e.target.value}))} placeholder="1호/저녁반"/></div>
                <div style={{flex:1}}><label style={S.lbl}>메모</label><input style={S.inp} value={form.adminNote||""} onChange={e=>setForm(f=>({...f,adminNote:e.target.value}))} placeholder="특이사항"/></div>
              </div>
              <div style={{marginBottom:8}}>
                <label style={S.lbl}>카드 색상</label>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <input type="color" value={form.cardColor||"#cccccc"} onChange={e=>setForm(f=>({...f,cardColor:e.target.value}))} style={{width:36,height:30,border:"1.5px solid #e0d8cc",borderRadius:6,cursor:"pointer",padding:2,background:"none"}}/>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {["#e05050","#2255cc","#e8820a","#9b30d0","#1a8a5a","#d4387a","#3d7ab5","#c0922a"].map(c=>(
                      <div key={c} onClick={()=>setForm(f=>({...f,cardColor:c}))} style={{width:20,height:20,borderRadius:"50%",background:c,cursor:"pointer",border:form.cardColor===c?"3px solid #333":"2px solid transparent"}}/>
                    ))}
                  </div>
                  {form.cardColor&&<button onClick={()=>setForm(f=>({...f,cardColor:""}))} style={{background:"none",border:"none",fontSize:10,color:"#9a8e80",cursor:"pointer",fontFamily:FONT}}>초기화</button>}
                </div>
              </div>
              <div>
                <label style={S.lbl}>상태 수동 설정</label>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {/* renew 제거: 자동 계산 상태라 수동 설정 시 갱신 후에도 갱신필요 고착되는 버그 방지 */}
                  {[["","자동","#888"],["on","ON","#4a7a5a"],["hold","HOLD","#3d5494"],["off","OFF","#a83030"]].map(([v,l,ac])=>{
                    const active=(form.manualStatus||"")===v;
                    return(<button key={v} onClick={()=>setForm(f=>({...f,manualStatus:v||null}))} style={{padding:"4px 10px",borderRadius:7,border:`1.5px solid ${active?ac:"#e0d8cc"}`,cursor:"pointer",fontSize:11,fontFamily:FONT,background:active?ac:"#faf8f5",color:active?"#fff":"#9a8e80",fontWeight:active?700:400}}>{l}</button>);
                  })}
                </div>
              </div>
            </div>

            {/* 신규 회원 토글 */}
            <div style={{...S.fg,marginBottom:10}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                <div onClick={()=>setForm(f=>({...f,isNew:!f.isNew}))} style={{width:36,height:20,borderRadius:10,background:form.isNew?"#4a6a4a":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
                  <div style={{position:"absolute",top:2,left:form.isNew?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </div>
                <span style={{color:"#4a4a4a"}}>신규 회원 (N 표시)</span>
              </label>
            </div>

            {/* 회원권 섹션 — 신규 추가 시에만 표시 */}
            {!editId&&(<>
              <div style={S.fg}><label style={S.lbl}>회원권</label><div style={{display:"flex",gap:8}}>{[["1month","1개월"],["3month","3개월"]].map(([v,l])=>(<button key={v} onClick={()=>setForm(f=>{const newEnd=v==="1month"?endOfNextMonth(f.startDate||TODAY_STR):calc3MonthEnd(f.startDate||TODAY_STR,closures);return{...f,memberType:v,total:v==="3month"?24:f.total,endDate:newEnd,payment:""};})} style={{flex:1,padding:"8px 0",borderRadius:9,border:"1.5px solid",cursor:"pointer",fontSize:13,fontFamily:FONT,borderColor:form.memberType===v?"#4a7a5a":"#e0d8cc",background:form.memberType===v?"#eef5ee":"#faf8f5",color:form.memberType===v?"#2e5c3e":"#9a8e80",fontWeight:form.memberType===v?700:400}}>{l}</button>))}</div></div>
              {/* 결제 방법: 1개월=카드/현금/네이버, 3개월=카드/현금 */}
              <div style={S.fg}><label style={S.lbl}>결제 방법</label><div style={{display:"flex",gap:8}}>{(form.memberType==="1month"?[["카드","#edf0f8","#3d5494"],["현금","#fdf3e3","#8a5510"],["네이버","#e8f4e8","#2e6e44"]]:[["카드","#edf0f8","#3d5494"],["현금","#fdf3e3","#8a5510"]]).map(([v,bg,color])=>(<button key={v} onClick={()=>setForm(f=>({...f,payment:f.payment===v?"":v}))} style={{flex:1,padding:"8px 0",borderRadius:9,border:"1.5px solid",cursor:"pointer",fontSize:13,fontFamily:FONT,borderColor:form.payment===v?color:"#e0d8cc",background:form.payment===v?bg:"#faf8f5",color:form.payment===v?color:"#9a8e80",fontWeight:form.payment===v?700:400}}>{v}</button>))}</div></div>
              <div style={{display:"flex",gap:10}}>
                <div style={{...S.fg,flex:1}}><label style={S.lbl}>총 회차</label><input style={S.inp} type="number" min="1" value={form.total||""} onChange={e=>setForm(f=>({...f,total:e.target.value}))}/></div>
                <div style={{...S.fg,flex:1}}><label style={S.lbl}>최초 등록일</label><input style={S.inp} type="date" value={form.firstDate||""} onChange={e=>setForm(f=>({...f,firstDate:e.target.value}))}/></div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <div style={{...S.fg,flex:1}}><label style={S.lbl}>시작일</label><input style={S.inp} type="date" value={form.startDate||""} onChange={e=>{const sd=e.target.value;setForm(f=>({...f,startDate:sd,endDate:f.memberType==="1month"?endOfNextMonth(sd):calc3MonthEnd(sd,closures)}));}}/></div>
                <div style={{...S.fg,flex:1}}>
                  <label style={S.lbl}>종료일{form.memberType==="3month"&&<span style={{fontSize:10,color:"#7a9a7a",marginLeft:3}}>자동</span>}</label>
                  {form.memberType==="3month"?(
                    <div style={{...S.inp,background:"#f0f8f0",color:"#3a4a3a",cursor:"default",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span>{form.endDate?fmt(form.endDate):"-"}</span>
                      <span style={{fontSize:10,color:"#7a9a7a"}}>60평일</span>
                    </div>
                  ):(
                    <input style={S.inp} type="date" value={form.endDate||""} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/>
                  )}
                </div>
              </div>
            </>)}

            <div style={S.modalBtns}><button style={S.cancelBtn} onClick={()=>setShowForm(false)}>취소</button><button style={S.saveBtn} onClick={saveForm}>저장</button></div>
          </div>
        </div>
      )}

      {delT&&(
        <div style={S.overlay} onClick={()=>setDelT(null)}>
          <div style={{...S.modal,maxWidth:280,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
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
