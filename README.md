# Healthcare Profile Builder - MVP Demo

AI-powered nurse profile enrichment tool.

## Setup Instructions (15 minutes)

### Step 1: Create a GitHub Account (if you don't have one)
1. Go to https://github.com
2. Click "Sign Up"
3. Follow the prompts

### Step 2: Create a New Repository
1. Click the "+" icon in the top right → "New repository"
2. Name it `profile-builder`
3. Keep it **Public**
4. Click "Create repository"

### Step 3: Upload These Files
1. On your new repo page, click "uploading an existing file"
2. Drag ALL the files from this folder:
   - `api/extract.js`
   - `public/index.html`
   - `package.json`
   - `vercel.json`
3. Click "Commit changes"

**Important:** Make sure the folder structure is preserved:
```
profile-builder/
├── api/
│   └── extract.js
├── public/
│   └── index.html
├── package.json
└── vercel.json
```

### Step 4: Deploy to Vercel
1. Go to https://vercel.com
2. Click "Sign Up" → "Continue with GitHub"
3. Authorize Vercel to access your GitHub
4. Click "Add New..." → "Project"
5. Find `profile-builder` in the list and click "Import"
6. **IMPORTANT:** Before clicking Deploy, add your API key:
   - Click "Environment Variables"
   - Add: `ANTHROPIC_API_KEY` = your API key
7. Click "Deploy"
8. Wait ~1 minute for deployment
9. You'll get a URL like `https://profile-builder-abc123.vercel.app`

### Step 5: Share the Link
Send the URL to anyone - they can now use the tool with real AI!

## Getting Your Anthropic API Key

1. Go to https://console.anthropic.com
2. Sign in or create an account
3. Go to "API Keys"
4. Click "Create Key"
5. Copy the key (starts with `sk-ant-`)

## Costs

The Anthropic API costs ~$0.003 per resume extraction (about 1000 tokens).
So 1000 resumes = ~$3.

## Support

This is an MVP demo. For production, you'd want:
- Rate limiting
- User authentication
- Error tracking
- Expanded hospital database
