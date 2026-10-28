-- =====================================================================
-- Pase diario y semanal: nuevos tipos de plan.
-- Va en su propia migración: un valor nuevo de enum no puede usarse en la
-- misma transacción en que se agrega (lo usa la migración siguiente).
-- =====================================================================

alter type public.plan_type add value if not exists 'daily' before 'monthly';
alter type public.plan_type add value if not exists 'weekly' before 'monthly';
