import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Bell, Play, Check, RotateCcw, Volume2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const NOTIFICATION_TYPES = [
  { key: "expiring_soon", label: "Document Expiring Soon", description: "When a document is about to expire" },
  { key: "expired", label: "Document Expired", description: "When a document has expired" },
  { key: "document_added", label: "Document Added / Scanned", description: "When a new document is added" },
  { key: "important_alerts", label: "Important Alerts", description: "Critical notifications and reminders" },
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

type SoundId = (typeof AVAILABLE_SOUNDS)[number]["id"];
type SoundPreferences = Partial<Record<NotificationType, SoundId>>;

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

export default function NotificationSoundSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<SoundPreferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(true);
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
        .select("notification_sounds, push_notifications_enabled")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      if (data?.notification_sounds && typeof data.notification_sounds === "object") {
        setPreferences(data.notification_sounds as SoundPreferences);
      }
      setGlobalEnabled(data?.push_notifications_enabled ?? true);
    } catch (err) {
      console.error("Error fetching sound preferences:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalToggle = async (enabled: boolean) => {
    if (!user) return;
    setGlobalEnabled(enabled);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ push_notifications_enabled: enabled })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({
        title: enabled ? "Notifications enabled" : "Notifications disabled",
        description: enabled ? "You'll receive notification sounds" : "All notification sounds are muted",
      });
    } catch {
      toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
    }
  };

  const handleSelect = useCallback(
    async (soundId: SoundId) => {
      if (!user || !activeType) return;
      const updated = { ...preferences, [activeType]: soundId };
      setPreferences(updated);
      setSaving(true);
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ notification_sounds: updated as any })
          .eq("user_id", user.id);
        if (error) throw error;
        toast({
          title: "Sound updated",
          description: `Sound for "${NOTIFICATION_TYPES.find((t) => t.key === activeType)?.label}" saved.`,
        });
      } catch {
        toast({ title: "Error", description: "Failed to save sound preference", variant: "destructive" });
      } finally {
        setSaving(false);
        setPickerOpen(false);
      }
    },
    [user, preferences, activeType]
  );

  const handlePlay = useCallback((id: string, frequency: number, pattern: number[]) => {
    setPlayingId(id);
    playTone(frequency, [...pattern]);
    if (playingTimeout.current) clearTimeout(playingTimeout.current);
    playingTimeout.current = setTimeout(() => setPlayingId(null), 1500);
  }, []);

  const handleResetAll = async () => {
    if (!user) return;
    setSaving(true);
    const defaults: SoundPreferences = {};
    NOTIFICATION_TYPES.forEach((t) => { defaults[t.key] = "default"; });
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

  const openPicker = (type: NotificationType) => {
    setActiveType(type);
    setPickerOpen(true);
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
            <h1 className="text-xl font-bold text-foreground">Notification Sounds</h1>
            <p className="text-sm text-muted-foreground">Manage sounds for each notification type</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 w-full max-w-2xl mx-auto space-y-6">
        {/* Global Toggle */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label htmlFor="global-toggle" className="text-base font-medium text-foreground">Notification Sounds</Label>
                <p className="text-sm text-muted-foreground">Enable or disable all sounds</p>
              </div>
            </div>
            <Switch
              id="global-toggle"
              checked={globalEnabled}
              onCheckedChange={handleGlobalToggle}
            />
          </div>
        </div>

        {/* Sound Categories */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          {NOTIFICATION_TYPES.map((type, index) => {
            const selectedLabel = AVAILABLE_SOUNDS.find((s) => s.id === (preferences[type.key] || "default"))?.label || "Default";
            return (
              <button
                key={type.key}
                onClick={() => openPicker(type.key)}
                disabled={!globalEnabled}
                className={cn(
                  "w-full flex items-center justify-between p-4 hover:bg-accent/5 transition-colors text-left",
                  index < NOTIFICATION_TYPES.length - 1 && "border-b border-border/30",
                  !globalEnabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Volume2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{type.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                  </div>
                </div>
                <span className="text-xs text-primary font-medium shrink-0 ml-2">{selectedLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Reset Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleResetAll}
          disabled={saving || !globalEnabled}
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
          <div className="space-y-1 max-h-[60vh] overflow-y-auto py-2">
            {AVAILABLE_SOUNDS.map((sound) => {
              const isSelected = (preferences[activeType!] || "default") === sound.id;
              const uniqueId = `${activeType}-${sound.id}`;
              const isPlaying = playingId === uniqueId;

              return (
                <div
                  key={sound.id}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-3 transition-colors cursor-pointer",
                    isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-accent/5"
                  )}
                  onClick={() => handleSelect(sound.id)}
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
                      <Play className={cn("h-4 w-4", isPlaying ? "text-primary" : "text-muted-foreground")} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

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
