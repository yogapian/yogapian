import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// 서비스워커 등록 — PWA 설치 버튼 + 웹 푸시
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW register:', e));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* 로컬(npm run dev)도 실서버와 같은 Supabase DB를 사용 — 실수 방지용 경고 배너, 빌드 시(import.meta.env.DEV=false)엔 안 보임 */}
    {import.meta.env.DEV && (
      <div style={{background:"#c0392b",color:"#fff",textAlign:"center",padding:"6px 10px",fontSize:12,fontWeight:700,fontFamily:"sans-serif"}}>
        ⚠️ 실서버 DB 연결됨 — 여기서 저장/삭제하면 실제 데이터가 바뀝니다
      </div>
    )}
    <App />
  </StrictMode>
)
