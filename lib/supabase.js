import { createClient } from "@supabase/supabase-js";

// tolerate a pasted REST endpoint like https://x.supabase.co/rest/v1/
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)?.trim();

export const supabase = url && key ? createClient(url, key) : null;
export const BUCKET = "media";
export const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 50);

export const mediaUrl = path => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
