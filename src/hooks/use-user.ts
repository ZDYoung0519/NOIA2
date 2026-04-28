import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/supabase";
import { User } from "@supabase/supabase-js";

export interface MembershipStatus {
  is_premium: boolean;
  premium_until: string | null;
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);

  const fetchMembership = useCallback(async () => {
    setMembershipLoading(true);

    try {
      const { data, error } = await supabase.rpc("get_membership_status");

      if (error) {
        console.error("获取会员状态失败:", error);
        setMembership(null);
        return;
      }

      setMembership(data);
    } catch (error) {
      console.error("获取会员状态异常:", error);
      setMembership(null);
    } finally {
      setMembershipLoading(false);
    }
  }, []);

  const fetchUser = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("获取用户失败:", error);
        setUser(null);
        setMembership(null);
        return;
      }

      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        fetchMembership(); // 不要 await，避免卡住用户加载
      } else {
        setMembership(null);
      }
    } catch (error) {
      console.error("获取用户异常:", error);
      setUser(null);
      setMembership(null);
    } finally {
      setLoading(false);
    }
  }, [fetchMembership]);

  useEffect(() => {
    fetchUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;

      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        fetchMembership();
      } else {
        setMembership(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUser, fetchMembership]);

  const refreshUser = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  const refreshMembership = useCallback(async () => {
    await fetchMembership();
  }, [fetchMembership]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMembership(null);
    setLoading(false);
  }, []);

  const isPremium = (() => {
    if (!membership?.is_premium) return false;
    if (!membership.premium_until) return true;
    return new Date(membership.premium_until) >= new Date();
  })();

  return {
    user,
    loading,
    signOut,
    refreshUser,

    membership,
    membershipLoading,
    refreshMembership,
    isPremium,
  };
}
