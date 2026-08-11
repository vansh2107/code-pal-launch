const STORAGE_KEY = "remonk_voice_greeting_played";
const SETTING_KEY = "remonk_voice_greeting_enabled";

export function isVoiceGreetingEnabled(): boolean {
  const val = localStorage.getItem(SETTING_KEY);
  return val === null ? true : val === "true";
}

export function setVoiceGreetingEnabled(enabled: boolean): void {
  localStorage.setItem(SETTING_KEY, String(enabled));
}

export function speakWelcome(): void {
  if (!isVoiceGreetingEnabled()) return;
  if (localStorage.getItem(STORAGE_KEY) === "true") return;
  if (!("speechSynthesis" in window)) return;

  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(
      "Hello! Welcome to Remonk Reminder"
    );
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Pick a natural-sounding English voice if available
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha"))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      localStorage.setItem(STORAGE_KEY, "true");
    };
    utterance.onerror = () => {
      // Mark as played even on error to avoid retrying
      localStorage.setItem(STORAGE_KEY, "true");
    };

    speechSynthesis.speak(utterance);
  };

  // Delay 1.5s, then speak (voices may load async)
  setTimeout(() => {
    if (speechSynthesis.getVoices().length === 0) {
      speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.onvoiceschanged = null;
        speak();
      };
    } else {
      speak();
    }
  }, 1500);
}

/** Reset so greeting plays again on next visit */
export function resetVoiceGreeting(): void {
  localStorage.removeItem(STORAGE_KEY);
}
