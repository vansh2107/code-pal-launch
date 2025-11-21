import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { savePlayerIdToSupabase, setUserEmail } from '@/lib/onesignal';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Register OneSignal Player ID when user logs in
        if (session?.user && Capacitor.isNativePlatform()) {
          setTimeout(() => {
            savePlayerIdToSupabase(session.user.id);
            if (session.user.email) {
              setUserEmail(session.user.email);
            }
          }, 2000); // Wait 2 seconds for OneSignal to initialize
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Register OneSignal Player ID for existing session
      if (session?.user && Capacitor.isNativePlatform()) {
        setTimeout(() => {
          savePlayerIdToSupabase(session.user.id);
          if (session.user.email) {
            setUserEmail(session.user.email);
          }
        }, 2000);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const deleteAccount = async () => {
    if (!user) {
      throw new Error('No user logged in');
    }

    try {
      // First, delete all user data from the database
      // This includes documents, reminders, audit logs, etc.
      // The CASCADE constraints will handle related data automatically
      
      // Delete user's documents (this will cascade to reminders, document_history, etc.)
      const { error: documentsError } = await supabase
        .from('documents')
        .delete()
        .eq('user_id', user.id);

      if (documentsError) throw documentsError;

      // Delete user's profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      // Delete any remaining audit logs for the user
      const { error: auditError } = await supabase
        .from('audit_logs')
        .delete()
        .eq('user_id', user.id);

      if (auditError) throw auditError;

      // Call the Edge Function to delete the auth user
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        throw new Error('No valid session found');
      }

      const { data, error: functionError } = await supabase.functions.invoke('delete-user-account', {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (functionError) throw functionError;

      // Clear local state and sign out
      setUser(null);
      setSession(null);
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  };

  const value = {
    user,
    session,
    loading,
    signOut,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}