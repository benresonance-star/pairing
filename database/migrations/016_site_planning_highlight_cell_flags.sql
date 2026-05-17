-- Optional per-matrix-cell flags for Site Planning Intelligence (view mode highlight).

alter table public.site_planning_highlights
    add column if not exists matrix_cell_flags_json jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
