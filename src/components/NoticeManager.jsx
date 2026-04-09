import { useState } from "react";
import { FONT, TODAY_STR } from "../constants.js";
import S from "../styles.js";

export default function NoticeManager({notices,setNotices,onClose}){
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
              <div key={n.id} style={{background:n.pinned?"#fffaeb":"#f7f4ef",borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${n.pinned?"#e8c44a":"#e4e0d8"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  {n.pinned&&<span style={{fontSize:10,background:"#fef3c7",color:"#92610a",borderRadius:5,padding:"1px 6px",fontWeight:700}}>📌 고정</span>}
                  <span style={{fontSize:14,fontWeight:700,color:"#1e2e1e",flex:1}}>{n.title}</span>
                </div>
                {/* 관리자 뱃지에서는 \n을 공백으로 치환해 한 줄로 표시 — 회원 팝업은 두 줄 유지 */}
                <div style={{fontSize:12,color:"#7a6e60",marginBottom:8,lineHeight:1.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.content.replace(/\n/g," · ")}</div>
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
