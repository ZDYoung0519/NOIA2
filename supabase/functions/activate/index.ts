// supabase/functions/activate-membership/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // 验证请求
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未授权" }), { status: 401 });
    }

    // 创建 Supabase 客户端
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // 获取当前用户
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "用户未找到" }), { status: 401 });
    }

    // 获取密钥
    const { key_code } = await req.json();
    if (!key_code) {
      return new Response(JSON.stringify({ error: "请提供激活密钥" }), { status: 400 });
    }

    // 开始事务（使用数据库函数处理）
    const { data: result, error: activationError } = await supabaseClient.rpc(
      "activate_membership_with_key",
      {
        p_user_id: user.id,
        p_key_code: key_code.trim().toUpperCase(),
      }
    );

    if (activationError) {
      console.error("激活错误:", activationError);
      return new Response(JSON.stringify({ error: activationError.message || "激活失败" }), {
        status: 400,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "激活成功",
        data: result,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("服务器错误:", error);
    return new Response(JSON.stringify({ error: "服务器内部错误" }), { status: 500 });
  }
});
