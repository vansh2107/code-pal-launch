package com.vansh.remonkreminder;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "RemonkTTS";
    private static final String PREFS_NAME = "remonk_prefs";
    private static final String KEY_VOICE_GREETING_ENABLED = "voice_greeting_enabled";

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean greetedThisLaunch = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        initTextToSpeech();
    }

    private void initTextToSpeech() {
        try {
            tts = new TextToSpeech(getApplicationContext(), status -> {
                if (status == TextToSpeech.SUCCESS && tts != null) {
                    int result = tts.setLanguage(Locale.US);
                    if (result == TextToSpeech.LANG_MISSING_DATA
                            || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        Log.w(TAG, "Locale.US not supported, falling back to default");
                        tts.setLanguage(Locale.getDefault());
                    }
                    tts.setSpeechRate(1.0f);
                    tts.setPitch(1.0f);
                    ttsReady = true;
                    speakGreetingIfNeeded();
                } else {
                    Log.e(TAG, "TTS initialization failed: " + status);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "TTS init exception", e);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        speakGreetingIfNeeded();
    }

    private void speakGreetingIfNeeded() {
        if (!ttsReady || tts == null || greetedThisLaunch) return;

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        boolean enabled = prefs.getBoolean(KEY_VOICE_GREETING_ENABLED, true);
        if (!enabled) return;

        greetedThisLaunch = true;

        // Slight 1s delay so it doesn't clash with app startup sounds
        handler.postDelayed(() -> {
            try {
                if (tts != null) {
                    tts.speak(
                            "Hello! Welcome to Remonk Reminder",
                            TextToSpeech.QUEUE_FLUSH,
                            null,
                            "remonk_greeting"
                    );
                }
            } catch (Exception e) {
                Log.e(TAG, "TTS speak failed", e);
            }
        }, 1000);
    }

    @Override
    public void onDestroy() {
        try {
            handler.removeCallbacksAndMessages(null);
            if (tts != null) {
                tts.stop();
                tts.shutdown();
                tts = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "TTS shutdown failed", e);
        }
        super.onDestroy();
    }
}
