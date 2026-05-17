-- Remove all sites (and dependent rows via ON DELETE CASCADE) for one project.
-- Replace the UUID with your PROJECT_ID (same value as env PROJECT_ID / demo seed project id).
--
-- Run in Supabase SQL Editor (or psql against SUPABASE_DB_URL) when you want an empty
-- Sites / Feasibility pipeline without re-running the full bootstrap.

begin;

delete from public.sites
where project_id = '11111111-1111-1111-1111-111111111111';

commit;
