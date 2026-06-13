import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://gwbuydiaevcbakouliax.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3YnV5ZGlhZXZjYmFrb3VsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTc1NjksImV4cCI6MjA5NTQ5MzU2OX0.V_fyzN8CkzjulzIeLXJ4H9yM9cTsTCQYN_5kuO4LEqI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const ADMIN_EMAIL = "evodemicomyiza98@gmail.com";
