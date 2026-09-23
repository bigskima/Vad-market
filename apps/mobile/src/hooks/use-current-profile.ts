import { useCallback, useEffect, useState } from 'react';

import { getMyProfile, type UserProfile } from '@/services/profile-api';

export function useCurrentProfile(userId?: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    try {
      const next = await getMyProfile();
      setProfile(next);
      return next;
    } catch {
      setProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      void getMyProfile()
        .then((next) => {
          if (active) setProfile(next);
        })
        .catch(() => {
          if (active) setProfile(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userId]);

  return { profile, loading, refresh };
}
