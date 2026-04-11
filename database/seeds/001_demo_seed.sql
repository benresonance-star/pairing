insert into public.projects (id, name, archicad_project_id)
values (
    '11111111-1111-1111-1111-111111111111',
    'Demo Tower A',
    'ARCHICAD-DEMO-TOWER-A'
)
on conflict (id) do nothing;

insert into public.work_packages (project_id, package_id, package_name, trade_code, workfront, active)
values
    ('11111111-1111-1111-1111-111111111111', 'PKG-ZONE-L08', 'Level 08 Zone Package', 'fitout', 'Tower A L08', true),
    ('11111111-1111-1111-1111-111111111111', 'PKG-WALL-FACADE-02', 'Facade Wave 02', 'facade', 'Tower A East', true)
on conflict (project_id, package_id) do nothing;

insert into public.scenarios (id, project_id, name, status, created_by)
values (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Baseline',
    'baseline',
    'system'
)
on conflict (id) do nothing;
