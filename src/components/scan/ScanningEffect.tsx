import { useEffect, useState } from "react";
import { Loader2, FileSearch, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ScanningEffectProps {
  imageUrl: string;
}

export function ScanningEffect({ imageUrl }: ScanningEffectProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"scanning" | "analyzing" | "extracting">("scanning");

  useEffect(() => {
    // Simulate progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 2;
      });
    }, 80);

    // Update stages
    const stageTimer1 = setTimeout(() => setStage("analyzing"), 2000);
    const stageTimer2 = setTimeout(() => setStage("extracting"), 4000);

    return () => {
      clearInterval(interval);
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
    };
  }, []);

  const getStageText = () => {
    switch (stage) {
      case "scanning":
        return "Scanning document...";
      case "analyzing":
        return "Analyzing content...";
      case "extracting":
        return "Extracting information...";
    }
  };

  const getStageIcon = () => {
    switch (stage) {
      case "scanning":
        return <FileSearch className="h-5 w-5 animate-pulse" />;
      case "analyzing":
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case "extracting":
        return <Sparkles className="h-5 w-5 animate-pulse" />;
    }
  };

  return (
    <div className="relative">
      {/* Image with overlay */}
      <div className="relative rounded-lg overflow-hidden">
        <img src={imageUrl} alt="Scanned document" className="w-full" />
        
        {/* Scanning overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-primary/10">
          {/* Animated scanning line */}
          <div className="absolute inset-0 overflow-hidden">
            <div 
              className="h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line shadow-[0_0_20px_rgba(var(--primary),0.5)]"
              style={{
                animation: "scan-line 2s ease-in-out infinite",
              }}
            />
          </div>
          
          {/* Corner brackets */}
          <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-primary animate-pulse" />
          <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-primary animate-pulse" />
          <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-primary animate-pulse" />
          <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-primary animate-pulse" />
        </div>
      </div>

      {/* Progress section */}
      <div className="mt-4 space-y-3 bg-card/50 backdrop-blur-sm p-4 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            {getStageIcon()}
            <span className="font-medium">{getStageText()}</span>
          </div>
          <span className="text-sm text-muted-foreground">{progress}%</span>
        </div>
        
        <Progress value={progress} className="h-2" />
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${stage === "scanning" ? "bg-primary animate-pulse" : "bg-muted"}`} />
            <span>Scan</span>
          </div>
          <div className="flex-1 flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${stage === "analyzing" ? "bg-primary animate-pulse" : "bg-muted"}`} />
            <span>Analyze</span>
          </div>
          <div className="flex-1 flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${stage === "extracting" ? "bg-primary animate-pulse" : "bg-muted"}`} />
            <span>Extract</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scan-line {
          0% {
            transform: translateY(-100%);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateY(calc(100vh + 100%));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
