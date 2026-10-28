-- =====================================================================
-- MyN Fitness — Incremento 12 (parcial): indicadores del dashboard gerencial.
-- Todo se calcula en el servidor con datos reales; nada inventado.
-- Comparación contra el período inmediatamente anterior de igual duración.
-- =====================================================================

create or replace function public.dashboard_summary(p_gym_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := app.today();
  v_days int;
  v_prev_from date;
  v_prev_to date;
  v_result jsonb;
begin
  if not app.has_any_role(p_gym_id, array['admin', 'accountant']::public.app_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Período inválido (máximo un año)' using errcode = 'P0001';
  end if;
  v_days := p_to - p_from + 1;
  v_prev_to := p_from - 1;
  v_prev_from := p_from - v_days;

  with
  pay as (
    select p.amount, (p.paid_at at time zone 'America/Asuncion')::date as d, m.name as method
    from public.payments p join public.payment_methods m on m.id = p.method_id
    where p.gym_id = p_gym_id and p.status = 'posted'
      and (p.paid_at at time zone 'America/Asuncion')::date between v_prev_from and p_to
  ),
  exp as (
    select e.amount, e.paid_on as d, c.name as category
    from public.expenses e join public.expense_categories c on c.id = e.category_id
    where e.gym_id = p_gym_id and e.status = 'posted' and e.paid_on between v_prev_from and p_to
  ),
  access as (
    select distinct s.student_id
    from public.subscriptions s
    where s.gym_id = p_gym_id and s.status = 'active' and s.starts_on <= v_today and s.ends_on >= v_today
      and not exists (
        select 1 from public.subscription_pauses z
        where z.subscription_id = s.id and v_today between z.from_date and z.to_date
      )
  ),
  open_ch as (
    select c.student_id, c.total - c.paid_amount as balance, c.status
    from public.charges c
    where c.gym_id = p_gym_id and c.status in ('pending', 'partial', 'overdue')
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'prev_from', v_prev_from, 'prev_to', v_prev_to, 'today', v_today),
    'students', jsonb_build_object(
      'total', (select count(*) from public.students where gym_id = p_gym_id),
      'active', (select count(*) from public.students where gym_id = p_gym_id and status = 'active'),
      'inactive', (select count(*) from public.students where gym_id = p_gym_id and status = 'inactive'),
      'new', (select count(*) from public.students where gym_id = p_gym_id and enrolled_on between p_from and p_to),
      'new_prev', (select count(*) from public.students where gym_id = p_gym_id and enrolled_on between v_prev_from and v_prev_to),
      'with_access', (select count(*) from access a join public.students s on s.id = a.student_id where s.status = 'active'),
      'without_membership', (
        select count(*) from public.students s
        where s.gym_id = p_gym_id and s.status = 'active' and s.id not in (select student_id from access)
      )
    ),
    'memberships', jsonb_build_object(
      'expiring_7d', (
        select count(*) from public.subscriptions
        where gym_id = p_gym_id and status = 'active' and not auto_renew and ends_on between v_today and v_today + 7
      ),
      'expired_period', (
        select count(*) from public.subscriptions
        where gym_id = p_gym_id and status = 'expired' and ends_on between p_from and p_to
      ),
      'cancelled_period', (
        select count(*) from public.subscriptions
        where gym_id = p_gym_id and status = 'cancelled' and (cancelled_at at time zone 'America/Asuncion')::date between p_from and p_to
      )
    ),
    'receivables', jsonb_build_object(
      'open', coalesce((select sum(balance) from open_ch), 0),
      'overdue', coalesce((select sum(balance) from open_ch where status = 'overdue'), 0),
      'debtors', (select count(distinct student_id) from open_ch where status = 'overdue')
    ),
    'collections', jsonb_build_object(
      'today', coalesce((select sum(amount) from pay where d = v_today), 0),
      'period', coalesce((select sum(amount) from pay where d between p_from and p_to), 0),
      'prev', coalesce((select sum(amount) from pay where d between v_prev_from and v_prev_to), 0),
      'count', (select count(*) from pay where d between p_from and p_to),
      'by_method', coalesce((
        select jsonb_agg(jsonb_build_object('name', method, 'amount', amount) order by amount desc)
        from (select method, sum(amount) as amount from pay where d between p_from and p_to group by method) x
      ), '[]'::jsonb)
    ),
    'expenses', jsonb_build_object(
      'period', coalesce((select sum(amount) from exp where d between p_from and p_to), 0),
      'prev', coalesce((select sum(amount) from exp where d between v_prev_from and v_prev_to), 0),
      'by_category', coalesce((
        select jsonb_agg(jsonb_build_object('name', category, 'amount', amount) order by amount desc)
        from (select category, sum(amount) as amount from exp where d between p_from and p_to group by category) x
      ), '[]'::jsonb)
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', g.d,
        'collections', coalesce((select sum(amount) from pay where pay.d = g.d), 0),
        'expenses', coalesce((select sum(amount) from exp where exp.d = g.d), 0)
      ) order by g.d)
      from (select generate_series(p_from, p_to, interval '1 day')::date as d) g
    ), '[]'::jsonb),
    'leads', jsonb_build_object(
      'new', (select count(*) from public.leads where gym_id = p_gym_id and (created_at at time zone 'America/Asuncion')::date between p_from and p_to),
      'pending', (select count(*) from public.leads where gym_id = p_gym_id and status = 'new'),
      'converted', (
        select count(*) from public.leads
        where gym_id = p_gym_id and status = 'converted' and (updated_at at time zone 'America/Asuncion')::date between p_from and p_to
      )
    ),
    'trainers_active', (select count(*) from public.trainers where gym_id = p_gym_id and is_active)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_summary(uuid, date, date) from public, anon;
grant execute on function public.dashboard_summary(uuid, date, date) to authenticated;
