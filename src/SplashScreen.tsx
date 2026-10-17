import { useEffect, useRef, useState } from "react";
import AmphionLogo from "./AmphionLogo";
import type { Theme } from "./LoginPage";

interface SplashScreenProps {
  theme: Theme;
  onAdvance: () => void;
}

export default function SplashScreen({ theme, onAdvance }: SplashScreenProps) {
  const [leaving, setLeaving] = useState(false);
  const advanced = useRef(false);

  const advance = () => {
    if (advanced.current) return;
    advanced.current = true;
    setLeaving(true);
    window.setTimeout(onAdvance, 220);
  };

  useEffect(() => {
    const timer = window.setTimeout(advance, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main
      className={`splash-screen ${leaving ? "splash-leaving" : ""}`}
      data-theme={theme}
      role="button"
      tabIndex={0}
      aria-label="Amphion. Hear it. Play it. Tap to continue."
      onClick={advance}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") advance();
      }}
    >
      <div className="splash-brand">
        <AmphionLogo size="large" animated />
        <h1>Amphion</h1>
        <p>Hear it. Play it.</p>
      </div>
    </main>
  );
}
