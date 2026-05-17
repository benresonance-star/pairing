-- Free-text utilities intelligence (water, sewer, power, telecommunications, etc.)

alter table public.site_planning_highlights
    add column if not exists utilities_status text;

notify pgrst, 'reload schema';
