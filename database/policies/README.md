# Policies

Baseline RLS scaffolding is implemented in `database/migrations/003_rls_scaffolding.sql`.

The current approach assumes JWTs include `app_metadata.project_ids` and allows the Supabase service role to bypass project-row checks for backend sync tasks.
