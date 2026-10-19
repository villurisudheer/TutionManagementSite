# V6.1 Main-Only Render Setup

V6.1 already integrates public admission, admin and Parent Portal in one service.

```text
Root Directory: aacharya-student-intake-render-v6.1
Build Command: npm install
Start Command: npm start
Health Check: /api/health
DATA_DIR: /var/data
DB_BACKUP_KEEP: 20
```

Keep the existing persistent disk at `/var/data`. Do not create the old separate Parent Portal service.

After deployment, `/api/health` should show `version: 6.1.0`, `dbIntegrity: ok`, and ideally `persistentDiskDetected: true`.
