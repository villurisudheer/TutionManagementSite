# V6 Main-Only Render Setup

V6 is already "main-only": public admission, admin and parent portal are integrated in one service.

Use:

```text
Root Directory: aacharya-student-intake-render-v6
Build Command: npm install
Start Command: npm start
Health Check: /api/health
DATA_DIR: /var/data
```

Do not create the previous separate `parent-portal-extension` Render service for V6.

See `RENDER_SETUP.md` for all required environment variables and persistent-disk details.
