import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Bell, Play, Check, RotateCcw, Volume2, Upload, Pause, AlertTriangle, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const NOTIFICATION_TYPES = [
  { key: "expiring_soon", label: "Document Expiring Soon", description: "When a document is about to expire", icon: Bell },
  { key: "expired", label: "Document Expired", description: "When a document has expired", icon: AlertTriangle },
  { key: "document_added", label: "Document Added / Scanned", description: "When a new document is added", icon: Plus },
  { key: "important_alerts", label: "Important Alerts", description: "Critical notifications and reminders", icon: FileText },
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number]["key"];

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

type SoundId = string;

interface NotificationPref {
  enabled: boolean;
  sound: string;
}

type NotificationPreferences = Partial<Record<NotificationType, NotificationPref>>;

function playTone(frequency: number, pattern: number[]) {
  if (frequency === 0 || pattern.length === 0) return;
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  let time = audioCtx.currentTime;
  pattern.forEach((duration, i) => {
    if (i % 2 === 0 || pattern.length === 1) {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, time);
      const dur = duration / 1000;
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(0.3, time + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, time + dur);
      oscillator.start(time);
      oscillator.stop(time + dur);
    }
    time += duration / 1000;
  });
  setTimeout(() => audioCtx.close(), pattern.reduce((a, b) => a + b, 0) + 200);
}

function getDefaultPrefs(): NotificationPreferences {
  const defaults: NotificationPreferences = {};
  NOTIFICATION_TYPES.forEach((t) => {
    defaults[t.key] = { enabled: true, sound: "default" };
  });
  return defaults;
}

// Migrate old format (just sound id strings) to new format (enabled + sound)
function migratePreferences(raw: any): NotificationPreferences {
  if (!raw || typeof raw !== "object") return getDefaultPrefs();
  
  const result: NotificationPreferences = {};
  for (const type of NOTIFICATION_TYPES) {
    const val = raw[type.key];
    if (val && typeof val === "object" && "enabled" in val) {
      result[type.key] = val as NotificationPref;
    } else if (typeof val === "string") {
      // Old format: just a sound id
      result[type.key] = { enabled: val !== "none", sound: val === "none" ? "default" : val };
    } else {
      result[type.key] = { enabled: true, sound: "default" };
    }
  }
  return result;
}

export default function NotificationSoundSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(getDefaultPrefs());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeType, setActiveType] = useState<NotificationType | null>(null);
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
      setPreferences(migratePreferences(data?.notification_sounds));
    } catch (err) {
      console.error("Error fetching preferences:", err);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = useCallback(async (updated: NotificationPreferences) => {
    if (!user) return;
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
  }, [user]);

  const handleToggle = useCallback(async (type: NotificationType, enabled: boolean) => {
    const current = preferences[type] || { enabled: true, sound: "default" };
    const updated = { ...preferences, [type]: { ...current, enabled } };
    setPreferences(updated);
    await savePreferences(updated);
    toast({
      title: enabled ? "Notification enabled" : "Notification muted",
      description: `${NOTIFICATION_TYPES.find(t => t.key === type)?.label}`,
    });
  }, [preferences, savePreferences]);

  const handleSoundSelect = useCallback(async (soundId: SoundId) => {
    if (!activeType) return;
    const current = preferences[activeType] || { enabled: true, sound: "default" };
    const updated = { ...preferences, [activeType]: { ...current, sound: soundId } };
    setPreferences(updated);
    setPickerOpen(false);
    await savePreferences(updated);
    toast({
      title: "Sound updated",
      description: `${NOTIFICATION_TYPES.find(t => t.key === activeType)?.label} → ${AVAILABLE_SOUNDS.find(s => s.id === soundId)?.label || soundId}`,
    });
  }, [activeType, preferences, savePreferences]);

  const handlePlay = useCallback((id: string, frequency: number, pattern: number[]) => {
    setPlayingId(id);
    playTone(frequency, [...pattern]);
    if (playingTimeout.current) clearTimeout(playingTimeout.current);
    playingTimeout.current = setTimeout(() => setPlayingId(null), 1500);
  }, []);

  const handleResetAll = async () => {
    const defaults = getDefaultPrefs();
    setPreferences(defaults);
    await savePreferences(defaults);
    toast({ title: "Reset complete", description: "All notification preferences set to default." });
  };

  const openPicker = (type: NotificationType) => {
    setActiveType(type);
    setPickerOpen(true);
  };

  const getSoundLabel = (soundId: string) => {
    return AVAILABLE_SOUNDS.find(s => s.id === soundId)?.label || "Default";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col w-full" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <header className="bg-card border-b border-border/50 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Notification Preferences</h1>
            <p className="text-sm text-muted-foreground">Control each notification individually</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 w-full max-w-2xl mx-auto space-y-4">
        {/* Per-notification cards */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          {NOTIFICATION_TYPES.map((type, index) => {
            const pref = preferences[type.key] || { enabled: true, sound: "default" };
            const Icon = type.icon;
            return (
              <div
                key={type.key}
                className={cn(
                  "p-4",
                  index < NOTIFICATION_TYPES.length - 1 && "border-b border-border/30"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-foreground">{type.label}</p>
                      <Switch
                        checked={pref.enabled}
                        onCheckedChange={(checked) => handleToggle(type.key, checked)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{type.description}</p>
                    
                    {/* Sound selector row */}
                    <button
                      onClick={() => openPicker(type.key)}
                      disabled={!pref.enabled}
                      className={cn(
                        "flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 transition-colors",
                        pref.enabled
                          ? "bg-accent/10 text-primary hover:bg-accent/20 cursor-pointer"
                          : "bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
                      )}
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span className="font-medium">{getSoundLabel(pref.sound)}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reset Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleResetAll}
          disabled={saving}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset All to Default
        </Button>
      </main>

      {/* Sound Picker Modal */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {NOTIFICATION_TYPES.find((t) => t.key === activeType)?.label || "Select Sound"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1 py-2">
              {AVAILABLE_SOUNDS.map((sound) => {
                const isSelected = (preferences[activeType!]?.sound || "default") === sound.id;
                const uniqueId = `${activeType}-${sound.id}`;
                const isPlaying = playingId === uniqueId;

                return (
                  <div
                    key={sound.id}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-3 py-3 transition-colors cursor-pointer",
                      isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-accent/5"
                    )}
                    onClick={() => handleSoundSelect(sound.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className={cn("text-sm", isSelected ? "font-medium text-foreground" : "text-muted-foreground")}>
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
                          handlePlay(uniqueId, sound.frequency, [...sound.pattern]);
                        }}
                      >
                        {isPlaying ? (
                          <Pause className="h-4 w-4 text-primary" />
                        ) : (
                          <Play className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Import Sound placeholder */}
          <div className="pt-2 border-t border-border/50">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                toast({ title: "Coming soon", description: "Custom sound import will be available in a future update." });
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Import Custom Sound
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNavigation />
    </div>
  );
}
