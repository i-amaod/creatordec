# Crypto Creator Desk

Static demo plus an optional no-dependency Node backend scaffold.

## Run as static files

Open `index.html` directly in the browser. Data is stored in browser `localStorage`.

## Run with the local backend scaffold

```powershell
node server.js
```

Then open:

```text
http://localhost:3000
```

Available backend routes:

- `GET /api/creators`
- `POST /api/creators`
- `GET /api/requests`
- `POST /api/requests`
- `PATCH /api/requests/:id`
- `POST /api/admin/login`
- `GET /api/x-profile?handle=name`

Environment variables:

- `ADMIN_PASSCODE`: admin login passcode. Defaults to `admin123`.
- `X_BEARER_TOKEN`: optional X API bearer token for profile enrichment.
- `TWITTERAPI_IO_KEY`: optional TwitterAPI.io key for profile enrichment fallback.
- `SOCIALDATA_API_KEY`: optional SocialData API key for profile enrichment fallback.
- `X_PROFILE_CACHE_TTL_HOURS`: optional profile cache duration. Defaults to `24`. Set `0` to disable caching.

Note: file uploads in the static front-end currently store file metadata only. Persisting actual files requires adding multipart upload handling or a storage provider.
