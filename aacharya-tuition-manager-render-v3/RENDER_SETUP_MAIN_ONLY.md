# Render Setup — exact steps

## Best option: use this project as the GitHub repository root

Upload these project files directly into the root of your GitHub repository so `package.json`, `server.js`, and `render.yaml` are visible at the top level.

Then in Render:

1. **New → Blueprint**
2. Connect the GitHub repository.
3. Render reads `render.yaml`.
4. Enter your private values when requested:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `ADMIN_SYNC_KEY`
5. Deploy.

No Root Directory setting is needed when the files are at the GitHub repository root.

## If you keep this project in a GitHub subfolder

Example repository:

```text
Student-Intake-Project/
  aacharya-tuition-manager-render-v3/
    package.json
    server.js
    public/
```

Create/edit a Render **Web Service** and set:

```text
Root Directory: aacharya-tuition-manager-render-v3
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Add environment variables:

```text
NODE_VERSION=24.14.1
NODE_ENV=production
DATA_DIR=/var/data
ADMIN_NAME=Aacharya Sudheer
ADMIN_EMAIL=your-admin-email
ADMIN_PASSWORD=your-private-password
SESSION_SECRET=a-long-random-secret
ADMIN_SYNC_KEY=a-long-private-sync-key
```

Attach a **1 GB persistent disk** mounted at:

```text
/var/data
```

## After it is live

Open:

```text
https://YOUR-SERVICE.onrender.com/
```

for the student/parent form.

Open:

```text
https://YOUR-SERVICE.onrender.com/admin
```

for your private tuition manager.

Open:

```text
https://YOUR-SERVICE.onrender.com/api/health
```

for a simple health check.

## Excel

The live workbook is written to:

```text
/var/data/Aacharya_Tuition_Master.xlsx
```

You normally do not need Render Shell to retrieve it. Log in to `/admin`, open **Settings & Excel**, and click **Download Aacharya_Tuition_Master.xlsx**.
