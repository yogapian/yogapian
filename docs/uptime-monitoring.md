# 장애 이메일 모니터링

- 수신 주소: 사용자가 UptimeRobot에서 확인한 이메일 연락처.
- 웹사이트 모니터: https://yogapian.vercel.app
- DB 모니터: https://yogapian.vercel.app/api/health
- 주기: 5분. 장애 및 복구 이메일을 켠다. 연속 실패 조건은 서비스에서 지원하는 옵션을 확인한다.

## 배포 전 확인

2026-10-15 운영 배포 완료: `dpl_BCBZXC2LqK179Ud9nA5ZRgtY24qn`.
외부 비인증 요청으로 상태 확인 주소의 HTTP 200 및 JSON `{"status":"ok"}`와
메인 페이지의 HTTP 200을 확인했다. 기존 운영 커밋 `b93c82e`에 상태 확인 기능만
추가한 임시 디렉터리에서 CLI 배포했다. Git commit/push는 하지 않았으므로 이후
Git 기반 배포 전에 api/health.js와 vercel.json 변경을 저장소에도 반영해야 한다.
UptimeRobot 이메일 활성화 및 실제 모니터 생성 여부는 별도 확인이 필요하다.

Vercel Production 환경에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정한다.
현재 앱이 사용하는 프로젝트의 공개 anon key를 사용한다. service_role key는 사용하지 않는다.
값이 없으면 상태 확인 주소는 503을 반환한다.

배포는 사용자의 명시적 요청을 받은 뒤 진행한다. 배포 후 `/api/health`가 HTML이 아닌
JSON `{"status":"ok"}`와 HTTP 200을 반환하는지 확인한다.
UptimeRobot에는 이 주소를 별도 HTTP 모니터로 등록하고 장애/복구 이메일을 연결한다.
가능하면 `"status":"ok"` 키워드 검사도 사용해 SPA HTML 응답을 정상으로 오인하지 않도록 한다.

## 검사 범위

DB 점검은 members 테이블의 0행 조회이며 데이터를 수정하거나 회원 정보를 반환하지 않는다.
8초 내 DB 응답 실패 시 HTTP 503을 반환한다. 실시간 구독과 예약 처리 코드는 변경하지 않는다.
이 점검은 DB 연결 장애를 감지하지만 로그인·예약 저장·Realtime 전체 동작을 보장하지 않는다.
5분 점검이므로 순간 장애는 놓칠 수 있다. 이메일 활성화와 실제 배포·등록 전에는 감시가 시작되지 않는다.

## 자동 복구 (2026-10-16 준비)

- `/api/recovery`는 서버 전용 비밀키로 인증한다. Supabase 관리 토큰은 브라우저로 전달하지 않는다.
- GitHub Actions `recovery.yml`이 5분 간격으로 확인한다. 장애 발견 후 매 60초 재확인하여
  최소 5분·6회 연속으로 DB `UNHEALTHY`와 앱 상태 확인 주소의 명시적 503을 모두 확인한다.
- 서명된 관측 기록은 95초 넘게 끊기면 초기화한다. 재시작 직전에도 두 조건을 다시 확인한다.
- 느림만 발생하거나, Supabase 관리 API 상태를 알 수 없거나, 프로젝트가 정지/복구 중이면 재시작하지 않는다.
- 같은 장애에서는 한 번, 정상 복구 후 새 장애도 마지막 시도 후 24시간이 지나야 재시작한다.
- 상태는 Supabase 밖의 Actions artifact에 보관한다. 재시작 의도를 먼저 업로드하고 업로드 성공 후에만
  재시작을 요청한다. 결과 불명/타임아웃도 한 번의 시도로 계산하며 재요청하지 않는다.
- 동시 실행을 직렬화한다. 재시작 API는 이 워크플로만 호출해야 한다. 서버는 관측 증거와 현재 상태를
  검증하고, 장애별/24시간 제한은 워크플로의 영속 기록으로 적용한다.
- 최근 기록이 없거나 손상되면 안전상 자동복구를 중단한다. 임의로 artifact를 지우지 않는다.
- 재시작 후 최대 8분간 읽기 전용으로 복구를 확인한다. 미복구 시 Actions 실행이 실패하고 수동 확인이 필요하다.

### 필요한 환경 설정

Vercel Production:
- `SUPABASE_MANAGEMENT_TOKEN`: 해당 프로젝트만 접근하는 Project Settings Read-write 토큰, Secret.
- `RECOVERY_SECRET`: 무작위 서버 인증키, Secret. `VITE_` 접두사를 붙이지 않는다.
- `RECOVERY_ENABLED`: `true`일 때만 운영 재시작 허용. `false`로 변경 후 재배포하면 차단된다.

GitHub Actions secret:
- `RECOVERY_SECRET`: Vercel과 동일한 값.

코드가 main에 반영된 후 Actions에서 `Yoga app health and recovery`를 수동 실행해 정상 관측 및
`recovery-state` artifact 저장을 확인한다. 운영 DB를 일부러 중단하거나 재시작하는 테스트는 하지 않는다.
로컬 안전 조건 테스트: `node --test tests/recovery.test.mjs` (모든 재시작 요청은 가짜 응답).

### 한계와 운영 확인

GitHub 예약 실행은 지연/누락될 수 있으므로 정확히 5분 만에 재시작을 보장하지 않는다.
공개 저장소에 60일 동안 활동이 없으면 예약 워크플로가 자동 비활성화될 수 있다.
Actions 화면의 최근 실행을 정기적으로 확인하고 비활성화되면 다시 활성화한다.
장애/복구 이메일은 UptimeRobot의 DOWN/UP 알림이며, 재시작 시도 전용 이메일은 별도로 구현하지 않았다.
실제 수신까지 확인하기 전에는 이메일 전달을 보장할 수 없다.

회원 화면은 초기 데이터 로드 실패 또는 상태 점검 실패 시 연결 안내와 재시도 버튼을 표시한다.
저장 진행 중에는 새로고침 버튼을 비활성화한다. 기존 Realtime과 예약 동기화는 유지한다.
웹사이트 파일 자체가 로드되지 않으면 앱 내부 팝업도 표시할 수 없다.

## 2026-10-16 배포 검증 결과

운영 배포: `dpl_GZ3WHyLjJ9WTbrQchLhC2WuKdFzD`.
- 메인 페이지 HTTP 200, 브라우저에서 회원 로그인 화면 정상 표시.
- `/api/health`: HTTP 200, `{"status":"ok"}`.
- 인증된 `/api/recovery` observe: `appHealthy=true`, `dbStatus=ACTIVE_HEALTHY`,
  `projectStatus=ACTIVE_HEALTHY`, `eligible=false`.
- Vercel Production에 관리 토큰과 복구 비밀키 등록 확인. GitHub에도 동일한 복구 비밀키 등록.
- 초기 검증은 `RECOVERY_ENABLED=false`로 진행했다. 이후 사용자 요청으로 활성화한다.
- 운영 DB 재시작이나 데이터 변경 없이 검증했다.
- Node 안전 조건 테스트 4개 통과, Vite 운영 빌드 통과, 안내 UI 초기/오프라인/저장 중 렌더 확인.

Supabase 상태 조회에서 선택 매개변수 `timeout_ms`를 보내면 현재 API가
`expected number, received string`으로 HTTP 400을 반환했다. 해당 매개변수는 생략하고
호출자의 12초 타임아웃만 적용한 뒤 정상 상태 조회를 확인했다.

## 자동복구 활성화

사용자가 즉시 재부팅되지 않는 조건을 확인한 뒤 활성화를 요청했다.
Vercel Production의 `RECOVERY_ENABLED=true`를 적용하며 main의 예약 워크플로로 실행한다.
현재 정상이라면 관측 기록만 저장하고 재시작 단계는 건너뛴다.
운영 상태와 실행 이력: https://github.com/yogapian/yogapian/actions/workflows/recovery.yml
