import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  isVoiceGreetingEnabled,
  setVoiceGreetingEnabled,
  resetVoiceGreeting,
} from "@/utils/voiceGreeting";

export function VoiceGreetingToggle() {
  const [enabled, setEnabled] = useState(isVoiceGreetingEnabled);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    setVoiceGreetingEnabled(checked);
    if (checked) {
      // Allow greeting to play again next fresh visit
      resetVoiceGreeting();
    }
  };

  return (
    <div className="flex items-center justify-between py-2">
      <Label htmlFor="voice-greeting" className="text-sm font-medium cursor-pointer">
        Enable Voice Greeting
      </Label>
      <Switch
        id="voice-greeting"
        checked={enabled}
        onCheckedChange={handleToggle}
      />
    </div>
  );
}
