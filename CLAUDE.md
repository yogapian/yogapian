# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 개발 서버 실행 (Vite, localhost:5173)
npm run build    # 프로덕션 빌드
npm run preview  # 빌드 결과 미리보기
```

테스트 프레임워크 없음. 변경 후 `npm run build`로 빌드 오류 없는지 확인할 것.

## Architecture

라우터 없이 `screen` state 값으로 화면을 전환한다. `src/App.jsx`는 루트 컴포넌트(state 관리 + screen 분기)만 담당하며, 기능별로 아래 파일로 분리되어 있다.

### 소스 파일 구조

```
src/
├── constants.js      # SCHEDULE, TIME_SLOTS, SC, GE, TYPE_CFG, BOOKING_STATUS, KR_HOLIDAYS 등 모든 상수
├── utils.js          # parseLocal, fmt, fmtWithDow, addDays, toDateStr, isHoliday, useClock 등 순수 유틸
├── memberCalc.js     # usedAsOf, getStatus, calcDL, effEnd, calc3MonthEnd, getClosureExtDays 등 회원 계산
├── context.js        # ClosuresContext + useClosures
├── styles.js         # S 스타일 객체 (전 컴포넌트 공유)
├── db.js             # Supabase 클라이언트 + DB 함수 (dbLoadAll, dbUpsert*, dbDelete*) + 변환 함수
├── App.jsx           # 루트: 커스텀 setter 정의, screen 분기, ClosuresContext.Provider
└── components/       # 22개 컴포넌트 파일
```

### 데이터 흐름

```
Supabase DB ──(초기 로드)──▶ App state (members, bookings, notices, ...)
                                   │
                   ┌───────────────┴────────────────┐
                   ▼                                ▼
            setMembers(updater)           setBookings(updater)
            setNotices(updater)           etc.
                   │                                │
                   └──────── 변경분 자동 DB upsert ──┘
```

`setMembers` / `setBookings` / `setNotices` 등은 단순 setState가 아니라 **변경된 항목만 골라서 Supabase upsert를 자동 실행하는 커스텀 setter**다 (`App` 컴포넌트 상단에 정의). 이 setter들을 props로 하위 컴포넌트에 전달한다.

### 컴포넌트 구조 (호출 흐름)

```
App (screen 분기)
 ├── MemberLoginPage
 ├── AdminLoginPage
 ├── MemberView            ← 회원 메인 (notices, bookings 요약)
 │    └── MemberReservePage ← 날짜/슬롯 선택 후 예약
 └── AdminApp              ← 관리자 전체
      ├── AttendanceBoard  ← 오늘 출석 현황, 슬롯별 명단, 관리자 취소/추가
      │    └── AttendCheckModal ← 개별 출석 확인/삭제
      ├── MemberCard       ← 회원 카드 목록
      ├── AdminDetailModal ← 회원 상세/횟수 조정
      ├── RenewalModal     ← 회원권 갱신
      ├── HoldingModal     ← 홀딩 설정
      └── NoticeManager    ← 공지사항 관리
```

### DB 테이블 ↔ 앱 state 매핑

| Supabase 테이블     | App state          | 변환 함수                        |
|--------------------|--------------------|----------------------------------|
| `members`          | `members`          | `toSnake` / `fromSnakeMember`    |
| `bookings`         | `bookings`         | `bookingToSnake` / `fromSnakeBooking` |
| `notices`          | `notices`          | `noticeToSnake` / `fromSnakeNotice` |
| `special_schedules`| `specialSchedules` | `specialToSnake` / `fromSnakeSpecial` |
| `closures`         | `closures`         | `closureToSnake` / `fromSnakeClosure` |

`appdata` 테이블은 자동로그인 키 저장에만 쓴다.

### 잔여 횟수 계산 규칙

`member.used` 필드는 사용하지 않는다. 잔여 횟수는 항상 `usedAsOf()` 함수로 계산한다:

```js
usedAsOf(memberId, targetDate, bookings, [member])
// renewalHistory 기반으로 현재 기수 startDate를 찾아
// status가 "attended" 또는 "reserved"인 booking만 카운트
```

### 회원권 종류

- `1month`: 1개월권, `total`회 고정 (보통 6~8회)
- `3month`: 3개월권, 60평일 기준 종료일 (`calc3MonthEnd()`)

### 수업 스케줄 (SCHEDULE 상수)

- 월·수: 새벽, 오전, 점심, 저녁
- 화·목: 점심, 저녁
- 금: 새벽, 오전, 저녁
- 토·일: 휴무

특별 일정(`specialSchedules`)과 휴강(`closures`)으로 재정의 가능.

### 날짜 관련 유틸

- `TODAY_STR`: `"YYYY-MM-DD"` 형식 오늘 날짜 (앱 로드 시 고정)
- `parseLocal(s)`: 문자열 → `Date` (로컬 타임존 기준, `new Date(s)` 대신 사용)
- `effEnd(m, closures)`: 홀딩/연장 반영 실제 종료일
- `calcDL(m, closures)`: 종료일까지 남은 일수 (음수면 만료)

## 에러 처리 규칙

- 에러 발생 시 초보자도 이해할 수 있는 비유로 먼저 설명
- 자동으로 코드 수정 후 재실행해서 에러가 사라졌는지 확인
- 해결될 때까지 반복

## 작업 규칙

- 필요한 함수/컴포넌트만 Grep·Read로 핀포인트 읽기 (파일 전체 읽기 지양)
- 수정 전 반드시 영향 범위 먼저 말하기
- 작업 완료 후 항상 `git commit` + `git push`

## 프로젝트 정책

### 횟수 차감

- **정규 회원**: 수업 출석(`attended`/`reserved`) 시만 1회 차감. 노쇼·취소·대기는 차감 없음
- **오픈 클래스**: 회원 횟수 차감 없음. 별도 신청, 무료 또는 유료
- **원데이**: 30,000원 고정. 3일 이내 정회원 전환 시 원데이 비용 차감

### 정원

수업별 `capacity` 필드로 관리. 전역 `SLOT_LIMIT` 상수 사용 금지.

### 환불

원데이만 적용: 당일 0%, 1일 전 50%, 2일 전 100%.

### 예약 불가 조건

수업 시작 후 / 과거 날짜 / 기간 만료 / 홀딩 중 / 같은 날 같은 슬롯 중복

### 홀딩

1개월권 불가. 3개월권만 가능. 홀딩 일수만큼 종료일 자동 연장.

### 휴강

- **정기 휴강**: 연장 없음 (`extensionOverride = 0`)
- **별도 휴강**: 연장 있음 (`extensionOverride > 0`, 해당 일수만큼 종료일 연장)
