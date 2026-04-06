export function ContactBar(){
  return(
    <div style={{width:"100%",maxWidth:360,marginTop:24}}>
      <div style={{borderTop:"1px solid #e8e4dc",marginBottom:14}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0}}>
        <a href="https://naver.me/5MVLA70u" target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.65,flexShrink:0}}>
            <path d="M13.5 12.4L10.2 7H7v10h3.5V11.6L14 17H17V7h-3.5v5.4z" fill="#9a8e80"/>
          </svg>
          네이버 플레이스
        </a>
        <span style={{color:"#d8d4cc",fontSize:11}}>|</span>
        <a href="http://pf.kakao.com/_sAebn/chat" target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <svg width="16" height="16" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0,opacity:0.65}}>
            <ellipse cx="20" cy="18" rx="18" ry="15" fill="#8a7a50"/>
            <path d="M11 23 L8 30 L16 24.5 Z" fill="#8a7a50"/>
            <path d="M13.5 16.5 Q13.5 14.5 15 13.5 Q16.5 12.5 20 12.5 Q23.5 12.5 25 13.5 Q26.5 14.5 26.5 16.5 Q26.5 18.5 25 19.5 Q23.5 20.5 20 20.5 Q18.5 20.5 17 20 L14 22 L14.5 19.5 Q13.5 18.5 13.5 16.5 Z" fill="#f5f0e8"/>
          </svg>
          카톡채널 문의
        </a>
        <span style={{color:"#d8d4cc",fontSize:11}}>|</span>
        <a href="tel:050713769324"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <span style={{fontSize:12,opacity:0.7}}>📞</span>
          전화 문의
        </a>
      </div>
      {/* 카피라이트 문구 */}
      <div style={{textAlign:"center",marginTop:10,fontSize:10,color:"#c0b8aa"}}>
        © 2026 요가피안. All rights reserved.
      </div>
    </div>
  );
}

export function MemberContactBar(){
  return(
    <div style={{width:"100%",maxWidth:360,marginTop:24}}>
      <div style={{borderTop:"1px solid #e8e4dc",marginBottom:14}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0}}>
        <a href="https://naver.me/5MVLA70u" target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.65,flexShrink:0}}>
            <path d="M13.5 12.4L10.2 7H7v10h3.5V11.6L14 17H17V7h-3.5v5.4z" fill="#9a8e80"/>
          </svg>
          네이버 플레이스
        </a>
        <span style={{color:"#d8d4cc",fontSize:11}}>|</span>
        <a href="http://pf.kakao.com/_sAebn/chat" target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <svg width="16" height="16" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0,opacity:0.65}}>
            <ellipse cx="20" cy="18" rx="18" ry="15" fill="#8a7a50"/>
            <path d="M11 23 L8 30 L16 24.5 Z" fill="#8a7a50"/>
            <path d="M13.5 16.5 Q13.5 14.5 15 13.5 Q16.5 12.5 20 12.5 Q23.5 12.5 25 13.5 Q26.5 14.5 26.5 16.5 Q26.5 18.5 25 19.5 Q23.5 20.5 20 20.5 Q18.5 20.5 17 20 L14 22 L14.5 19.5 Q13.5 18.5 13.5 16.5 Z" fill="#f5f0e8"/>
          </svg>
          카톡채널 문의
        </a>
        <span style={{color:"#d8d4cc",fontSize:11}}>|</span>
        <a href="tel:050713769324"
          style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",fontSize:11,color:"#9a8e80",textDecoration:"none",whiteSpace:"nowrap"}}>
          <span style={{fontSize:12,opacity:0.7}}>📞</span>
          전화 문의
        </a>
      </div>
      {/* 카피라이트 문구 */}
      <div style={{textAlign:"center",marginTop:10,fontSize:10,color:"#c0b8aa"}}>
        © 2026 요가피안. All rights reserved.
      </div>
      <div style={{paddingBottom:24}}/>
    </div>
  );
}
