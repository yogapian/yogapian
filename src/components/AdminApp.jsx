import { useState, useMemo } from "react";
import { FONT, TODAY_STR, SC, GE, TYPE_CFG } from "../constants.js";
import { fmt } from "../utils.js";
import { endOfNextMonth, endOfMonth } from "../utils.js";
import { getStatus, calc3MonthEnd } from "../memberCalc.js";
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

  const counts={all:members.length,on:members.filter(m=>getStatus(m,closures)==="on").length,hold:members.filter(m=>getStatus(m,closures)==="hold").length,off:members.filter(m=>getStatus(m,closures)==="off").length};
  const filtered=useMemo(()=>members.filter(m=>{if(filter!=="all"&&getStatus(m,closures)!==filter)return false;if(search&&!m.name.includes(search))return false;return true;}).sort((a,b)=>a.name.localeCompare(b.name,"ko")),[members,filter,search,closures]);

  function openAdd(){
    const autoEnd=endOfNextMonth(TODAY_STR);
    setEditId(null);
    setForm({gender:"F",name:"",adminNickname:"",adminNote:"",cardColor:"",phone4:"",firstDate:TODAY_STR,memberType:"1month",isNew:true,total:6,startDate:TODAY_STR,endDate:autoEnd,extensionDays:0,holdingDays:0,holding:null,renewalHistory:[]});
    setShowForm(true);
  }
  function openEdit(m){setEditId(m.id);setForm({...m});setShowForm(true);}
  function saveForm(){
    if(!form.name||!form.startDate)return;
    let autoEnd = form.endDate;
    if(!autoEnd){autoEnd = form.memberType==="3month"?calc3MonthEnd(form.startDate, closures):endOfNextMonth(form.startDate);}
    const e={...form,endDate:autoEnd,total:+form.total,extensionDays:+(form.extensionDays||0),holdingDays:+(form.holdingDays||0),isNew:!!form.isNew};
    if(editId)setMembers(p=>p.map(m=>m.id===editId?{...m,...e}:m));
    else{const id=Math.max(...members.map(m=>m.id),0)+1;setMembers(p=>[...p,{id,...e,renewalHistory:[{id:1,startDate:e.startDate,endDate:autoEnd,total:e.total,memberType:e.memberType,payment:e.payment||""}]}]);}
    setShowForm(false);
  }
  function applyRenewal(mid,rf){setMembers(p=>p.map(m=>{if(m.id!==mid)return m;return{...m,startDate:rf.startDate,endDate:rf.endDate,total:rf.total,memberType:rf.memberType,extensionDays:0,holdingDays:0,holding:null,renewalHistory:[...(m.renewalHistory||[]),{id:(m.renewalHistory?.length||0)+1,...rf}]};}));setRenewT(null);setDetailM(null);}
  function applyHolding(mid,hd){setMembers(p=>p.map(m=>{if(m.id!==mid)return m;if(!hd)return{...m,holding:null,holdingDays:0};
    if(hd.resumed){
      const histEntry={startDate:m.holding?.startDate||hd.startDate,endDate:hd.endDate||TODAY_STR,workdays:hd.workdays};
      const newHistory=[...(m.holdingHistory||[]),histEntry];
      return{...m,holding:null,holdingDays:0,extensionDays:(m.extensionDays||0)+hd.workdays,holdingHistory:newHistory};
    }
    return{...m,holding:{startDate:hd.startDate,endDate:null,workdays:0},holdingDays:0};}));setHoldT(null);setDetailM(null);}
  function applyAdjust(mid,newTotal){setMembers(p=>p.map(m=>m.id!==mid?m:{...m,total:newTotal}));}
  const {dateTimeStr}=useClock();

  return(
    <div style={S.page}>
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
        <div style={{display:"flex",gap:0,background:"#e8e4dc",borderRadius:11,padding:3}}>
          {[["attendance","📋 출석"],["members","🧘🏻 회원 관리"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{border:"none",borderRadius:9,padding:"9px 14px",fontSize:13,fontWeight:tab===k?700:400,background:tab===k?"#fff":"transparent",color:tab===k?"#1e2e1e":"#9a8e80",boxShadow:tab===k?"0 1px 5px rgba(60,50,40,.12)":"none",cursor:"pointer",fontFamily:FONT,whiteSpace:"nowrap"}}>{l}</button>
          ))}
        </div>
        {tab==="members"&&<button style={{...S.addBtn,marginLeft:"auto"}} onClick={openAdd}>+ 회원 추가</button>}
      </div>

      {tab==="attendance"&&<AttendanceBoard members={members} bookings={bookings} setBookings={setBookings} setMembers={setMembers} specialSchedules={specialSchedules} setSpecialSchedules={setSpecialSchedules} closures={closures} setClosures={setClosures} notices={notices} setNotices={setNotices} scheduleTemplate={scheduleTemplate} setScheduleTemplate={setScheduleTemplate} onMemberClick={(m)=>setDetailM(m)}/>}

      {tab==="members"&&(<>
        <div style={S.pillRow}>
          {[["all","전체"],["on","ON"],["hold","HOLD"],["off","OFF"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{...S.pill,background:filter===k?"#4a6a4a":"#e8e4dc",color:filter===k?"#fff":"#7a6e60",fontWeight:filter===k?700:400}}>{l} <span style={{opacity:.75,fontSize:11}}>{counts[k]??0}</span></button>
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

      {detailM&&<AdminDetailModal member={members.find(m=>m.id===detailM.id)||detailM} bookings={bookings} onClose={()=>setDetailM(null)} onRenew={()=>setRenewT(detailM.id)} onHolding={()=>setHoldT(detailM.id)} onAdjust={(t)=>applyAdjust(detailM.id,t)}/>}
      {renewT&&<RenewalModal member={members.find(m=>m.id===renewT)} onClose={()=>setRenewT(null)} onSave={rf=>applyRenewal(renewT,rf)}/>}
      {holdT&&<HoldingModal member={members.find(m=>m.id===holdT)} onClose={()=>setHoldT(null)} onSave={hd=>applyHolding(holdT,hd)}/>}
      {showNotices&&<NoticeManager notices={notices} setNotices={setNotices} onClose={()=>setShowNotices(false)}/>}

      {showForm&&(
        <div style={S.overlay} onClick={()=>setShowForm(false)}>
          <div style={{...S.modal,maxWidth:460,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHead}><span>{editId?"✏️":"🌱"}</span><span style={S.modalTitle}>{editId?"회원 수정":"신규 회원 추가"}</span></div>
            <div style={S.fg}><label style={S.lbl}>성별</label><div style={{display:"flex",gap:10}}>{[["F","🧘🏻‍♀️","여성"],["M","🧘🏻‍♂️","남성"]].map(([v,emoji,label])=>(<button key={v} onClick={()=>setForm(f=>({...f,gender:v}))} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",borderColor:form.gender===v?"#4a7a5a":"#e0d8cc",background:form.gender===v?"#eef5ee":"#faf8f5",color:form.gender===v?"#2e5c3e":"#9a8e80",fontSize:22,display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:FONT}}><span>{emoji}</span><span style={{fontSize:11,fontWeight:600}}>{label}</span></button>))}</div></div>
            <div style={S.fg}><label style={S.lbl}>이름</label><input style={S.inp} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="회원 이름"/></div>
            <div style={S.fg}><label style={S.lbl}>전화번호 뒷 4자리</label><input style={S.inp} value={form.phone4||""} onChange={e=>setForm(f=>({...f,phone4:e.target.value.replace(/\D/g,"").slice(0,4)}))} placeholder="0000" maxLength={4} type="tel"/></div>
            <div style={{background:"#f5f9f5",borderRadius:10,padding:"12px 14px",marginBottom:12,border:"1px dashed #b8d8b8"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#3d6e45",marginBottom:7}}>👀 어드민 전용</div>
              <div style={S.fg}><label style={S.lbl}>별명 (구별용)</label><input style={S.inp} value={form.adminNickname||""} onChange={e=>setForm(f=>({...f,adminNickname:e.target.value}))} placeholder="예: 1호/저녁반"/></div>
              <div style={S.fg}>
                <label style={S.lbl}>카드 색상 <span style={{fontWeight:400,color:"#9a8e80"}}>(동명이인 구별용)</span></label>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <input type="color" value={form.cardColor||"#cccccc"} onChange={e=>setForm(f=>({...f,cardColor:e.target.value}))} style={{width:44,height:36,border:"1.5px solid #e0d8cc",borderRadius:8,cursor:"pointer",padding:2,background:"none"}}/>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {["#e05050","#2255cc","#e8820a","#9b30d0","#1a8a5a","#d4387a","#3d7ab5","#c0922a"].map(c=>(
                      <div key={c} onClick={()=>setForm(f=>({...f,cardColor:c}))} style={{width:22,height:22,borderRadius:"50%",background:c,cursor:"pointer",border:form.cardColor===c?"3px solid #333":"2px solid transparent"}}/>
                    ))}
                  </div>
                  {form.cardColor&&<button onClick={()=>setForm(f=>({...f,cardColor:""}))} style={{background:"none",border:"none",fontSize:11,color:"#9a8e80",cursor:"pointer",fontFamily:FONT}}>초기화</button>}
                </div>
              </div>
              <div style={{marginBottom:0}}><label style={S.lbl}>메모</label><input style={S.inp} value={form.adminNote||""} onChange={e=>setForm(f=>({...f,adminNote:e.target.value}))} placeholder="특이사항"/></div>
            </div>
            <div style={S.fg}><label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}><div onClick={()=>setForm(f=>({...f,isNew:!f.isNew}))} style={{width:36,height:20,borderRadius:10,background:form.isNew?"#4a6a4a":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}><div style={{position:"absolute",top:2,left:form.isNew?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></div><span style={{color:"#4a4a4a"}}>신규 회원 (N 표시)</span></label></div>
            <div style={S.fg}><label style={S.lbl}>회원권</label><div style={{display:"flex",gap:10}}>{[["1month","1개월"],["3month","3개월"]].map(([v,l])=>(<button key={v} onClick={()=>setForm(f=>{const newEnd=v==="1month"?endOfNextMonth(f.startDate||TODAY_STR):calc3MonthEnd(f.startDate||TODAY_STR,closures);return{...f,memberType:v,total:v==="3month"?24:f.total,endDate:newEnd};})} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontSize:14,fontFamily:FONT,borderColor:form.memberType===v?"#4a7a5a":"#e0d8cc",background:form.memberType===v?"#eef5ee":"#faf8f5",color:form.memberType===v?"#2e5c3e":"#9a8e80",fontWeight:form.memberType===v?700:400}}>{l}</button>))}</div></div>
            <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>총 회차</label><input style={S.inp} type="number" min="1" value={form.total||""} onChange={e=>setForm(f=>({...f,total:e.target.value}))}/></div></div>
            <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>최초 등록일</label><input style={S.inp} type="date" value={form.firstDate||""} onChange={e=>setForm(f=>({...f,firstDate:e.target.value}))}/></div></div>
            <div style={{display:"flex",gap:12}}><div style={{...S.fg,flex:1}}><label style={S.lbl}>현재 시작일</label><input style={S.inp} type="date" value={form.startDate||""} onChange={e=>{const sd=e.target.value;setForm(f=>({...f,startDate:sd,endDate:f.memberType==="1month"?endOfNextMonth(sd):calc3MonthEnd(sd,closures)}));}}/></div>
              <div style={{...S.fg,flex:1}}>
                <label style={S.lbl}>종료일{form.memberType==="3month"&&<span style={{fontSize:10,color:"#7a9a7a",marginLeft:4}}>자동계산</span>}</label>
                {form.memberType==="3month"?(
                  <div style={{...S.inp,background:"#f0f8f0",color:"#3a4a3a",cursor:"default",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span>{form.endDate?fmt(form.endDate):"-"}</span>
                    <span style={{fontSize:10,color:"#7a9a7a"}}>60평일 기준</span>
                  </div>
                ):(
                  <input style={S.inp} type="date" value={form.endDate||""} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/>
                )}
              </div>
            </div>
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
