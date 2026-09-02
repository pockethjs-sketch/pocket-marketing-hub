import { createClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config.js";

let singleton = null;
let singletonKey = "";

export function getSupabaseClient(env = import.meta.env) {
  const config = readSupabaseConfig(env);
  if (!config.enabled) return null;
  if (!config.configured) {
    throw new Error("Supabase URL과 publishable key가 설정되지 않았습니다.");
  }

  const key = `${config.url}|${config.publishableKey}`;
  if (!singleton || singletonKey !== key) {
    singleton = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    singletonKey = key;
  }
  return singleton;
}

export { readSupabaseConfig } from "./config.js";
