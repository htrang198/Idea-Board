import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const BUCKET = "media";
export const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 50);

export const mediaUrl = path => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
