import { useState } from "react";
import { FONT, TODAY_STR } from "../constants.js";
import { getDisplayStatus } from "../memberCalc.js";
import { useClosures } from "../context.js";
import S from "../styles.js";

export default function NoticeManager({notices,setNotices,members=[],bookings=[],onClose}){
  const closures=useClosures();
  const [form,setForm]=useState(null);
  const [editId,setEditId]=useState(null);

  function openAdd(){
    setEditId(null);
    setForm({title:"",content:"",pinned:false,isPopup:false,popupTargetType:"all",popupTargetDate:TODAY_STR});
  }
  function openEdit(n){
    setEditId(n.id);
    setForm({title:n.title,content:n.content,pinned:n.pinned,isPopup:n.isPopup??false,popupTargetType:n.popupTargetType||"all",popupTargetDate:n.popupTargetDate||TODAY_STR});
  }
  function save(){
    if(!form.title)return;
    const base={...form};
    if(!base.isPopup){base.popupTargetType=null;base.popupTargetDate=null;}
    if(base.popupTargetType!=="date")base.popupTargetDate=null;
    if(editId){setNotices(p=>p.map(n=>n.id===editId?{...n,...base}:n));}
    else{const nid=Math.max(...notices.map(n=>n.id),0)+1;setNotices(p=>[...p,{id:nid,...base,createdAt:TODAY_STR}]);}
    setForm(null);
  }

  // 팝업 대상 회원 수 미리보기
  function targetCount(){
    if(!form.isPopup) return null;
    if(form.popupTargetType==="all"){
      return members.filter(m=>{const s=getDisplayStatus(m,closures,bookings);return s==="on"||s==="renew";}).length;
    }
    if(form.popupTargetType==="date"&&form.popupTargetDate){
      const mids=new Set(bookings.filter(b=>b.date===form.popupTargetDate&&b.status!=="cancelled"&&b.memberId).map(b=>b.memberId));
      return mids.size;
    }
    return null;
  }

  const cnt=form?targetCount():null;

  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:440,maxHeight:"85vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{...S.modalHead,justifyContent:"space-between"}}>
          <div style={S.modalHead}><span style={{fontSize:20}}>📢</span><span style={S.modalTitle}>공지사항 관리</span></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:"#9a8e80",cursor:"pointer"}}>×</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {!form&&(<>
            <button onClick={openAdd} style={{...S.saveBtn,width:"100%",marginBottom:12,textAlign:"center"}}>+ 새 공지 작성</button>
            {notices.length===0&&<div style={{textAlign:"center",color:"#b0a090",fontSize:13,padding:"20px 0"}}>공지사항이 없습니다.</div>}
            {notices.map(n=>(
              <div key={n.id} style={{background:n.pinned?"#fffaeb":n.isPopup?"#f0f4ff":"#f7f4ef",borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${n.pinned?"#e8c44a":n.isPopup?"#c0ccf0":"#e4e0d8"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  {n.pinned&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:5,padding:"1px 6px",fontWeight:700}}>📌 고정</span>}
                  {n.isPopup&&<span style={{fontSize:10,background:"#e8eeff",color:"#3d5494",borderRadius:5,padding:"1px 6px",fontWeight:700}}>🔔 팝업</span>}
                  {n.isPopup&&n.popupTargetType==="date"&&n.popupTargetDate&&<span style={{fontSize:10,background:"#f0f0f0",color:"#666",borderRadius:5,padding:"1px 6px"}}>{n.popupTargetDate}</span>}
                  <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e",flex:1}}>{n.title}</span>
                </div>
                <div style={{fontSize:12,color:"#7a6e60",marginBottom:8,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{n.content}</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>openEdit(n)} style={{...S.editBtn,fontSize:11,padding:"4px 10px"}}>수정</button>
                  <button onClick={()=>setNotices(p=>p.filter(x=>x.id!==n.id))} style={{...S.delBtn,fontSize:11,padding:"4px 10px"}}>삭제</button>
                  {!n.isPopup&&<button onClick={()=>setNotices(p=>p.map(x=>x.id===n.id?{...x,pinned:!x.pinned}:x))} style={{fontSize:11,background:"#fdf3e3",color:"#9a5a10",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontFamily:FONT}}>{n.pinned?"고정해제":"고정"}</button>}
                </div>
              </div>
            ))}
          </>)}
          {form&&(<>
            <div style={S.fg}><label style={S.lbl}>제목</label><input style={S.inp} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="공지 제목"/></div>
            <div style={S.fg}><label style={S.lbl}>내용</label><textarea style={{...S.inp,height:90,resize:"vertical"}} value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="공지 내용 (선택)"/></div>

            {/* 팝업 토글 */}
            <div style={S.fg}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                <div onClick={()=>setForm(f=>({...f,isPopup:!f.isPopup}))} style={{width:38,height:20,borderRadius:10,background:form.isPopup?"#3d5494":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
                  <div style={{position:"absolute",top:2,left:form.isPopup?19:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </div>
                <span style={{color:"#3d5494",fontWeight:form.isPopup?700:400}}>🔔 팝업으로 보내기</span>
              </label>
            </div>

            {/* 팝업 대상 선택 */}
            {form.isPopup&&(
              <div style={{background:"#f0f4ff",borderRadius:10,padding:"12px 14px",marginBottom:12,border:"1px solid #c0ccf0"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#3d5494",marginBottom:10}}>발송 대상</div>
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  {[["all","전체 수강중"],["date","특정일 예약자"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setForm(f=>({...f,popupTargetType:v}))}
                      style={{flex:1,padding:"8px 0",borderRadius:9,border:"1.5px solid",cursor:"pointer",fontSize:13,fontFamily:FONT,
                        borderColor:form.popupTargetType===v?"#3d5494":"#c0ccf0",
                        background:form.popupTargetType===v?"#e8eeff":"#fff",
                        color:form.popupTargetType===v?"#3d5494":"#9a8e80",
                        fontWeight:form.popupTargetType===v?700:400}}>{l}</button>
                  ))}
                </div>
                {form.popupTargetType==="date"&&(
                  <div>
                    <div style={{fontSize:11,color:"#9a8e80",marginBottom:4}}>해당 날짜</div>
                    <input type="date" value={form.popupTargetDate} onChange={e=>setForm(f=>({...f,popupTargetDate:e.target.value}))} style={{...S.inp,fontSize:13,padding:"7px 9px"}}/>
                  </div>
                )}
                {cnt!==null&&<div style={{fontSize:11,color:"#3d5494",marginTop:8,fontWeight:600}}>약 {cnt}명에게 표시됩니다</div>}
              </div>
            )}

            {!form.isPopup&&(
              <div style={S.fg}>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                  <div onClick={()=>setForm(f=>({...f,pinned:!f.pinned}))} style={{width:38,height:20,borderRadius:10,background:form.pinned?"#4a6a4a":"#ddd",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
                    <div style={{position:"absolute",top:2,left:form.pinned?19:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                  </div>
                  <span style={{color:"#4a4a4a"}}>상단 고정 (중요 공지)</span>
                </label>
              </div>
            )}

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
