# K Props Scout

MLB strikeout prop research tool — full pitcher analysis, platoon splits, Poisson probability tables, batter projections.

---

## Setup (one-time, ~10 minutes)

### Step 1 — Install Node.js
Go to https://nodejs.org and download the **LTS** version. Install it like any app.
To confirm it worked, open Terminal (Mac) or Command Prompt (Windows) and type:
```
node --version
```
You should see something like `v20.x.x`.

---

### Step 2 — Get your Anthropic API key
1. Go to https://console.anthropic.com
2. Sign in (same account as Claude)
3. Click **API Keys** in the left sidebar
4. Click **Create Key**, give it a name like "kprops"
5. Copy the key — it starts with `sk-ant-...`

---

### Step 3 — Set up the project
Open Terminal (Mac) or Command Prompt (Windows).

Navigate to this folder:
```
cd path/to/kprops-app
```
For example if it's in your Downloads folder:
```
cd ~/Downloads/kprops-app
```

Install dependencies:
```
npm install
```

---

### Step 4 — Add your API key
In the kprops-app folder, create a file called `.env` (copy from `.env.example`):
```
cp .env.example .env
```
Then open `.env` in any text editor and replace `your_api_key_here` with your actual key:
```
VITE_ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxx
```
Save the file.

---

### Step 5 — Run the app
```
npm run dev
```
You'll see something like:
```
  VITE v5.0.0  ready in 300ms
  ➜  Local:   http://localhost:5173/
```
Open http://localhost:5173 in your browser. The app loads.

To stop it: press `Ctrl+C` in the terminal.

---

## Daily use
Each morning:
1. Open Terminal
2. `cd path/to/kprops-app`
3. `npm run dev`
4. Open http://localhost:5173

Takes about 5 seconds to start up after the first time.

---

## Deploy to Vercel (optional — access from any device)

1. Go to https://vercel.com and sign up free
2. Install Vercel CLI: `npm install -g vercel`
3. In the kprops-app folder: `vercel`
4. Follow the prompts
5. When asked about environment variables, add `VITE_ANTHROPIC_API_KEY` with your key
6. You'll get a URL like `https://kprops-scout.vercel.app` — open it on your phone anytime

To redeploy after any code changes: `vercel --prod`

---

## What it does

- Pulls today's and tomorrow's MLB slate
- For each probable pitcher:
  - Season stats (ERA, K/9, K%, SwStr%, WHIP)
  - Platoon splits vs RHB/LHB
  - Last 5 starts with outlier detection (↑↓)
  - L5 and L10 averages including avg opponent K rank
  - Opposing lineup K rank, chase rate, platoon note
  - Projections: pitches, outs, runs, hits, walks, Ks
  - Over/under % and American odds for each stat
  - Full Poisson K probability table (proj line ± 2)
  - Per-batter projections (H, TB, K, BB) behind "Show lineup"
  - Top K Props strip surfacing the best plays
