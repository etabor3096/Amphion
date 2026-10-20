import { useState } from "react";
import { accountJustDeleted } from "./demoStorage";
import LoginPage from "./LoginPage";
import type { Theme } from "./LoginPage";
import MainApp from "./MainApp";
import SplashScreen from "./SplashScreen";
import StyleGuide from "./StyleGuide";
import DeviceChrome from "./device/DeviceChrome";
import { isInsideDeviceFrame } from "./device/deviceMode";
import { systemTheme } from "./theme";

export default function App() {
  const location = new URL(window.location.href);
  const showStyleGuide =
    location.pathname.endsWith("/style-guide") ||
    location.searchParams.get("page") === "style-guide" ||
    location.hash === "#style-guide";
  const alreadySignedIn = location.hash === "#library";
  const [theme, setTheme] = useState<Theme>(systemTheme);
  const [signedIn, setSignedIn] = useState(alreadySignedIn);
  // Right after deleting the account the page reloads straight to sign-in, which says the account is gone.
  const [showSplash, setShowSplash] = useState(!alreadySignedIn && !accountJustDeleted);
  const [showAccountDeleted, setShowAccountDeleted] = useState(accountJustDeleted);
  const [newAccountName, setNewAccountName] = useState<string>();

  if (showStyleGuide) return <StyleGuide />;

  let screen;
  if (showSplash) {
    screen = <SplashScreen theme={theme} onAdvance={() => setShowSplash(false)} />;
  } else if (signedIn) {
    screen = (
      <MainApp
        theme={theme}
        onThemeChange={setTheme}
        newAccountName={newAccountName}
        onSignOut={() => {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          setSignedIn(false);
        }}
      />
    );
  } else {
    screen = (
      <LoginPage
        theme={theme}
        onThemeChange={setTheme}
        accountDeleted={showAccountDeleted}
        onSignIn={(displayName) => {
          window.history.replaceState(null, "", "#library");
          setNewAccountName(displayName);
          setShowAccountDeleted(false);
          setSignedIn(true);
        }}
      />
    );
  }

  return (
    <>
      {screen}
      {isInsideDeviceFrame() && <DeviceChrome theme={theme} />}
    </>
  );
}
