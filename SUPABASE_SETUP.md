# Northstar Supabase setup

1. Open the `bnaimitzvah` project in Supabase.
2. Open **SQL Editor**, paste `supabase-schema.sql`, and click **Run**.
3. In Northstar, choose **Connect**, then sign in with the same account used by the other apps.
4. If local projects exist and the remote workspace is empty, choose **Back up & migrate**. A dated JSON file is downloaded before the upload starts.

PM v1.3.0 adds undated tasks and the `northstar_create_undated_project` function used by MyMain. Run the latest schema again when upgrading, with Row Level Security enabled.

The browser uses only the public publishable key. Never put a service-role key in this repository.
