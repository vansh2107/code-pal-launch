import OneSignal from "onesignal-cordova-plugin";
import { supabase } from "@/integrations/supabase/client";

const ONESIGNAL_APP_ID = "8cced195-0fd2-487f-9f10-2a8bc898ff4e";

export const initOneSignal = () => {
  document.addEventListener('deviceready', () => {
    console.log("Initializing OneSignal...");
    
    // Initialize OneSignal
    OneSignal.initialize(ONESIGNAL_APP_ID);

    // Request permission for push notifications
    OneSignal.Notifications.requestPermission(true);

    // Listen for notification clicks
    OneSignal.Notifications.addEventListener("click", (event) => {
      console.log("Notification clicked:", event);
    });

    // Listen for foreground notifications
    OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
      console.log("Notification received in foreground:", event);
    });

    console.log("OneSignal initialized successfully");
  });
};

export const getPlayerId = async (): Promise<string | null> => {
  try {
    const subscription = OneSignal.User.pushSubscription;
    const playerId = subscription.id;
    console.log("OneSignal Player ID:", playerId);
    return playerId || null;
  } catch (error) {
    console.error("Error getting OneSignal Player ID:", error);
    return null;
  }
};

export const savePlayerIdToSupabase = async (userId: string) => {
  try {
    const playerId = await getPlayerId();
    
    if (!playerId) {
      console.log("No Player ID available yet");
      return false;
    }

    // Check if player ID already exists
    const { data: existing } = await supabase
      .from('onesignal_player_ids')
      .select('id')
      .eq('user_id', userId)
      .eq('player_id', playerId)
      .single();

    if (existing) {
      console.log("Player ID already registered");
      return true;
    }

    // Insert new player ID
    const { error } = await supabase
      .from('onesignal_player_ids')
      .insert({
        user_id: userId,
        player_id: playerId,
        device_info: navigator.userAgent
      });

    if (error) {
      console.error("Error saving Player ID:", error);
      return false;
    }

    console.log("Player ID saved to Supabase");
    return true;
  } catch (error) {
    console.error("Error in savePlayerIdToSupabase:", error);
    return false;
  }
};

export const setUserEmail = async (email: string) => {
  try {
    await OneSignal.User.addEmail(email);
    console.log("User email set in OneSignal:", email);
  } catch (error) {
    console.error("Error setting user email:", error);
  }
};
