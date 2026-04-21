# Posts

Auto-generated post files. Each movie/series saved through the admin panel
also lands here as a JSON file.

Structure:
- `posts/movies/<slug>-<id>.json`     — Movies
- `posts/tv-series/<slug>-<id>.json`  — TV Series

Files are created/updated/deleted automatically by the Apps Script backend
(`addMovie`, `editMovie`, `deleteMovie`). Do not edit by hand — changes here
will be overwritten the next time the post is updated in the admin panel.
