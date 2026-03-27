export default function KakaoBtn({style={}}){
  return(
    <a href="http://pf.kakao.com/_sAebn/chat" target="_blank" rel="noopener noreferrer"
      style={{display:"inline-flex",alignItems:"center",gap:7,background:"#FEE500",color:"#191600",borderRadius:10,padding:"9px 18px",fontSize:13,fontWeight:700,textDecoration:"none",boxShadow:"0 2px 8px rgba(0,0,0,.1)",...style}}>
      <svg width="20" height="20" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
        <ellipse cx="20" cy="18" rx="18" ry="15" fill="#391B1B"/>
        <path d="M11 23 L8 30 L16 24.5 Z" fill="#391B1B"/>
        <path d="M13.5 16.5 Q13.5 14.5 15 13.5 Q16.5 12.5 20 12.5 Q23.5 12.5 25 13.5 Q26.5 14.5 26.5 16.5 Q26.5 18.5 25 19.5 Q23.5 20.5 20 20.5 Q18.5 20.5 17 20 L14 22 L14.5 19.5 Q13.5 18.5 13.5 16.5 Z" fill="#FEE500"/>
      </svg>
      문의하기
    </a>
  );
}
