import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true, // 自动刷新令牌，默认 true
    persistSession: true, // 持久化会话，默认 true
    detectSessionInUrl: true, // 从 URL 中检测会话（用于 OAuth 回调），默认 true
    storage: localStorage, // 使用 localStorage 存储会话，默认值
  },
});
