# 요가피안 스튜디오 앱

## 배포 가이드 (10분이면 됩니다!)

### 1단계 — Supabase 테이블 설정
1. https://supabase.com 로그인
2. 프로젝트 선택 → **SQL Editor** 클릭
3. `supabase_setup.sql` 파일 내용 전체 복사 → 붙여넣기 → **Run** 클릭
4. 완료!

### 2단계 — GitHub에 코드 올리기
1. https://github.com 에서 새 repository 생성 (Private 가능)
2. 이 폴더 전체를 업로드
   ```
   git init
   git add .
   git commit -m "요가피안 앱 초기 배포"
   git remote add origin https://github.com/본인아이디/yogapian.git
   git push -u origin main
   ```

### 3단계 — Vercel 배포
1. https://vercel.com 가입 (무료, GitHub 계정으로 로그인)
2. **New Project** → GitHub repository 선택
3. **Environment Variables** 설정:
   - `VITE_SUPABASE_URL` = `https://bgrgmrxlahtrpgrnigid.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (Supabase 프로젝트의 anon key)
4. **Deploy** 클릭!
5. 완료! `https://yogapian.vercel.app` 같은 URL 생성됨

### 4단계 — 초기 데이터 업로드
1. 배포된 URL로 접속
2. **관리자 로그인** (PIN: 0000)
3. 상단에 "초기 업로드" 버튼 클릭
4. 회원 30명 + 출석 582건 + 공지 등 자동 업로드

---

## 관리자 정보
- PIN: `0000` (배포 후 App.jsx에서 변경 권장)

## 회원 로그인
- 이름 + 전화번호 뒷 4자리

## 비용
- Vercel: **무료**
- Supabase: **무료** (월 50만 건, 500MB)
