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

  const scheduleNotification = (reminder: Reminder) => {
    const reminderDate = new Date(reminder.reminder_date);
    const now = new Date();
    const secondsUntilReminder = Math.floor((reminderDate.getTime() - now.getTime()) / 1000);

    // Only schedule if the reminder is in the future
    if (secondsUntilReminder > 0) {
      const message = `Your ${reminder.documents.document_type} "${reminder.documents.name}" is expiring soon on ${new Date(reminder.documents.expiry_date).toLocaleDateString()}`;
      const title = `Document Expiry Reminder`;
      const url = `/document/${reminder.document_id}`;

      // Schedule local push notification using Despia SDK
      if (typeof window !== 'undefined' && (window as any).despia) {
        (window as any).despia(`sendlocalpushmsg://push.send?s=${secondsUntilReminder}=msg!${encodeURIComponent(message)}&!#${encodeURIComponent(title)}&!#${encodeURIComponent(url)}`);
      }
      
      console.log(`Scheduled notification for ${reminder.documents.name} in ${secondsUntilReminder} seconds`);
    }
  };

  const scheduleAllReminders = async () => {
    if (!user) return;

    try {
      // Fetch all reminders with document details
      const { data: reminders, error } = await supabase
        .from('reminders')
        .select(`
          id,
          reminder_date,
          document_id,
          is_custom,
          is_sent,
          documents (
            name,
            document_type,
            expiry_date
          )
        `)
        .eq('user_id', user.id)
        .eq('is_sent', false)
        .gte('reminder_date', new Date().toISOString().split('T')[0]);

      if (error) {
        console.error('Error fetching reminders:', error);
        return;
      }

      if (reminders && reminders.length > 0) {
        // Schedule notifications for all reminders (AI-generated and custom)
        reminders.forEach((reminder: any) => {
          scheduleNotification(reminder);
        });

        console.log(`Scheduled ${reminders.length} local notifications`);
      }
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  };

  useEffect(() => {
    // Schedule all reminders when user logs in or component mounts
    scheduleAllReminders();

    // Re-schedule reminders every hour to catch any new reminders
    const interval = setInterval(() => {
      scheduleAllReminders();
    }, 3600000); // 1 hour

    return () => clearInterval(interval);
  }, [user]);

  return { scheduleAllReminders };
};
