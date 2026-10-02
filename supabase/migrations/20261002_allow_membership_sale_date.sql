-- 연결된 월회원 매출의 날짜 수정만 허용. 기존 데이터는 변경하지 않는다.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_oneday_sale() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.oneday_booking_id IS NOT NULL OR NEW.oneday_auto OR NEW.oneday_status IS NOT NULL THEN
      RAISE EXCEPTION '원데이 연결은 출석보드에서 처리해주세요.';
    END IF;
    RETURN NEW;
  END IF;
  -- 월회원 매출의 결제일은 직접 정정 가능. 금액·연결·삭제 보호는 유지한다.
  IF TG_OP = 'UPDATE' AND OLD.oneday_booking_id IS NULL
    AND EXISTS (SELECT 1 FROM public.bookings WHERE oneday_membership_sale_id = OLD.id)
    AND (to_jsonb(NEW) - 'date' - 'updated_at') = (to_jsonb(OLD) - 'date' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  IF OLD.oneday_booking_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.bookings WHERE oneday_membership_sale_id = OLD.id) THEN
    RAISE EXCEPTION '출석과 연결된 매출입니다. 출석보드에서 확인해주세요.';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.oneday_booking_id IS DISTINCT FROM OLD.oneday_booking_id OR NEW.oneday_auto IS DISTINCT FROM OLD.oneday_auto OR NEW.oneday_status IS DISTINCT FROM OLD.oneday_status) THEN
    RAISE EXCEPTION '원데이 연결은 출석보드에서 처리해주세요.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
COMMIT;
SELECT position('to_jsonb(NEW)' IN pg_get_functiondef('public.guard_oneday_sale()'::regprocedure)) > 0 AS membership_date_edit_ready;
