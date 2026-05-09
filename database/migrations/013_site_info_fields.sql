alter table public.sites
add column if not exists site_code text,
add column if not exists site_date date;

update public.sites
set site_code = id
where site_code is null;

create unique index if not exists sites_project_site_code_unique
on public.sites (project_id, site_code)
where site_code is not null;

notify pgrst, 'reload schema';
