-- 기존 함수의 날짜 처리만 수정한다. 회원·예약·매출 데이터는 변경하지 않는다.
BEGIN;
DO $$
DECLARE
  definition text := pg_get_functiondef('public.sync_oneday_sale()'::regprocedure);
BEGIN
  IF position('date = CASE WHEN oneday_auto THEN NEW.date ELSE date END,' IN definition) > 0 THEN
    definition := replace(definition,
      '    UPDATE public.sales SET oneday_booking_id = NEW.id, oneday_status = next_state,',
      E'    IF linked.oneday_auto THEN linked.date := NEW.date; END IF;\n    UPDATE public.sales SET oneday_booking_id = NEW.id, oneday_status = next_state,');
    definition := replace(definition,
      'date = CASE WHEN oneday_auto THEN NEW.date ELSE date END,', 'date = linked.date,');
    IF position('linked.date := NEW.date' IN definition) = 0 THEN
      RAISE EXCEPTION '함수 내용이 예상과 다릅니다. 적용을 중단합니다.';
    END IF;
    EXECUTE definition;
  ELSIF position('linked.date := NEW.date' IN definition) = 0 THEN
    RAISE EXCEPTION '함수 내용이 예상과 다릅니다. 적용을 중단합니다.';
  END IF;
END $$;
COMMIT;
SELECT position('linked.date := NEW.date' IN pg_get_functiondef('public.sync_oneday_sale()'::regprocedure)) > 0 AS date_fix_ready;
