# 🚀 Free Deployment Guide: Frontend & Backend

This guide walks you through deploying **gemini-live-dashboard** completely **FREE** ($0/month) using modern cloud providers.

---

## 🏗️ Architecture Options

| Option | Frontend | Backend | Database | Best For | Complexity |
|---|---|---|---|---|---|
| **Option A (Recommended)** | Render (Unified) | Render (Web Service) | Neon Serverless Postgres | Easiest setup, 1 repository, no CORS, instant SSE support | ⭐ (3 mins) |
| **Option B (Decoupled)** | Vercel or Netlify | Render or Koyeb | Neon Serverless Postgres | Maximum edge frontend speed, decoupled Jamstack setup | ⭐⭐ (5 mins) |

---

## 🗄️ Step 1: Set Up Free PostgreSQL Database (Neon.tech)

> 💡 *Why Postgres instead of SQLite?* Free hosting platforms (like Render and Vercel) have ephemeral file systems. SQLite data is lost when instances restart. Neon provides a permanent, free 500MB PostgreSQL database.

1. Go to [https://neon.tech](https://neon.tech) and sign up with GitHub or Google (No credit card required).
2. Create a new project named `gemini-live-db`.
3. In the dashboard, copy the **Connection string**:
   ```
   postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Save this as your `DATABASE_URL`. The app will automatically create tables and seed demo data on first boot!

---

## ⚙️ Step 2: Deploy Backend (Render.com)

Render provides 750 free hours per month (runs 1 web service 24/7).

### Method 1: Using Render Blueprint (1-Click)
1. Push your repo to GitHub.
2. Sign in to [https://dashboard.render.com](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Select your `gemini-live-dashboard` repository.
5. Render detects `render.yaml` automatically.
6. Enter your secret environment variables:
   - `GEMINI_API_KEY`: Your key from [Google AI Studio](https://aistudio.google.com/)
   - `DATABASE_URL`: Your Neon connection string from Step 1.
7. Click **Apply**. Within 2-3 minutes, your service will be live at:
   `https://gemini-live-dashboard-xxxx.onrender.com`

### Method 2: Manual Web Service Setup
1. On Render, click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Configure the service:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`
4. Under **Advanced** → **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
   - `GEMINI_API_KEY` = `<your-api-key>`
   - `DATABASE_URL` = `<your-neon-postgres-url>`
   - `CORS_ORIGIN` = `*` (or your Vercel frontend URL)
5. Click **Create Web Service**.

> 💡 **Best No-Card Free Alternative: Hugging Face Spaces (Docker)**
> If Render asks for a credit card, use **[Hugging Face Spaces](https://huggingface.co/spaces)** (100% Free, NO credit card ever required, 2 vCPUs, 16 GB RAM!):
> 1. Sign up for free at [huggingface.co](https://huggingface.co).
> 2. Click **New Space** → Name it `tujar-assistant` → Choose **Docker** (Blank).
> 3. Under **Settings** → **Variables and secrets**, add:
>    - `GEMINI_API_KEY`: your API key
>    - `DATABASE_URL`: your Neon PostgreSQL URL
> 4. Push your repo to the Space Git URL or connect GitHub. It builds the Dockerfile automatically and runs on port 7860!
>
> 💡 **Alternative Backend: Koyeb**
> Deploy on [Koyeb.com](https://koyeb.com) (Hobby tier: 1 free micro service, 512MB RAM). Simply select GitHub repo, set start command to `node server.js`, port to `3000`, and paste your environment variables.

---

## 🌐 Step 3: Deploy Frontend

### Option A: Use Render's Built-in Frontend (Unified)
If you followed Step 2, **you are already done!**
Open `https://gemini-live-dashboard-xxxx.onrender.com` in your browser. The Express server serves the entire frontend, CSS, JS, and vendor libraries with zero configuration.

---

### Option B: Deploy Frontend to Vercel (Edge CDN)
If you want the frontend hosted on Vercel's global CDN:

1. Open `vercel.json` in your local project.
2. Replace `YOUR_BACKEND_URL.onrender.com` with your actual Render backend URL:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://gemini-live-dashboard-xxxx.onrender.com/api/:path*"
       },
       {
         "source": "/vendor/:path*",
         "destination": "https://gemini-live-dashboard-xxxx.onrender.com/vendor/:path*"
       },
       {
         "source": "/d/:path*",
         "destination": "/dash.html"
       }
     ]
   }
   ```
3. Commit and push changes:
   ```bash
   git add vercel.json
   git commit -m "Configure Vercel backend proxy"
   git push origin main
   ```
4. Go to [https://vercel.com](https://vercel.com) and click **Add New...** → **Project**.
5. Import your `gemini-live-dashboard` repo.
6. Leave Framework Preset as **Other**.
7. Click **Deploy**.
8. Your high-speed edge frontend will be live at `https://gemini-live-dashboard-xxxx.vercel.app`!

---

### Option C: Deploy Frontend to Netlify
1. Open `netlify.toml` and replace `YOUR_BACKEND_URL.onrender.com` with your actual Render backend URL.
2. Sign in to [https://app.netlify.com](https://app.netlify.com).
3. Click **Add new site** → **Import an existing project** → GitHub.
4. Select the repository and click **Deploy gemini-live-dashboard**.

---

## ⏰ Step 4: Keep Free Backend Awake (Prevent Cold Starts)

Render free instances spin down after 15 minutes of inactivity. When a new visitor arrives, it takes ~45 seconds to wake up.

To keep your backend awake 24/7 for free:
1. Go to [https://cron-job.org](https://cron-job.org) or [https://uptimerobot.com](https://uptimerobot.com) (both 100% free).
2. Create a new monitor/cron:
   - **URL**: `https://gemini-live-dashboard-xxxx.onrender.com/health`
   - **Interval**: Every 10 minutes.
3. This sends a lightweight `GET /health` request, keeping the container warm with zero latency!

---

## 🔒 Security & Access Protection (Optional)

To password-protect your public deployment:
1. In Render environment variables, set `ACCESS_CODE=your-secret-code`.
2. When users open the website, they will see a lock prompt asking for the secret code before gaining access to APIs and Gemini Live.

---

## ✅ Deployment Checklist

- [ ] Free Postgres DB created on [Neon.tech](https://neon.tech)
- [ ] Backend deployed on [Render.com](https://render.com) or [Koyeb.com](https://koyeb.com)
- [ ] `GEMINI_API_KEY` set in Backend environment variables
- [ ] `DATABASE_URL` set in Backend environment variables
- [ ] `/health` endpoint responds with `{"status":"ok"}`
- [ ] Frontend deployed on Vercel/Netlify (or using Render unified URL)
- [ ] Free ping scheduled on Cron-job.org to keep backend awake
