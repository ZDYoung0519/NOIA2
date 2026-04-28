import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/custom-tooltip";
import { LogOut, User as UserIcon } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/lib/supabase/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function buildAuthLocalization(t: ReturnType<typeof useAppTranslation>["t"]) {
  return {
    variables: {
      sign_in: {
        email_label: t("auth.signIn.emailLabel"),
        password_label: t("auth.signIn.passwordLabel"),
        email_input_placeholder: t("auth.signIn.emailPlaceholder"),
        password_input_placeholder: t("auth.signIn.passwordPlaceholder"),
        button_label: t("auth.signIn.button"),
        loading_button_label: t("auth.signIn.loadingButton"),
        social_provider_text: t("auth.signIn.socialProviderText"),
        link_text: t("auth.signIn.linkText"),
      },
      sign_up: {
        email_label: t("auth.signUp.emailLabel"),
        password_label: t("auth.signUp.passwordLabel"),
        email_input_placeholder: t("auth.signUp.emailPlaceholder"),
        password_input_placeholder: t("auth.signUp.passwordPlaceholder"),
        button_label: t("auth.signUp.button"),
        loading_button_label: t("auth.signUp.loadingButton"),
        social_provider_text: t("auth.signUp.socialProviderText"),
        link_text: t("auth.signUp.linkText"),
        confirmation_text: t("auth.signUp.confirmationText"),
      },
      forgotten_password: {
        email_label: t("auth.forgottenPassword.emailLabel"),
        password_label: t("auth.forgottenPassword.passwordLabel"),
        email_input_placeholder: t("auth.forgottenPassword.emailPlaceholder"),
        button_label: t("auth.forgottenPassword.button"),
        loading_button_label: t("auth.forgottenPassword.loadingButton"),
        link_text: t("auth.forgottenPassword.linkText"),
        confirmation_text: t("auth.forgottenPassword.confirmationText"),
      },
      magic_link: {
        email_input_label: t("auth.magicLink.emailLabel"),
        email_input_placeholder: t("auth.magicLink.emailPlaceholder"),
        button_label: t("auth.magicLink.button"),
        loading_button_label: t("auth.magicLink.loadingButton"),
        link_text: t("auth.magicLink.linkText"),
        confirmation_text: t("auth.magicLink.confirmationText"),
      },
      update_password: {
        password_label: t("auth.updatePassword.passwordLabel"),
        password_input_placeholder: t("auth.updatePassword.passwordPlaceholder"),
        button_label: t("auth.updatePassword.button"),
        loading_button_label: t("auth.updatePassword.loadingButton"),
        confirmation_text: t("auth.updatePassword.confirmationText"),
      },
      verify_otp: {
        email_input_label: t("auth.verifyOtp.emailLabel"),
        email_input_placeholder: t("auth.verifyOtp.emailPlaceholder"),
        phone_input_label: t("auth.verifyOtp.phoneLabel"),
        phone_input_placeholder: t("auth.verifyOtp.phonePlaceholder"),
        token_input_label: t("auth.verifyOtp.tokenLabel"),
        token_input_placeholder: t("auth.verifyOtp.tokenPlaceholder"),
        button_label: t("auth.verifyOtp.button"),
        loading_button_label: t("auth.verifyOtp.loadingButton"),
      },
    },
  };
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const { t } = useAppTranslation();
  const localization = useMemo(() => buildAuthLocalization(t), [t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("auth.title")}</DialogTitle>
        </DialogHeader>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme="dark"
          view="sign_in"
          providers={[]}
          localization={localization}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AuthModal() {
  const { user, signOut, isPremium, membershipLoading, membership } = useUser();
  const { t, i18n } = useAppTranslation();
  const [showAuthModal, setShowAuthModal] = useState(true);

  const userEmail = user?.email ?? "";
  const userName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    userEmail?.split("@")[0] ??
    t("auth.userFallback");
  const avatarUrl = user?.user_metadata?.avatar_url ?? "";

  if (!user) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setShowAuthModal(true)} className="gap-2">
          <UserIcon className="h-4 w-4" />
          {t("auth.signIn.button")}
        </Button>
        <AuthDialog open={showAuthModal} onOpenChange={setShowAuthModal} />
      </>
    );
  }

  const membershipText = membershipLoading
    ? t("auth.membership.loading")
    : isPremium
      ? membership?.premium_until
        ? t("auth.membership.expiresAt", {
            date: new Date(membership.premium_until).toLocaleDateString(
              i18n.language === "zh-CN" ? "zh-CN" : "en-US"
            ),
          })
        : t("auth.membership.permanent")
      : t("auth.membership.inactive");

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/user">
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9 hover:brightness-110">
                <AvatarImage src={avatarUrl} alt={userName} />
                <AvatarFallback>{userName.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
            </Button>
          </Link>
        </TooltipTrigger>

        <TooltipContent side="bottom" align="end" className="w-56 p-0">
          <div className="flex flex-col">
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{userName}</p>

                {isPremium && (
                  <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium">
                    PRO
                  </span>
                )}
              </div>

              <p className="text-muted-foreground mt-0.5 truncate text-xs">{userEmail}</p>
              <p className="text-muted-foreground mt-1 text-xs">{membershipText}</p>
            </div>

            <div className="bg-border h-px" />

            <button
              onClick={(e) => {
                e.preventDefault();
                signOut();
              }}
              className="flex cursor-pointer items-center px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("auth.signOut")}
            </button>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
