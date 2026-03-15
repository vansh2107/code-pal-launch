import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Volume2, Play, Check, RotateCcw, ChevronRight, Upload, X, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Constants ──────────────────────────────────────────────────────────────────

const NOTIFICATION_TYPES = [
  { key: "expiring_soon", label: "Document Expiring Soon" },
  { key: "expired", label: "Document Expired" },
  { key: "document_added", label: "Document Added / Scanned" },
  { key: "important_alerts", label: "Important Alerts" },
  { key: "general", label: "General Notifications" },
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number]["key"];

const BUILT_IN_SOUNDS = [
  { id: "default", label: "Default", frequency: 880, pattern: [200] },
  { id: "gentle", label: "Gentle Chime", frequency: 523, pattern: [150, 100, 150] },
  { id: "alert", label: "Alert Tone", frequency: 1046, pattern: [100, 50, 100, 50, 100] },
  { id: "soft_bell", label: "Soft Bell", frequency: 659, pattern: [300] },
  { id: "double_tap", label: "Double Tap", frequency: 784, pattern: [80, 120, 80] },
  { id: "urgent", label: "Urgent", frequency: 1175, pattern: [60, 40, 60, 40, 60, 40, 60] },
  { id: "calm", label: "Calm Wave", frequency: 440, pattern: [400] },
  { id: "none", label: "Silent", frequency: 0, pattern: [] },
] as const;

type SoundId = string;
type SoundPreferences = Partial<Record<NotificationType, SoundId>>;

interface CustomSound {
  id: string;
  label: string;
  dataUrl: string;
}

// ── Audio helpers ──────────────────────────────────────────────────────────────

function playTone(frequency: number, pattern: number[]) {
  if (frequency === 0 || pattern.length === 0) return;
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  let time = audioCtx.currentTime;
  pattern.forEach((duration, i) => {
    if (i % 2 === 0 || pattern.length === 1) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, time);
      const dur = duration / 1000;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.3, time + 0.01);
      gain.gain.linearRampToValueAtTime(0, time + dur);
      osc.start(time);
      osc.stop(time + dur);
    }
    time += duration / 1000;
  });
  setTimeout(() => audioCtx.close(), pattern.reduce((a, b) => a + b, 0) + 200);
}

function playCustomSound(dataUrl: string): HTMLAudioElement {
  const audio = new Audio(dataUrl);
  audio.play().catch(() => {});
  return audio;
}

// ── Local storage for custom sounds ────────────────────────────────────────────

const CUSTOM_SOUNDS_KEY = "app_custom_notification_sounds";

function loadCustomSounds(): CustomSound[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SOUNDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomSounds(sounds: CustomSound[]) {
  localStorage.setItem(CUSTOM_SOUNDS_KEY, JSON.stringify(sounds));
}

// ── Sound Picker Dialog ────────────────────────────────────────────────────────

interface SoundPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  selectedSound: SoundId;
  customSounds: CustomSound[];
  onSelect: (soundId: SoundId) => void;
  onImport: (sound: CustomSound) => void;
}

function SoundPicker({
  open,
  onOpenChange,
  label,
  selectedSound,
  customSounds,
  onSelect,
  onImport,
}: SoundPickerProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playTimeout = useRef<NodeJS.Timeout>();

  const stopPlaying = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
    if (playTimeout.current) clearTimeout(playTimeout.current);
  }, []);

  const handlePreview = useCallback(
    (soundId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      stopPlaying();

      // Check if it's a built-in sound
      const builtIn = BUILT_IN_SOUNDS.find((s) => s.id === soundId);
      if (builtIn) {
        if (builtIn.frequency === 0) return;
        setPlayingId(soundId);
        playTone(builtIn.frequency, [...builtIn.pattern]);
        playTimeout.current = setTimeout(
          () => setPlayingId(null),
          builtIn.pattern.reduce((a, b) => a + b, 0) + 200
        );
        return;
      }

      // Custom sound
      const custom = customSounds.find((s) => s.id === soundId);
      if (custom) {
        setPlayingId(soundId);
        audioRef.current = playCustomSound(custom.dataUrl);
        audioRef.current.onended = () => setPlayingId(null);
      }
    },
    [customSounds, stopPlaying]
  );

  const handleSelect = useCallback(
    (soundId: string) => {
      stopPlaying();
      onSelect(soundId);
      onOpenChange(false);
    },
    [onSelect, onOpenChange, stopPlaying]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "Maximum 5MB", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const name = file.name.replace(/\.[^/.]+$/, "");
        const id = `custom_${Date.now()}`;
        onImport({ id, label: name, dataUrl });
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [onImport]
  );

  const allSounds: { id: string; label: string; isCustom: boolean }[] = [
    ...BUILT_IN_SOUNDS.map((s) => ({ id: s.id, label: s.label, isCustom: false })),
    ...customSounds.map((s) => ({ id: s.id, label: s.label, isCustom: true })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold">{label}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="px-2 pb-2">
            {allSounds.map((sound) => {
              const isSelected = selectedSound === sound.id;
              const isPlaying = playingId === sound.id;

              return (
                <button
                  key={sound.id}
                  onClick={() => handleSelect(sound.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left",
                    isSelected ? "bg-primary/10" : "hover:bg-accent/5"
                  )}
                >
                  {/* Radio indicator */}
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>

                  {/* Label */}
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      isSelected ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {sound.label}
                    {sound.isCustom && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                        imported
                      </span>
                    )}
                  </span>

                  {/* Play button */}
                  {sound.id !== "none" && (
                    <div
                      role="button"
                      onClick={(e) => handlePreview(sound.id, e)}
                      className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent/10 shrink-0"
                    >
                      {isPlaying ? (
                        <Pause className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Play className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Import button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-accent/5 transition-colors text-left mt-1 border-t border-border/40 pt-3"
            >
              <div className="w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0">
                <Upload className="h-2.5 w-2.5 text-muted-foreground/50" />
              </div>
              <span className="text-sm text-muted-foreground">Import Sound…</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg,audio/mp3,.mp3,.wav,.ogg"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function NotificationSounds() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<SoundPreferences>({});
  const [customSounds, setCustomSounds] = useState<CustomSound[]>(loadCustomSounds);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerState, setPickerState] = useState<{
    open: boolean;
    type: NotificationType;
    label: string;
  }>({ open: false, type: "general", label: "" });

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
    async (soundId: SoundId) => {
      if (!user) return;
      const type = pickerState.type;
      const updated = { ...preferences, [type]: soundId };
      setPreferences(updated);
      setSaving(true);
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ notification_sounds: updated as any })
          .eq("user_id", user.id);
        if (error) throw error;
      } catch {
        toast({ title: "Error", description: "Failed to save preference", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [user, preferences, pickerState.type]
  );

  const handleImport = useCallback(
    (sound: CustomSound) => {
      const updated = [...customSounds, sound];
      setCustomSounds(updated);
      saveCustomSounds(updated);
      toast({ title: "Sound imported", description: `"${sound.label}" is now available.` });
    },
    [customSounds]
  );

  const handleResetAll = async () => {
    if (!user) return;
    setSaving(true);
    const defaults: SoundPreferences = {};
    NOTIFICATION_TYPES.forEach((t) => (defaults[t.key] = "default"));
    setPreferences(defaults);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ notification_sounds: defaults as any })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Reset complete", description: "All sounds set to default." });
    } catch {
      toast({ title: "Error", description: "Failed to reset", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getSoundLabel = (soundId: SoundId): string => {
    const builtIn = BUILT_IN_SOUNDS.find((s) => s.id === soundId);
    if (builtIn) return builtIn.label;
    const custom = customSounds.find((s) => s.id === soundId);
    if (custom) return custom.label;
    return "Default";
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border/40">
        {NOTIFICATION_TYPES.map((type) => {
          const currentSound = preferences[type.key] || "default";
          return (
            <button
              key={type.key}
              onClick={() =>
                setPickerState({ open: true, type: type.key, label: type.label })
              }
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/5 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{type.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {getSoundLabel(currentSound)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Reset */}
      <div className="px-4 py-3 border-t border-border/30">
        <button
          onClick={handleResetAll}
          disabled={saving}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" />
          Reset all to default
        </button>
      </div>

      {/* Sound picker dialog */}
      <SoundPicker
        open={pickerState.open}
        onOpenChange={(open) => setPickerState((s) => ({ ...s, open }))}
        label={pickerState.label}
        selectedSound={preferences[pickerState.type] || "default"}
        customSounds={customSounds}
        onSelect={handleSelect}
        onImport={handleImport}
      />
    </>
  );
}
