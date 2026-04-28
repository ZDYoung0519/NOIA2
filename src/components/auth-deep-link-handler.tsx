import { useEffect } from "react";
import { toast } from "sonner";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";

import { useAppTranslation } from "@/hooks/use-app-translation";
import { supabase } from "@/lib/supabase/supabase";

export const AUTH_DEEP_LINK_SCHEME = "noia2";
export const AUTH_DEEP_LINK_CALLBACK_URL = `${AUTH_DEEP_LINK_SCHEME}://auth/callback`;
export const AUTH_OPEN_RECOVERY_EVENT = "auth:open-recovery";

function extractUrlParams(rawUrl: string) {
  const parsedUrl = new URL(rawUrl);
  const hashParams = new URLSearchParams(parsedUrl.hash.startsWith("#") ? parsedUrl.hash.slice(1) : parsedUrl.hash);
  const mergedParams = new URLSearchParams(parsedUrl.search);

  for (const [key, value] of hashParams.entries()) {
    mergedParams.set(key, value);
  }

  return { parsedUrl, params: mergedParams };
}

async function applySessionFromDeepLink(rawUrl: string) {
  const { parsedUrl, params } = extractUrlParams(rawUrl);
  if (parsedUrl.protocol !== `${AUTH_DEEP_LINK_SCHEME}:`) {
    return { handled: false, recovery: false };
  }

  const code = params.get("code");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const authType = params.get("type");
  const recovery = authType === "recovery";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }
    return { handled: true, recovery };
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      throw error;
    }
    return { handled: true, recovery };
  }

  return { handled: false, recovery };
}

export function AuthDeepLinkHandler() {
  const { t } = useAppTranslation();

  useEffect(() => {
    let mounted = true;

    const handleUrls = async (urls: string[]) => {
      for (const rawUrl of urls) {
        try {
          const { handled, recovery } = await applySessionFromDeepLink(rawUrl);
          if (!mounted || !handled) {
            continue;
          }

          if (recovery) {
            window.dispatchEvent(new CustomEvent(AUTH_OPEN_RECOVERY_EVENT));
            toast.success(t("auth.feedback.recoveryReady"));
          } else {
            toast.success(t("auth.feedback.deepLinkSuccess"));
          }
        } catch (error) {
          console.error("failed to handle auth deep link:", error);
          if (mounted) {
            toast.error(t("auth.feedback.deepLinkFailed"));
          }
        }
      }
    };

    const setup = async () => {
      const currentUrls = await getCurrent();
      if (currentUrls && currentUrls.length > 0) {
        await handleUrls(currentUrls);
      }

      const unlisten = await onOpenUrl((urls) => {
        void handleUrls(urls);
      });

      return unlisten;
    };

    let cleanup: (() => void) | undefined;
    void setup().then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [t]);

  return null;
}
