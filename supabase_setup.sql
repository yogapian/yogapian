-- ═══════════════════════════════════════════════════════════════
-- 요가피안 스튜디오 - Supabase 테이블 설정
-- Supabase 대시보드 > SQL Editor > 이 코드 전체 붙여넣기 후 실행
-- ═══════════════════════════════════════════════════════════════

-- 1. members 테이블
create table if not exists members (
  id          integer primary key,
  gender      text    not null default 'F',
  name        text    not null,
  admin_nickname text  default '',
  admin_note  text    default '',
  phone4      text    not null default '0000',
  first_date  text    not null,
  member_type text    not null default '1month',
  is_new      boolean default false,
  total       integer default 0,
  used        integer default 0,
  start_date  text    not null,
  end_date    text    not null,
  extension_days integer default 0,
  holding_days   integer default 0,
  holding     jsonb   default null,
  renewal_history jsonb default '[]'::jsonb,
  card_color  text    default '',
  updated_at  timestamptz default now()
);

-- 2. bookings 테이블
create table if not exists bookings (
  id          integer primary key,
  date        text    not null,
  member_id   integer references members(id) on delete set null,
  oneday_name text    default '',
  time_slot   text    not null,
  walk_in     boolean default false,
  status      text    not null default 'attended',
  cancel_note text    default '',
  cancelled_by text   default '',
  updated_at  timestamptz default now()
);

-- 3. notices 테이블
create table if not exists notices (
  id          integer primary key,
  title       text    not null,
  content     text    default '',
  pinned      boolean default false,
  image_url   text    default '',
  created_at  text    not null,
  updated_at  timestamptz default now()
);

-- 4. special_schedules 테이블
create table if not exists special_schedules (
  id          integer primary key,
  date        text    not null unique,
  label       text    not null,
  active_slots jsonb  default '[]'::jsonb,
  custom_times jsonb  default '{}'::jsonb,
  updated_at  timestamptz default now()
);

-- 5. closures 테이블
create table if not exists closures (
  id          integer primary key,
  date        text    not null,
  time_slot   text    default null,
  reason      text    not null,
  updated_at  timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════
-- RLS (Row Level Security) - 앱에서 anon key로 읽기/쓰기 허용
-- ═══════════════════════════════════════════════════════════════
alter table members          enable row level security;
alter table bookings         enable row level security;
alter table notices          enable row level security;
alter table special_schedules enable row level security;
alter table closures         enable row level security;

-- anon key로 모두 허용 (앱 내 PIN/로그인으로 보안 처리)
create policy "allow_all_members"           on members           for all using (true) with check (true);
create policy "allow_all_bookings"          on bookings          for all using (true) with check (true);
create policy "allow_all_notices"           on notices           for all using (true) with check (true);
create policy "allow_all_special_schedules" on special_schedules for all using (true) with check (true);
create policy "allow_all_closures"          on closures          for all using (true) with check (true);
