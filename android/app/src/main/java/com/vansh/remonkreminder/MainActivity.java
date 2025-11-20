package com.vansh.remonkreminder;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.onesignal.OneSignal;

public class MainActivity extends BridgeActivity {
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // OneSignal Initialization
        // Replace "ONESIGNAL-APP-ID-HERE" with your actual OneSignal App ID
        OneSignal.setLogLevel(OneSignal.LOG_LEVEL.VERBOSE, OneSignal.LOG_LEVEL.NONE);
        
        // Initialize OneSignal
        OneSignal.initWithContext(this);
        OneSignal.setAppId("ONESIGNAL-APP-ID-HERE");
        
        // Prompt for push notification permissions
        OneSignal.promptForPushNotifications();
        
        // Get the OneSignal Player ID and send to backend
        OneSignal.addSubscriptionObserver(stateChanges -> {
            if (stateChanges.getTo().getUserId() != null) {
                String playerId = stateChanges.getTo().getUserId();
                // TODO: Send playerId to your Supabase backend
                // You can use JavaScript bridge or create a custom plugin
                registerOneSignalPlayerId(playerId);
            }
        });
    }
    
    private void registerOneSignalPlayerId(String playerId) {
        // This method will be called from JavaScript via bridge
        // Or you can make a direct HTTP call to your Supabase function here
        getBridge().eval(
            "window.OneSignalPlayerId = '" + playerId + "';",
            null
        );
    }
}
