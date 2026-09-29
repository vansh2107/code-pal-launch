package com.vansh.remonkreminder;

import android.app.Application;

/**
 * OneSignal is initialized once from JavaScript (src/lib/onesignal.ts) so that
 * init, login(userId) and the permission prompt happen in one ordered flow.
 * Do NOT initialize OneSignal here — a second init resets the SDK and drops
 * the account link, which stops pushes from reaching the device.
 */
public class ApplicationClass extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
    }
}
