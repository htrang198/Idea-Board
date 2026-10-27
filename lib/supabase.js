import { createClient } from "@supabase/supabase-js";

// The project URL and publishable key are public by design (access is enforced by row-level security),
// so they ship as defaults. Environment variables override them, e.g. for a different Supabase project.
const DEFAULT_URL = "https://djpggbytmoltsjclshkm.supabase.co";
const DEFAULT_KEY = "sb_publishable_pRk0aAXTpGQEmuaAZj2TNg_TKtZP1E7";

// tolerate a pasted REST endpoint like https://x.supabase.co/rest/v1/
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL).trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY).trim();

export const supabase = url && key ? createClient(url, key) : null;
export const BUCKET = "media";
export const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 50);

export const mediaUrl = path => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
