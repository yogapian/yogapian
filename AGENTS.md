# Yogapian Codex 작업 지침

## 프로젝트 개요

이 프로젝트는 **React 18 + Vite + Supabase** 기반의 요가원 회원·예약 관리 앱이다. 별도 서버 백엔드 없이 브라우저 앱이 Supabase와 직접 동기화하며, 실제 운영 Supabase DB에 연결되어 있다.

변경 전에는 요청과 관련된 화면 컴포넌트뿐 아니라 도메인 계산 로직과 데이터 저장 경로를 먼저 확인한다. 변경 범위는 최소화하고, 기존 데이터·상태 구조와 비즈니스 규칙을 우선 보존한다.

## 회원권·잔여 횟수

- 회원권의 계산 원본은 `member.used`가 아니라 `renewalHistory`와 `bookings`다.
- `member.used`를 직접 읽어 잔여 횟수를 계산하거나, 직접 수정하지 않는다.
- 잔여 횟수와 사용 횟수는 반드시 `usedAsOf()` 및 `activePeriodTotal()`을 통해 대상 날짜 기준으로 계산한다.
- `renewalHistory`는 단순 표시 이력이 아니다. 기수별 총 회차, 시작·종료일, 사전 갱신, 시작일 미정 기수 및 기수 간 이월 계산의 원본이다.
- `renewalHistory`의 구조나 의미를 임의로 변경하지 않는다.

## 예약·출석·노쇼

- 기본 사용 횟수에는 `status === "attended"`인 예약만 포함된다.
- `reserved`, `waiting`, `cancelled`는 기본 사용 횟수에 포함하지 않는다.
- 예약·대기·취소만으로 횟수를 차감하지 않는다. 출석 확정 시에만 `attended`가 되어 `usedAsOf()` 계산에 반영된다.
- 노쇼는 출석 횟수와 별도로 관리한다. `cancelledBy: "noshow"` 기록과 `noshowPenalties`/`noshowThresholdAck`의 패널티 흐름을 임의로 합치거나 단순화하지 않는다.
- 잔여 0회 또는 만료 상황의 임시 예약은 `renewalPending: true`를 사용한다. 이 플래그와 갱신 시의 처리 흐름을 변경하지 않는다.
- `renewalPending` 예약은 일반 예약으로 간주해 임의로 제거·정상화하지 않는다.

## 회원권 유형·홀딩·휴강

- 1개월권과 3개월권의 기간, 회차, 노쇼 임계값, 결제수단 및 홀딩 정책은 기존 구현을 보존한다. 정책 변경은 명시적 요구사항 없이는 하지 않는다.
- 홀딩은 기존 `holding`, `holdingHistory`, `totalHoldingCalendarDays()`, `effEnd()` 흐름을 통해서만 처리한다.
- 홀딩 이력과 기수별 기간 연장 계산을 이전의 단순 `extensionDays` 누적 방식으로 되돌리지 않는다.
- 휴강은 `closures`의 전체/부분 휴강 구분과 `extensionOverride`를 유지한다. 종료일·연장일 계산은 `getClosureExtDays()`, `effEnd()`, `calcDL()` 등 기존 함수를 사용한다.
- 기존 규칙 문서와 실제 코드가 다를 때는 임의로 한쪽을 정답으로 정해 수정하지 말고, 차이를 사용자에게 먼저 보고한다.

## 시간표·정원

- 수업 정원은 반드시 `getSlotCapacity(date, slotKey, specialSchedules, scheduleTemplate)`로 계산한다.
- 전역 정원 상수 또는 숫자 하드코딩으로 정원 계산을 구현하지 않는다.
- 정원 점유에는 `attended`와 `reserved`만 포함하며, `waiting`은 별도 대기 순번으로 관리한다.
- `scheduleTemplate`, `specialSchedules`, 슬롯별 정원 및 시간 오버라이드의 구조를 임의로 변경하지 않는다.

## 날짜 처리

- 날짜 문자열(`YYYY-MM-DD`) 파싱에는 반드시 `parseLocal()`을 사용한다.
- `new Date("YYYY-MM-DD")`와 같은 문자열 직접 파싱을 사용하지 않는다. 시간대에 따라 날짜가 밀릴 수 있다.
- 날짜 계산은 KST 기준을 유지하고, 기존 `TODAY_STR`, `TODAY`, `addDays()`, `fmtWithDow()` 등의 공통 유틸리티를 우선 사용한다.

## 화면 구조·Supabase 동기화

- 이 앱은 React Router를 사용하지 않는다. 화면 전환은 `App.jsx`의 `screen` state 분기로 유지한다.
- `setMembers`, `setBookings`, `setNotices`, `setSpecialSchedules`, `setClosures`, `setSales`, `setScheduleTemplate`은 일반 React setter가 아니다. 변경분을 Supabase에 upsert/delete하는 커스텀 동기화 setter다.
- 도메인 데이터를 변경할 때는 전달받은 커스텀 setter를 사용한다. `App.jsx`의 내부 `set*State`는 초기 로드·Realtime 수신·임시 예약 ID 교체처럼 이미 정해진 내부 경로에서만 사용한다.
- 신규 예약의 음수 임시 ID → Supabase 실제 ID 교체, 중복 예약 방지, Realtime 수신, 저장 중 새로고침 방어 흐름을 훼손하지 않는다.
- `renewalHistory`, `renewalPending`, `holdingHistory` 및 예약 상태 데이터 구조는 하위 호환 검토 없이 이름·타입·의미를 바꾸지 않는다.

## 운영 데이터·Git 안전 규칙

- 개발 서버도 실제 운영 Supabase DB에 연결된다.
- 테스트 또는 확인 목적으로 회원, 예약, 출석, 공지, 매출 등 운영 데이터를 임의로 생성·수정·삭제하지 않는다.
- DB 스키마 변경이나 데이터 삭제는 사용자의 명시적 승인 없이는 수행하지 않는다.
- 사용자의 명시적 요청 없이 Git commit, push, deploy를 하지 않는다.
- 기존 기능을 수정하기 전 관련 컴포넌트, `memberCalc.js`, `db.js`, `App.jsx`, 그리고 이 문서 및 `CLAUDE.md`를 먼저 확인한다.
- 규칙 충돌, 문서 노후화, 스키마 불확실성, 또는 변경 영향이 불명확한 경우에는 구현을 진행하지 말고 발견 사실과 선택지를 사용자에게 먼저 알린다.
