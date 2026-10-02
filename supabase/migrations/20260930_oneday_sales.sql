-- 일반 원데이 매출 연결. 기존 행은 미분류로 유지하며 과거 매출을 소급 생성하지 않는다.
-- 기존 호출자의 RLS 권한을 유지한다. 운영 데이터 INSERT/UPDATE/DELETE는 실행하지 않는다.
-- 아래 전체를 SQL Editor의 새 쿼리에 붙여 넣고 Run을 누른다.
BEGIN;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS oneday_source text CHECK (oneday_source IN ('general','obut')),
  ADD COLUMN IF NOT EXISTS oneday_mode text CHECK (oneday_mode IN ('standalone','membership')),
  ADD COLUMN IF NOT EXISTS oneday_payment text,
  ADD COLUMN IF NOT EXISTS oneday_sale_id bigint REFERENCES public.sales(id),
  ADD COLUMN IF NOT EXISTS oneday_membership_sale_id bigint REFERENCES public.sales(id);
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS oneday_booking_id bigint,
  ADD COLUMN IF NOT EXISTS oneday_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS oneday_status text CHECK (oneday_status IN ('active','included','cancelled'));
CREATE UNIQUE INDEX IF NOT EXISTS bookings_oneday_sale_unique ON public.bookings(oneday_sale_id) WHERE oneday_sale_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_oneday_membership_sale_unique ON public.bookings(oneday_membership_sale_id) WHERE oneday_membership_sale_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_oneday_booking_unique ON public.sales(oneday_booking_id) WHERE oneday_booking_id IS NOT NULL;

-- sales의 기존 연번 방식에 의존하지 않고, 자동 원데이 매출은 예약 ID의 음수를 사용한다.
-- 기존 음수 ID와 충돌하면 덮어쓰지 않고 저장을 중단한다.
CREATE OR REPLACE FUNCTION public.sync_oneday_sale() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  linked public.sales%ROWTYPE;
  monthly public.sales%ROWTYPE;
  next_state text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.oneday_sale_id IS NOT NULL OR OLD.oneday_membership_sale_id IS NOT NULL THEN
      RAISE EXCEPTION '매출이 연결된 원데이는 삭제할 수 없습니다. 출석 취소로 처리해주세요.';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.oneday_sale_id IS NOT NULL AND (NEW.oneday_sale_id IS DISTINCT FROM OLD.oneday_sale_id OR NEW.oneday_source IS DISTINCT FROM OLD.oneday_source) THEN
      RAISE EXCEPTION '연결된 원데이 매출은 변경하거나 해제할 수 없습니다. 월회원 전환은 월회비 포함을 선택해주세요.';
    END IF;
    -- 기존 회원 연결 경로에서도 일반 원데이 비용을 이중 계산하지 않는다.
    IF NEW.oneday_source = 'general' AND NEW.member_id IS NOT NULL AND OLD.member_id IS NULL THEN
      NEW.oneday_mode := 'membership';
    END IF;
  END IF;
  IF NEW.oneday_source IS NULL THEN
    IF NEW.oneday_sale_id IS NOT NULL OR NEW.oneday_membership_sale_id IS NOT NULL THEN
      RAISE EXCEPTION '매출을 연결하려면 일반 원데이를 선택해주세요.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.oneday_source = 'obut' THEN
    IF NEW.oneday_sale_id IS NOT NULL OR NEW.oneday_membership_sale_id IS NOT NULL THEN
      RAISE EXCEPTION '오붓은 개별 매출을 연결하지 않습니다.';
    END IF;
    NEW.oneday_mode := NULL;
    NEW.oneday_payment := NULL;
    RETURN NEW;
  END IF;
  IF NEW.oneday_mode IS NULL OR NEW.oneday_mode NOT IN ('standalone','membership') THEN
    RAISE EXCEPTION '일반 원데이 이용 구분을 선택해주세요.';
  END IF;
  IF NEW.member_id IS NOT NULL AND NEW.oneday_mode <> 'membership' THEN
    RAISE EXCEPTION '회원과 연결된 일반 원데이는 월회비 포함으로 처리해주세요.';
  END IF;
  IF NEW.oneday_mode <> 'membership' AND NEW.oneday_membership_sale_id IS NOT NULL THEN
    RAISE EXCEPTION '원데이만 이용하는 경우 월회원권 매출을 연결할 수 없습니다.';
  END IF;
  IF NEW.oneday_membership_sale_id IS NOT NULL THEN
    SELECT * INTO monthly FROM public.sales WHERE id = NEW.oneday_membership_sale_id FOR UPDATE;
    IF NOT FOUND OR monthly.type NOT IN ('new_member','renewal') OR monthly.amount < 30000 OR monthly.oneday_status IN ('included','cancelled') THEN
      RAISE EXCEPTION '3만원이 포함된 월회원권 전체 매출을 선택해주세요.';
    END IF;
    IF NEW.member_id IS NOT NULL AND monthly.member_id IS DISTINCT FROM NEW.member_id THEN
      RAISE EXCEPTION '연결된 회원의 월회원권 매출을 선택해주세요.';
    END IF;
  END IF;
  IF NEW.oneday_sale_id IS NOT NULL THEN
    SELECT * INTO linked FROM public.sales WHERE id = NEW.oneday_sale_id FOR UPDATE;
    IF NOT FOUND OR linked.type <> 'oneday' OR linked.amount <> 30000 THEN
      RAISE EXCEPTION '기존 일반 원데이 3만원 매출을 선택해주세요.';
    END IF;
    IF linked.oneday_booking_id IS NOT NULL AND linked.oneday_booking_id <> NEW.id THEN
      RAISE EXCEPTION '다른 출석에 이미 연결된 매출입니다.';
    END IF;
  ELSIF NEW.oneday_mode = 'standalone' AND NEW.status = 'attended' THEN
    -- 출석·자동 매출을 같은 트랜잭션에서 저장한다. 재시도에도 같은 ID를 사용한다.
    IF NEW.id <= 0 THEN RAISE EXCEPTION '실제 예약 ID가 필요합니다.'; END IF;
    IF EXISTS (SELECT 1 FROM public.sales WHERE id = -NEW.id) THEN
      RAISE EXCEPTION '자동 매출 ID가 기존 매출과 충돌합니다. 기존 매출 연결을 이용해주세요.';
    END IF;
    INSERT INTO public.sales (id,date,type,member_id,member_name,member_type,total,amount,payment,memo,oneday_booking_id,oneday_auto,oneday_status,updated_at)
    VALUES (-NEW.id,NEW.date,'oneday',NULL,NEW.oneday_name,NULL,NULL,30000,COALESCE(NEW.oneday_payment,'네이버'),'출석보드 자동 등록',NEW.id,true,'active',now())
    RETURNING * INTO linked;
    NEW.oneday_sale_id := linked.id;
  END IF;
  IF NEW.oneday_sale_id IS NOT NULL THEN
    next_state := CASE WHEN NEW.oneday_mode = 'membership' THEN 'included'
      WHEN linked.oneday_auto AND NEW.status <> 'attended' THEN 'cancelled' ELSE 'active' END;
    -- sales.date의 실제 타입으로 먼저 변환한다 (운영 text / 예약 date 호환).
    IF linked.oneday_auto THEN linked.date := NEW.date; END IF;
    UPDATE public.sales SET oneday_booking_id = NEW.id, oneday_status = next_state,
      payment = CASE WHEN oneday_auto THEN COALESCE(NEW.oneday_payment,'네이버') ELSE payment END,
      date = linked.date,
      updated_at = now()
    WHERE id = NEW.oneday_sale_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_oneday_sale ON public.bookings;
CREATE TRIGGER sync_oneday_sale BEFORE INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_oneday_sale();

-- 연결된 매출을 매출 화면에서 삭제·금액 변경해 출석 연결을 깨뜨리지 않도록 한다.
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
  -- 월회원 매출의 결제일과 결제수단은 직접 정정 가능. 금액·연결·삭제 보호는 유지한다.
  IF TG_OP = 'UPDATE' AND OLD.oneday_booking_id IS NULL
    AND EXISTS (SELECT 1 FROM public.bookings WHERE oneday_membership_sale_id = OLD.id)
    AND (to_jsonb(NEW) - 'date' - 'payment' - 'updated_at') = (to_jsonb(OLD) - 'date' - 'payment' - 'updated_at') THEN
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
DROP TRIGGER IF EXISTS guard_oneday_sale ON public.sales;
CREATE TRIGGER guard_oneday_sale BEFORE INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.guard_oneday_sale();
NOTIFY pgrst, 'reload schema';
COMMIT;

-- 결과의 두 값이 모두 true이면 적용 완료. 기존 데이터는 그대로 보존된다.
SELECT
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.bookings'::regclass AND tgname='sync_oneday_sale' AND tgenabled='O') AS booking_trigger_ready,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.sales'::regclass AND tgname='guard_oneday_sale' AND tgenabled='O') AS sale_guard_ready;
