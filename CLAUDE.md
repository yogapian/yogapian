# CLAUDE.md

## ⚠️ 절대 규칙 (위반 시 버그)
- 잔여 횟수: `member.used` 직접 수정 금지 → 항상 `usedAsOf()` 사용
- 날짜 파싱: `new Date(s)` 금지 → 항상 `parseLocal(s)` 사용
- 정원 계산: 전역 `SLOT_LIMIT` 금지 → `getSlotCapacity()` 사용
- screen 전환: 라우터 없음 → `screen` state 값으로만 분기

## 비즈니스 규칙
- 횟수 차감: 출석 처리 시에만. 예약·취소·노쇼 차감 없음
- 홀딩: 3개월권만 가능, 1회 제한
- 잔여 0회 예약: `renewalPending:true` 플래그로 임시 booking 생성 (차감 아님)
- RENEW 탭 조건: 잔여 0 OR `calcDL<0` OR `renewalPending:true` booking 존재
- 휴강: 정기(연장 없음) vs 별도(`extensionOverride` 일수만큼 종료일 연장)
- `setMembers` / `setBookings` 등 커스텀 setter → 변경분 자동 Supabase upsert (단순 setState 아님)

## 작업 방식
- 확인 없이 저장 및 즉시 실행 → 완료 후 결과만 보고
- 에러 시 즉시 수정 → 빌드 통과까지 자동 진행
- 완료 후 `npm run build` → `git commit` + `git push` 자동 실행
- **예외 (이것만 먼저 확인)**: DB 스키마 변경, 데이터 삭제
- 코드 수정 시 수정에 대한 주석 같이 수정할 것. 