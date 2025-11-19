import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Reminder {
  id: string;
  reminder_date: string;
  document_id: string;
  is_custom: boolean;
  documents: {
    name: string;
    document_type: string;
    expiry_date: string;
  };
}

export const useLocalNotifications = () => {
  const { user } = useAuth();

  // Note: Document reminders are now handled server-side by the 
  // document-reminder-scheduler edge function, which respects the user's 
  // preferred notification time and timezone settings.
  // This hook is kept for backward compatibility but no longer schedules notifications.

  const scheduleAllReminders = async () => {
    if (!user) return;
    
    // Reminders are now handled by the backend scheduler
    console.log('Document reminders are handled by the server-side scheduler at your preferred notification time');
  };

  useEffect(() => {
    // No-op: reminders are handled server-side
  }, [user]);

  return { scheduleAllReminders };
};
