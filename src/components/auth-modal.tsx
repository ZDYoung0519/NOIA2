import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/custom-tooltip";
import { Input } from "@/components/ui/input";
import { LogOut, User as UserIcon } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { supabase } from "@/lib/supabase/supabase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AUTH_DEEP_LINK_CALLBACK_URL,
  AUTH_OPEN_RECOVERY_EVENT,
} from "@/components/auth-deep-link-handler";

type AuthView = "sign_in" | "sign_up" | "forgot_password" | "update_password";

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialView: AuthView;
};

type AuthFormState = {
  email: string;
  password: string;
  confirmPassword: string;
};

const INITIAL_FORM_STATE: AuthFormState = {
  email: "",
  password: "",
  confirmPassword: "",
};

function looksLikeUserAlreadyExistsSignUpResult(
  user: { identities?: ArrayLike<unknown> | null } | null | undefined
) {
  return Boolean(user && user.identities && user.identities.length === 0);
}

function AuthDialog({ open, onOpenChange, initialView }: AuthDialogProps) {
  const { t } = useAppTranslation();
  const [view, setView] = useState<AuthView>(initialView);
  const [form, setForm] = useState<AuthFormState>(INITIAL_FORM_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setView(initialView);
    setSubmitting(false);
    setErrorMessage("");
    setSuccessMessage("");
    setForm((current) =>
      initialView === "forgot_password"
        ? { ...INITIAL_FORM_STATE, email: current.email }
        : INITIAL_FORM_STATE
    );
  }, [initialView, open]);

  const dialogTitle = useMemo(() => {
    if (view === "sign_up") return t("auth.signUp.button");
    if (view === "forgot_password") return t("auth.forgottenPassword.button");
    if (view === "update_password") return t("auth.updatePassword.button");
    return t("auth.signIn.button");
  }, [t, view]);

  const dialogDescription = useMemo(() => {
    if (view === "sign_up") return t("auth.signUp.description");
    if (view === "forgot_password") return t("auth.forgottenPassword.description");
    if (view === "update_password") return t("auth.updatePassword.description");
    return t("auth.signIn.description");
  }, [t, view]);

  const switchView = (nextView: AuthView) => {
    setView(nextView);
    setSubmitting(false);
    setErrorMessage("");
    setSuccessMessage("");
    setForm((current) =>
      nextView === "forgot_password"
        ? { ...INITIAL_FORM_STATE, email: current.email }
        : INITIAL_FORM_STATE
    );
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setView("sign_in");
      setSubmitting(false);
      setErrorMessage("");
      setSuccessMessage("");
    }
  };

  const setField = (key: keyof AuthFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const validatePasswordPair = (password: string, confirmPassword: string) => {
    if (!password) {
      return "Password is required.";
    }
    if (password.length < 6) {
      return "Password must be at least 6 characters long.";
    }
    if (password !== confirmPassword) {
      return "The two passwords do not match.";
    }
    return "";
  };

  const mapAuthErrorMessage = (message: string, currentView: AuthView) => {
    const normalized = message.toLowerCase();

    if (
      normalized.includes("invalid login credentials") ||
      normalized.includes("email not confirmed")
    ) {
      return t("auth.feedback.invalidCredentials");
    }

    if (normalized.includes("user already registered")) {
      return t("auth.feedback.userAlreadyExists");
    }

    if (normalized.includes("unable to validate email address")) {
      return t("auth.validation.invalidEmail");
    }

    if (normalized.includes("for security purposes")) {
      return currentView === "forgot_password"
        ? t("auth.feedback.resetEmailAlreadySent")
        : t("auth.feedback.rateLimited");
    }

    return message;
  };

  const handleSubmit = async () => {
    const email = form.email.trim();
    const password = form.password;
    const confirmPassword = form.confirmPassword;

    if (view !== "update_password" && !email) {
      setErrorMessage("Email is required.");
      return;
    }

    if ((view === "sign_in" || view === "sign_up") && !password) {
      setErrorMessage("Password is required.");
      return;
    }

    if (view === "sign_up" || view === "update_password") {
      const validationMessage = validatePasswordPair(password, confirmPassword);
      if (validationMessage) {
        setErrorMessage(validationMessage);
        return;
      }
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      if (view === "sign_in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setErrorMessage(mapAuthErrorMessage(error.message, view));
          return;
        }

        toast.success(t("auth.signIn.button"));
        handleOpenChange(false);
        return;
      }

      if (view === "sign_up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: AUTH_DEEP_LINK_CALLBACK_URL,
          },
        });

        if (error) {
          setErrorMessage(mapAuthErrorMessage(error.message, view));
          return;
        }

        if (looksLikeUserAlreadyExistsSignUpResult(data.user)) {
          setErrorMessage(t("auth.feedback.userAlreadyExists"));
          return;
        }

        toast.success(t("auth.signUp.confirmationText"));
        setView("sign_in");
        setSuccessMessage(t("auth.signUp.confirmationText"));
        setForm({ ...INITIAL_FORM_STATE, email });
        return;
      }

      if (view === "forgot_password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: AUTH_DEEP_LINK_CALLBACK_URL,
        });

        if (error) {
          setErrorMessage(mapAuthErrorMessage(error.message, view));
          return;
        }

        toast.success(t("auth.forgottenPassword.confirmationText"));
        setView("sign_in");
        setSuccessMessage(t("auth.forgottenPassword.confirmationText"));
        setForm({ ...INITIAL_FORM_STATE, email });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(mapAuthErrorMessage(error.message, view));
        return;
      }

      toast.success(t("auth.updatePassword.confirmationText"));
      handleOpenChange(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        {view === "sign_in" || view === "sign_up" ? (
          <div className="bg-muted grid grid-cols-2 rounded-lg p-1">
            <button
              type="button"
              onClick={() => switchView("sign_in")}
              className={`rounded-md px-3 py-2 text-sm transition ${
                view === "sign_in"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("auth.signIn.button")}
            </button>
            <button
              type="button"
              onClick={() => switchView("sign_up")}
              className={`rounded-md px-3 py-2 text-sm transition ${
                view === "sign_up"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("auth.signUp.button")}
            </button>
          </div>
        ) : null}

        <div className="space-y-4">
          {view !== "update_password" ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {view === "forgot_password"
                  ? t("auth.forgottenPassword.emailLabel")
                  : view === "sign_up"
                      ? t("auth.signUp.emailLabel")
                      : t("auth.signIn.emailLabel")}
              </div>
              <Input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setField("email", event.currentTarget.value)}
                placeholder={
                  view === "forgot_password"
                    ? t("auth.forgottenPassword.emailPlaceholder")
                    : view === "sign_up"
                        ? t("auth.signUp.emailPlaceholder")
                        : t("auth.signIn.emailPlaceholder")
                }
              />
            </div>
          ) : null}

          {view === "sign_in" || view === "sign_up" ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {view === "sign_up"
                  ? t("auth.signUp.passwordLabel")
                  : t("auth.signIn.passwordLabel")}
              </div>
              <Input
                type="password"
                autoComplete={view === "sign_up" ? "new-password" : "current-password"}
                value={form.password}
                onChange={(event) => setField("password", event.currentTarget.value)}
                placeholder={
                  view === "sign_up"
                    ? t("auth.signUp.passwordPlaceholder")
                    : t("auth.signIn.passwordPlaceholder")
                }
              />
            </div>
          ) : null}

          {view === "sign_up" || view === "update_password" ? (
            <>
              {view === "update_password" ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("auth.updatePassword.passwordLabel")}</div>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => setField("password", event.currentTarget.value)}
                    placeholder={t("auth.updatePassword.passwordPlaceholder")}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {view === "sign_up"
                    ? t("auth.signUp.confirmPasswordLabel")
                    : t("auth.updatePassword.confirmPasswordLabel")}
                </div>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(event) => setField("confirmPassword", event.currentTarget.value)}
                  placeholder={
                    view === "sign_up"
                      ? t("auth.signUp.confirmPasswordPlaceholder")
                      : t("auth.updatePassword.confirmPasswordPlaceholder")
                  }
                />
              </div>
            </>
          ) : null}

          {successMessage ? <div className="text-sm text-green-600">{successMessage}</div> : null}
          {errorMessage ? <div className="text-sm text-red-500">{errorMessage}</div> : null}

          <Button onClick={() => void handleSubmit()} className="w-full" disabled={submitting}>
            {submitting
              ? view === "sign_up"
                ? t("auth.signUp.loadingButton")
                : view === "forgot_password"
                    ? t("auth.forgottenPassword.loadingButton")
                    : view === "update_password"
                      ? t("auth.updatePassword.loadingButton")
                      : t("auth.signIn.loadingButton")
              : view === "sign_up"
                ? t("auth.signUp.button")
                : view === "forgot_password"
                    ? t("auth.forgottenPassword.button")
                    : view === "update_password"
                      ? t("auth.updatePassword.button")
                      : t("auth.signIn.button")}
          </Button>

          <div className="flex items-center justify-between gap-3 text-sm">
            {view === "forgot_password" || view === "update_password" ? (
              <button
                type="button"
                onClick={() => switchView("sign_in")}
                className="text-muted-foreground hover:text-foreground transition"
              >
                {t("auth.forgottenPassword.backToSignIn")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchView("forgot_password")}
                className="text-muted-foreground hover:text-foreground transition"
              >
                {t("auth.forgottenPassword.linkText")}
              </button>
            )}

            <div className="flex items-center gap-3">
              {view === "sign_in" ? (
                <button
                  type="button"
                  onClick={() => switchView("sign_up")}
                  className="text-primary hover:text-primary/80 transition"
                >
                  {t("auth.signUp.linkText")}
                </button>
              ) : view === "sign_up" ? (
                <button
                  type="button"
                  onClick={() => switchView("sign_in")}
                  className="text-primary hover:text-primary/80 transition"
                >
                  {t("auth.signIn.linkText")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AuthModal() {
  const { user, signOut, isPremium, membershipLoading, membership } = useUser();
  const { t, i18n } = useAppTranslation();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("sign_in");

  useEffect(() => {
    const openRecovery = () => {
      setAuthView("update_password");
      setShowAuthModal(true);
    };

    window.addEventListener(AUTH_OPEN_RECOVERY_EVENT, openRecovery);
    return () => {
      window.removeEventListener(AUTH_OPEN_RECOVERY_EVENT, openRecovery);
    };
  }, []);

  const userEmail = user?.email ?? "";
  const userName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    userEmail?.split("@")[0] ??
    t("auth.userFallback");
  const avatarUrl = user?.user_metadata?.avatar_url ?? "";

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
    <>
      {!user ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAuthView("sign_in");
            setShowAuthModal(true);
          }}
          className="gap-2"
        >
          <UserIcon className="h-4 w-4" />
          {t("auth.signIn.button")}
        </Button>
      ) : (
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
      )}

      <AuthDialog
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        initialView={authView}
      />
    </>
  );
}
