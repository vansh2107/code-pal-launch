import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Volume2, Play, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Notification types with labels
const NOTIFICATION_TYPES = [
  { key: "expiring_soon", label: "Document Expiring Soon" },
  { key: "expired", label: "Document Expired" },
  { key: "document_added", label: "Document Added / Scanned" },
  { key: "important_alerts", label: "Important Alerts" },
  { key: "general", label: "General Notifications" },
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number]["key"];

// Available sounds using Web Audio API tones (no external files needed)
const AVAILABLE_SOUNDS = [
  { id: "default", label: "Default", frequency: 880, pattern: [200] },
  { id: "gentle", label: "Gentle Chime", frequency: 523, pattern: [150, 100, 150] },
  { id: "alert", label: "Alert Tone", frequency: 1046, pattern: [100, 50, 100, 50, 100] },
  { id: "soft_bell", label: "Soft Bell", frequency: 659, pattern: [300] },
  { id: "double_tap", label: "Double Tap", frequency: 784, pattern: [80, 120, 80] },
  { id: "urgent", label: "Urgent", frequency: 1175, pattern: [60, 40, 60, 40, 60, 40, 60] },
  { id: "calm", label: "Calm Wave", frequency: 440, pattern: [400] },
  { id: "none", label: "Silent", frequency: 0, pattern: [] },
] as const;

type SoundId = (typeof AVAILABLE_SOUNDS)[number]["id"];
type SoundPreferences = Partial<Record<NotificationType, SoundId>>;

// Play a tone using Web Audio API
function playTone(frequency: number, pattern: number[]) {
  if (frequency === 0 || pattern.length === 0) return;

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  let time = audioCtx.currentTime;

  pattern.forEach((duration, i) => {
    if (i % 2 === 0 || pattern.length === 1) {
      // Sound segment
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, time);

      // Fade in/out for smooth sound
      const dur = duration / 1000;
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(0.3, time + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, time + dur);

      oscillator.start(time);
      oscillator.stop(time + dur);
    }
    time += duration / 1000;
  });

  // Cleanup
  setTimeout(() => audioCtx.close(), pattern.reduce((a, b) => a + b, 0) + 200);
}

interface SoundSelectorProps {
  notificationType: NotificationType;
  label: string;
  selectedSound: SoundId;
  onSelect: (type: NotificationType, sound: SoundId) => void;
  playingId: string | null;
  onPlay: (id: string) => void;
}

function SoundSelector({
  notificationType,
  label,
  selectedSound,
  onSelect,
  playingId,
  onPlay,
}: SoundSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const selectedLabel =
    AVAILABLE_SOUNDS.find((s) => s.id === selectedSound)?.label || "Default";

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/5 transition-colors"
      >
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{selectedLabel}</p>
        </div>
        <Volume2 className="h-4 w-4 text-muted-foreground" />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1 animate-fade-in">
          {AVAILABLE_SOUNDS.map((sound) => {
            const isSelected = selectedSound === sound.id;
            const uniqueId = `${notificationType}-${sound.id}`;
            const isPlaying = playingId === uniqueId;

            return (
              <div
                key={sound.id}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors cursor-pointer",
                  isSelected
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-accent/5"
                )}
                onClick={() => onSelect(notificationType, sound.id)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40"
                    )}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <span
                    className={cn(
                      "text-sm",
                      isSelected ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {sound.label}
                  </span>
                </div>

                {sound.id !== "none" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlay(uniqueId);
                      playTone(sound.frequency, [...sound.pattern]);
                    }}
                  >
                    <Play
                      className={cn(
                        "h-3.5 w-3.5",
                        isPlaying ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NotificationSounds() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<SoundPreferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playingTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (user) fetchPreferences();
  }, [user]);

  const fetchPreferences = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("notification_sounds")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      if (data?.notification_sounds && typeof data.notification_sounds === "object") {
        setPreferences(data.notification_sounds as SoundPreferences);
      }
    } catch (err) {
      console.error("Error fetching sound preferences:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = useCallback(
    async (type: NotificationType, soundId: SoundId) => {
      if (!user) return;

      const updated = { ...preferences, [type]: soundId };
      setPreferences(updated);
      setSaving(true);

      try {
        const { error } = await supabase
          .from("profiles")
          .update({ notification_sounds: updated as any })
          .eq("user_id", user.id);

        if (error) throw error;

        toast({ title: "Sound updated", description: `Sound for "${NOTIFICATION_TYPES.find((t) => t.key === type)?.label}" saved.` });
      } catch (err) {
        console.error("Error saving sound preference:", err);
        toast({ title: "Error", description: "Failed to save sound preference", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [user, preferences]
  );

  const handlePlay = useCallback((id: string) => {
    setPlayingId(id);
    if (playingTimeout.current) clearTimeout(playingTimeout.current);
    playingTimeout.current = setTimeout(() => setPlayingId(null), 1500);
  }, []);

  const handleResetAll = async () => {
    if (!user) return;
    setSaving(true);
    const defaults: SoundPreferences = {};
    NOTIFICATION_TYPES.forEach((t) => {
      defaults[t.key] = "default";
    });
    setPreferences(defaults);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ notification_sounds: defaults as any })
        .eq("user_id", user.id);

      if (error) throw error;
      toast({ title: "Reset complete", description: "All notification sounds set to default." });
    } catch {
      toast({ title: "Error", description: "Failed to reset sounds", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      {NOTIFICATION_TYPES.map((type) => (
        <SoundSelector
          key={type.key}
          notificationType={type.key}
          label={type.label}
          selectedSound={preferences[type.key] || "default"}
          onSelect={handleSelect}
          playingId={playingId}
          onPlay={handlePlay}
        />
      ))}

      <div className="p-4 border-t border-border/50">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleResetAll}
          disabled={saving}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-2" />
          Reset All to Default
        </Button>
      </div>
    </div>
  );
}
