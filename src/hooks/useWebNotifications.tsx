import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useWebNotifications = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const checkUpcomingReminders = async () => {
      try {
        const today = new Date();
        const threeDaysLater = new Date(today);
        threeDaysLater.setDate(today.getDate() + 3);

        // Fetch reminders due in the next 3 days
        const { data: reminders, error } = await supabase
          .from('reminders')
          .select(`
            id,
            reminder_date,
            document_id,
            documents (
              name,
              document_type,
              expiry_date
            )
          `)
          .eq('user_id', user.id)
          .eq('is_sent', false)
          .gte('reminder_date', today.toISOString().split('T')[0])
          .lte('reminder_date', threeDaysLater.toISOString().split('T')[0]);

        if (error) {
          console.error('Error fetching reminders:', error);
          return;
        }

        // Show toast notifications for upcoming reminders
        if (reminders && reminders.length > 0) {
          const reminderCount = reminders.length;
          const firstReminder = reminders[0];
          const doc = Array.isArray(firstReminder.documents) 
            ? firstReminder.documents[0] 
            : firstReminder.documents;

          if (reminderCount === 1) {
            toast({
              title: "📅 Upcoming Renewal",
              description: `Your ${doc.document_type.replace('_', ' ')} "${doc.name}" needs renewal soon!`,
              duration: 8000,
            });
          } else {
            toast({
              title: `📅 ${reminderCount} Upcoming Renewals`,
              description: `You have ${reminderCount} documents that need attention. Check your notifications.`,
              duration: 8000,
            });
          }
        }
      } catch (error) {
        console.error('Error checking reminders:', error);
      }
    };

    // Check on mount and every 4 hours
    checkUpcomingReminders();
    const interval = setInterval(checkUpcomingReminders, 4 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);

  return null;
};
