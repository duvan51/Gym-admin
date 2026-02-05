-- ==========================================
-- Schema for 'Desarrollando Ando' Gym SaaS
-- ==========================================

-- 1. Enable necessary extensions
create extension if not exists "uuid-ossp";

-- ==========================================
-- 2. Create Tables
-- ==========================================

-- SaaS Plans (SuperAdmin manages these)
create table if not exists public.saas_plans (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    price_cop numeric not null,
    gym_limit int not null, -- Max users allowed? Or strictly gym count if this logic was different? Assuming plan attributes.
    duration_days int not null,
    created_at timestamptz default now()
);

-- Gyms (Tenants)
create table if not exists public.gyms (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    owner_name text,
    status text check (status in ('active', 'inactive')) default 'active',
    plan_id uuid references public.saas_plans(id),
    start_date timestamptz default now(),
    end_date timestamptz,
    created_at timestamptz default now()
);

-- Profiles (Extends auth.users)
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    gym_id uuid references public.gyms(id),
    role text check (role in ('superadmin', 'admin', 'user')) default 'user',
    full_name text,
    avatar_url text,
    activity_level text,
    fitness_goals text[], -- Array of strings
    level int default 1,
    xp int default 0,
    streak int default 0,
    updated_at timestamptz
);

-- Biometrics (Initial physical profile)
create table if not exists public.biometrics (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    sex text check (sex in ('male', 'female', 'other')),
    height_cm numeric,
    initial_weight_kg numeric,
    age int,
    target_weight_kg numeric,
    location text,
    habits text[],
    created_at timestamptz default now()
);

-- Measurements History (Periodic tracking)
create table if not exists public.measurements_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles(id) on delete cascade not null,
    created_at timestamptz default now(),
    weight_kg numeric,
    neck_cm numeric,
    chest_cm numeric,
    waist_cm numeric,
    hips_cm numeric,
    note text
);

-- Memberships (Gym internal plans for athletes)
create table if not exists public.memberships (
    id uuid primary key default gen_random_uuid(),
    gym_id uuid references public.gyms(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    plan_name text not null,
    status text check (status in ('active', 'inactive', 'expired')) default 'active',
    price_cop numeric,
    expiry_date timestamptz,
    last_payment_date timestamptz,
    created_at timestamptz default now()
);

-- Posts (Community Feed)
create table if not exists public.posts (
    id uuid primary key default gen_random_uuid(),
    gym_id uuid references public.gyms(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    content text,
    image_url text,
    tag text,
    likes_count int default 0,
    created_at timestamptz default now()
);

-- ==========================================
-- 3. Row Level Security (RLS)
-- ==========================================

-- Enable RLS on all tables
alter table public.saas_plans enable row level security;
alter table public.gyms enable row level security;
alter table public.profiles enable row level security;
alter table public.biometrics enable row level security;
alter table public.measurements_history enable row level security;
alter table public.memberships enable row level security;
alter table public.posts enable row level security;

-- Helper Functions for Auth/Role checks
create or replace function public.get_my_role()
returns text as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$ language sql security definer;

create or replace function public.get_my_gym_id()
returns uuid as $$
  select gym_id from public.profiles where id = auth.uid() limit 1;
$$ language sql security definer;

create or replace function public.is_superadmin()
returns boolean as $$
  select (get_my_role() = 'superadmin');
$$ language sql security definer;

create or replace function public.is_gym_admin_of(resource_gym_id uuid)
returns boolean as $$
  select (get_my_role() = 'admin' and get_my_gym_id() = resource_gym_id);
$$ language sql security definer;

-- POLICIES

-- saas_plans:
-- SuperAdmin: All access
-- Public/Authenticated: Read-only (To see available plans)
create policy "SuperAdmin full access saas_plans" on public.saas_plans
  for all using (is_superadmin());

create policy "Everyone can view saas_plans" on public.saas_plans
  for select using (true);


-- gyms:
-- SuperAdmin: All access
-- Gym Admin: Read/Update own gym
create policy "SuperAdmin full access gyms" on public.gyms
  for all using (is_superadmin());

create policy "Gym Admin view/update own gym" on public.gyms
  for all using (is_gym_admin_of(id));

-- profiles:
-- SuperAdmin: All access
-- Gym Admin: View/Update profiles in their gym
-- User: View/Update own profile. View others in same gym (for community features usually, assuming public profile info)
create policy "SuperAdmin full access profiles" on public.profiles
  for all using (is_superadmin());

create policy "Gym Admin manage profiles in gym" on public.profiles
  for all using (is_gym_admin_of(gym_id));

create policy "User view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "User update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "User view colleagues" on public.profiles
  for select using (gym_id = get_my_gym_id());


-- biometrics:
-- SuperAdmin: All access
-- Gym Admin: View/Update biometrics of their gym members
-- User: View/Update own
create policy "SuperAdmin full access biometrics" on public.biometrics
  for all using (is_superadmin());

create policy "Gym Admin manage biometrics in gym" on public.biometrics
  for all using (
    exists (select 1 from public.profiles where id = biometrics.user_id and gym_id = get_my_gym_id() and get_my_role() = 'admin')
  );

create policy "User manage own biometrics" on public.biometrics
  for all using (auth.uid() = user_id);


-- measurements_history:
-- SuperAdmin: All access
-- Gym Admin: View/Update for their gym
-- User: View/Update own
create policy "SuperAdmin full access measurements" on public.measurements_history
  for all using (is_superadmin());

create policy "Gym Admin manage measurements in gym" on public.measurements_history
  for all using (
    exists (select 1 from public.profiles where id = measurements_history.user_id and gym_id = get_my_gym_id() and get_my_role() = 'admin')
  );

create policy "User manage own measurements" on public.measurements_history
  for all using (auth.uid() = user_id);


-- memberships:
-- SuperAdmin: All access
-- Gym Admin: View/Update for their gym
-- User: View own
create policy "SuperAdmin full access memberships" on public.memberships
  for all using (is_superadmin());

create policy "Gym Admin manage memberships" on public.memberships
  for all using (gym_id = get_my_gym_id() and get_my_role() = 'admin');

create policy "User view own membership" on public.memberships
  for select using (auth.uid() = user_id);


-- posts:
-- SuperAdmin: All access
-- Gym Admin: Manage posts in their gym
-- User: View posts in their gym, Create/Edit/Delete own posts
create policy "SuperAdmin full access posts" on public.posts
  for all using (is_superadmin());

create policy "Gym Admin manage posts in gym" on public.posts
  for all using (gym_id = get_my_gym_id() and get_my_role() = 'admin');

create policy "User view posts in gym" on public.posts
  for select using (gym_id = get_my_gym_id());

create policy "User create posts in gym" on public.posts
  for insert with check (gym_id = get_my_gym_id() and auth.uid() = user_id);

create policy "User update/delete own posts" on public.posts
  for update using (auth.uid() = user_id);

create policy "User delete own posts" on public.posts
  for delete using (auth.uid() = user_id);


-- ==========================================
-- 4. Triggers & Functions
-- ==========================================

-- Auth Trigger: Automatically create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    coalesce((new.raw_user_meta_data->>'role')::text, 'user') -- Default to user if not specified
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger definition
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ==========================================
-- 5. Views
-- ==========================================

-- Expiring Memberships (Expires in < 7 days from now)
create or replace view public.expiring_memberships_view as
select 
    m.id as membership_id,
    m.user_id,
    p.full_name,
    p.gym_id,
    m.plan_name,
    m.expiry_date,
    (m.expiry_date - now()) as time_remaining
from 
    public.memberships m
join 
    public.profiles p on m.user_id = p.id
where 
    m.expiry_date > now() 
    and m.expiry_date < (now() + interval '7 days');


-- ==========================================
-- 6. Calculation Function (Evolution)
-- ==========================================

-- Function to calculate diff between last 2 measurements
create or replace function public.get_evolution_diff(target_user_id uuid)
returns table (
    weight_diff numeric,
    waist_diff numeric,
    last_date timestamptz,
    prev_date timestamptz
) as $$
declare
    last_record record;
    prev_record record;
begin
    -- Fetch the most recent measurement
    select * into last_record 
    from public.measurements_history 
    where user_id = target_user_id 
    order by created_at desc 
    limit 1;

    -- Fetch the second most recent measurement
    select * into prev_record 
    from public.measurements_history 
    where user_id = target_user_id 
    order by created_at desc 
    limit 1 offset 1;

    -- Return diffs if both records exist
    if last_record.id is not null and prev_record.id is not null then
        return query select 
            (last_record.weight_kg - prev_record.weight_kg) as weight_diff,
            (last_record.waist_cm - prev_record.waist_cm) as waist_diff,
            last_record.created_at as last_date,
            prev_record.created_at as prev_date;
    else
        -- If not enough data, return nulls or 0
        return query select 
            null::numeric as weight_diff, 
            null::numeric as waist_diff,
            last_record.created_at as last_date,
            prev_record.created_at as prev_date;
    end if;
end;
$$ language plpgsql;


-- ==========================================
-- 7. Workout Tracking System (AI-Powered)
-- ==========================================

-- Workout Plans (Annual plan generated by AI)
create table if not exists public.workout_plans (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles(id) on delete cascade not null,
    title text not null,
    description text,
    start_date date not null,
    end_date date not null,
    activity_level text,
    fitness_goals text[],
    training_days_per_week int default 5,
    ai_generated boolean default true,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Workout Sessions (Daily sessions in the plan)
create table if not exists public.workout_sessions (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid references public.workout_plans(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    session_date date not null,
    session_type text check (session_type in ('strength', 'cardio', 'rest', 'flexibility', 'mixed')),
    title text not null,
    description text,
    exercises jsonb, -- Array of exercises with sets, reps, etc.
    estimated_duration_min int,
    difficulty text check (difficulty in ('easy', 'medium', 'hard')),
    week_number int,
    month_number int,
    created_at timestamptz default now()
);

-- Session Completions (Track completed sessions)
create table if not exists public.session_completions (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references public.workout_sessions(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    completed_at timestamptz default now(),
    duration_min int,
    notes text,
    xp_earned int default 50,
    auto_marked boolean default false,
    unique(session_id, user_id)
);

-- Workout Reminders
create table if not exists public.workout_reminders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles(id) on delete cascade not null,
    reminder_time time not null default '08:00:00',
    days_of_week int[] default '{1,2,3,4,5}', -- 0=Sunday, 6=Saturday
    is_enabled boolean default true,
    created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_workout_sessions_user_date on public.workout_sessions(user_id, session_date);
create index if not exists idx_session_completions_user on public.session_completions(user_id);
create index if not exists idx_workout_plans_user on public.workout_plans(user_id);
create index if not exists idx_workout_sessions_plan on public.workout_sessions(plan_id);

-- Enable RLS
alter table public.workout_plans enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_completions enable row level security;
alter table public.workout_reminders enable row level security;

-- RLS Policies for workout_plans
create policy "Users manage own workout plans" on public.workout_plans
    for all using (auth.uid() = user_id);

create policy "Gym admins view plans in their gym" on public.workout_plans
    for select using (
        exists (select 1 from public.profiles where id = workout_plans.user_id and gym_id = get_my_gym_id() and get_my_role() = 'admin')
    );

-- RLS Policies for workout_sessions
create policy "Users manage own sessions" on public.workout_sessions
    for all using (auth.uid() = user_id);

create policy "Gym admins view sessions in their gym" on public.workout_sessions
    for select using (
        exists (select 1 from public.profiles where id = workout_sessions.user_id and gym_id = get_my_gym_id() and get_my_role() = 'admin')
    );

-- RLS Policies for session_completions
create policy "Users manage own completions" on public.session_completions
    for all using (auth.uid() = user_id);

-- RLS Policies for workout_reminders
create policy "Users manage own reminders" on public.workout_reminders
    for all using (auth.uid() = user_id);

-- Helper function: Get current streak
create or replace function public.get_user_streak(target_user_id uuid)
returns int as $$
declare
    current_streak int := 0;
    check_date date := current_date;
    has_completion boolean;
begin
    loop
        -- Check if user completed a session on this date
        select exists(
            select 1 from public.session_completions sc
            join public.workout_sessions ws on ws.id = sc.session_id
            where sc.user_id = target_user_id
            and ws.session_date = check_date
        ) into has_completion;
        
        if not has_completion then
            -- Check if it was a rest day
            select exists(
                select 1 from public.workout_sessions
                where user_id = target_user_id
                and session_date = check_date
                and session_type = 'rest'
            ) into has_completion;
        end if;
        
        if has_completion then
            current_streak := current_streak + 1;
            check_date := check_date - interval '1 day';
        else
            exit;
        end if;
    end loop;
    
    return current_streak;
end;
$$ language plpgsql;

-- Helper function: Get monthly progress
create or replace function public.get_monthly_progress(target_user_id uuid, target_month int, target_year int)
returns table (
    total_sessions int,
    completed_sessions int,
    completion_rate numeric
) as $$
begin
    return query
    select 
        count(ws.id)::int as total_sessions,
        count(sc.id)::int as completed_sessions,
        case 
            when count(ws.id) > 0 then round((count(sc.id)::numeric / count(ws.id)::numeric) * 100, 2)
            else 0
        end as completion_rate
    from public.workout_sessions ws
    left join public.session_completions sc on sc.session_id = ws.id
    where ws.user_id = target_user_id
    and extract(month from ws.session_date) = target_month
    and extract(year from ws.session_date) = target_year
    and ws.session_type != 'rest';
end;
$$ language plpgsql;

-- ==========================================
-- 8. Nutrition System (AI-Powered)
-- ==========================================

-- Nutrition Plans
create table if not exists public.nutrition_plans (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles(id) on delete cascade not null,
    annual_goal text,
    is_active boolean default true,
    created_at timestamptz default now()
);

-- Nutrition Weeks
create table if not exists public.nutrition_weeks (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid references public.nutrition_plans(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    week_number int,
    daily_meals jsonb,
    recommendations text,
    completed_days jsonb default '[false, false, false, false, false, false, false]'::jsonb,
    created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_nutrition_plans_user on public.nutrition_plans(user_id);
create index if not exists idx_nutrition_weeks_plan on public.nutrition_weeks(plan_id);

-- Enable RLS
alter table public.nutrition_plans enable row level security;
alter table public.nutrition_weeks enable row level security;

-- RLS Policies
create policy "Users manage own nutrition plans" on public.nutrition_plans 
    for all using (auth.uid() = user_id);

create policy "Users manage own nutrition weeks" on public.nutrition_weeks 
    for all using (auth.uid() = user_id);
