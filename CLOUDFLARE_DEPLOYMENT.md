# Cloudflare Pages Deployment Guide

## Project is Ready! ✅

Your project is already configured correctly for Cloudflare Pages deployment. No code changes needed.

## What YOU Need to Do (5-10 minutes)

### Step 1: Push to GitHub (if not already done)
```bash
git remote -v  # Check if origin is set
# If you need to create a new repo or push:
git push origin main
```

### Step 2: Sign Up for Cloudflare (Free)
1. Go to https://dash.cloudflare.com/sign-up
2. Create a free account (no credit card required)
3. Verify your email

### Step 3: Create Cloudflare Pages Project
1. Go to https://dash.cloudflare.com/
2. Click **"Workers & Pages"** in the left sidebar
3. Click **"Create Application"**
4. Click **"Pages"** tab
5. Click **"Connect to Git"**

### Step 4: Connect GitHub
1. Click **"Connect GitHub"**
2. Authorize Cloudflare to access your GitHub
3. Select your repository: `Asymons/stremio-account-manager` (or your fork)
4. Click **"Begin setup"**

### Step 5: Configure Build Settings
Enter these **EXACT** settings:

| Setting | Value |
|---------|-------|
| **Production branch** | `main` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | (leave empty) |

### Step 6: Deploy!
1. Click **"Save and Deploy"**
2. Wait 2-5 minutes for the build
3. You'll get a URL like: `https://your-project-name.pages.dev`

## That's It! 🎉

Your app will now:
- ✅ Auto-deploy on every `git push` to main
- ✅ Have HTTPS automatically (Web Crypto API will work)
- ✅ Be served from a global CDN
- ✅ Have unlimited bandwidth
- ✅ Cost you $0

## Custom Domain (Optional)
If you want your own domain (like `stremio.yourdomain.com`):
1. In Cloudflare Pages project settings
2. Go to **"Custom domains"**
3. Add your domain
4. Follow DNS instructions

## Troubleshooting

### Build Fails?
- Check the build logs in Cloudflare dashboard
- Ensure Node.js version is compatible (16.x or higher is fine)

### Site Loads But Doesn't Work?
- Check browser console for errors
- Ensure you're accessing via HTTPS (not HTTP)

## Build Information
- **Framework**: Vite + React + TypeScript
- **Node Version**: Any modern version (16.x+)
- **Build Time**: ~2-3 minutes
- **Deploy Size**: ~500KB (gzipped)
