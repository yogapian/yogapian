// ─── MemberDetailModal.jsx ───────────────────────────────────────────────────
// 회원이 보는 상세 모달
// 컨텐츠는 MemberDetailContent (관리자 뷰와 동일) — 관리자 전용 컨트롤 없음

import S from "../styles.js";
import MemberDetailContent from "./MemberDetailContent.jsx";

export default function MemberDetailModal({member, bookings, onClose}){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(40,35,25,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:"16px"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:440,maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 40px rgba(40,35,25,.22)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"18px 18px 12px",overflowY:"auto",flex:1}}>
          <MemberDetailContent
            member={member}
            bookings={bookings}
            onClose={onClose}
          />
        </div>
        <div style={{padding:"10px 18px",borderTop:"1px solid #f0ece4"}}>
          <button style={{...S.cancelBtn,width:"100%",textAlign:"center"}} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
