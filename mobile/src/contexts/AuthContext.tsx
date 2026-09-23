import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Role } from '../types';

interface AuthContextProps {
  session: Session | null;
  user: User | null;
  role: Role | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextProps>({
  session: null,
  user: null,
  role: null,
  isLoading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            await fetchRole(session.user.id);
          }
        }
      } catch (e) {
        console.error('Error loading session:', e);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (mounted) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          
          if (newSession?.user) {
            // No bloqueamos el UI mientras carga el rol, pero podríamos
            await fetchRole(newSession.user.id);
          } else {
            setRole(null);
          }
        }
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function fetchRole(userId: string, retries = 2) {
    try {
      const { data, error } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', userId)
        .single();
        
      if (error) {
        // Tolerancia a clock skew (desincronización leve de reloj cliente-servidor): esperar 1.5s y reintentar
        if (error.code === 'PGRST303' && retries > 0) {
          await new Promise((res) => setTimeout(res, 1500));
          return fetchRole(userId, retries - 1);
        }
        throw error;
      }
      setRole(data?.role as Role);
    } catch (e) {
      console.error('Error fetching role:', e);
      setRole(null);
    }
  }

  return (
    <AuthContext.Provider value={{ session, user, role, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
