-- =====================================================================
-- Pase diario (1 día) y semanal (7 días).
-- Son compras puntuales: no se renuevan solas. La renovación automática
-- genera la cuota 7 días antes del vencimiento, lo que en un pase semanal
-- cobraría semanas por adelantado; el alumno vuelve a comprar el pase.
-- =====================================================================

alter table public.membership_plans drop constraint plan_type_duration;
alter table public.membership_plans add constraint plan_type_duration check (
  case plan_type
    when 'daily'     then duration_days = 1
    when 'weekly'    then duration_days = 7
    when 'monthly'   then duration_months = 1
    when 'quarterly' then duration_months = 3
    when 'annual'    then duration_months = 12
    else true
  end
);

create or replace function app.subscriptions_short_pass_no_renew()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.membership_plans
    where id = new.plan_id and plan_type in ('daily', 'weekly')
  ) then
    new.auto_renew := false;
  end if;
  return new;
end;
$$;

create trigger subscriptions_short_pass_no_renew
  before insert on public.subscriptions
  for each row execute function app.subscriptions_short_pass_no_renew();
