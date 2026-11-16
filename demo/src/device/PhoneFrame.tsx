import { useEffect, useState } from "react";

// iPhone 14-class screen in CSS points, plus the bezel drawn around it.
const SCREEN_WIDTH = 390;
const SCREEN_HEIGHT = 844;
const BEZEL = 12;
const FRAME_WIDTH = SCREEN_WIDTH + BEZEL * 2;
const FRAME_HEIGHT = SCREEN_HEIGHT + BEZEL * 2;

/** Desktop wrapper: draws a phone and runs the real app inside it at phone size. */
export default function PhoneFrame() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const byHeight = (window.innerHeight - 88) / FRAME_HEIGHT;
      const byWidth = (window.innerWidth - 32) / FRAME_WIDTH;
      setScale(Math.max(0.5, Math.min(1, byHeight, byWidth)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const appSrc = `${window.location.pathname}?device=iphone${window.location.hash}`;

  return (
    <main className="device-stage">
      <div className="device-scaler" style={{ width: FRAME_WIDTH * scale, height: FRAME_HEIGHT * scale }}>
        <div className="device-phone" style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})` }}>
          <iframe
            className="device-screen"
            title="Amphion running on an iPhone-sized screen"
            src={appSrc}
            width={SCREEN_WIDTH}
            height={SCREEN_HEIGHT}
          />
        </div>
      </div>
      <p className="device-caption">
        Amphion front-end demo · mock data, no backend ·{" "}
        <a href="?frame=0">Open without the phone frame</a>
      </p>
    </main>
  );
}
