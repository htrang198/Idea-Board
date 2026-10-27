# Brand Idea Board

A shared board where the team keeps ideas per brand: folders and subfolders, images, GIFs, videos, PDFs, notes and links. The home page is a shuffled canvas of every image and GIF on the board.

- Anyone with the link can browse.
- Anyone who signs in with an email and password can add, edit, move and delete content.
- Files are stored in Supabase Storage (up to 50 MB per file on the free plan). Longer videos can be added as links.

Built with Next.js and Supabase. Hosted on Vercel.

## Setup

### 1. Supabase (database, file storage, sign-in)

1. Create a free project at https://supabase.com.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it. This creates the tables, the `media` storage bucket, access rules, and the starting brands.
3. Open **Authentication → Sign In / Providers → Email** and turn **off** "Confirm email", so people can start adding right after creating an account. (Supabase's built-in email sender only allows a few emails per hour.)
4. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 1b. Google sign-in (optional)

1. In Google Cloud Console (https://console.cloud.google.com), create a project, then **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name and your email, and publish it.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**. Under **Authorized redirect URIs** add `https://<your-project>.supabase.co/auth/v1/callback`.
3. Copy the Client ID and Client secret into Supabase **Authentication → Sign In / Providers → Google**, and turn it on.
4. In Supabase **Authentication → URL Configuration**, set **Site URL** to your Vercel URL and add it under **Redirect URLs**.

### 2. Vercel (website hosting)

1. Go to https://vercel.com/new and import this GitHub repository.
2. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon public key
   - `NEXT_PUBLIC_MAX_UPLOAD_MB` = `50` (optional)
3. Click **Deploy**. Vercel gives you a public URL like `idea-board.vercel.app`.

## Local development

```bash
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev
```

## Notes

- To allow files larger than 50 MB, upgrade Supabase to Pro, raise the bucket limit in **Storage → media → Edit bucket**, and set `NEXT_PUBLIC_MAX_UPLOAD_MB` to match.
- The anon key is meant to be public. Access is controlled by the row-level security rules in `schema.sql`.
