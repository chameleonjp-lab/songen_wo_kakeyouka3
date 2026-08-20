import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import GameLauncher from "./components/GameLauncher";
import GameLoadingScreen from "./components/GameLoadingScreen";
import { consumeLocalRetryRequest, loadPlayerName, savePlayerName } from "./game/PlayerProfile";

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const isDemo = query.has("demo");
  const launchAudit = query.has("launchAudit");
  const lazyFailAudit = query.has("lazyFailAudit");
  const [launchRequested, setLaunchRequested] = useState(() => isDemo || consumeLocalRetryRequest());
  const [playerName, setPlayerName] = useState(() => loadPlayerName() || (isDemo ? "DEMO" : ""));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [forceFailure, setForceFailure] = useState(lazyFailAudit);
  const GameCanvas = useMemo(() => lazy(() => {
    if (forceFailure) {
      console.info("[LaunchAudit] forced lazy failure");
      return Promise.reject(new Error("Launch audit forced lazy-load failure"));
    }
    return import("./components/GameCanvas");
  }), [forceFailure, loadAttempt]);

  const retryGameLoad = () => {
    console.info("[LaunchAudit] retry requested");
    setForceFailure(false);
    setLoadAttempt((attempt) => attempt + 1);
  };

  const launchGame = (name: string) => {
    const savedName = savePlayerName(name);
    if (!savedName) return;
    setPlayerName(savedName);
    setLaunchRequested(true);
  };

  useEffect(() => {
    if (launchAudit && !isDemo) {
      console.info("[LaunchAudit] launch requested");
      setLaunchRequested(true);
    }
  }, [isDemo, launchAudit]);

  useEffect(() => {
    if (!lazyFailAudit || !launchRequested || !forceFailure) return;
    const timer = window.setTimeout(retryGameLoad, 450);
    return () => window.clearTimeout(timer);
  }, [forceFailure, launchRequested, lazyFailAudit]);

  return (
    <ErrorBoundary resetKey={loadAttempt} onRetry={retryGameLoad}>
      {launchRequested ? (
        <Suspense fallback={<GameLoadingScreen onRetry={retryGameLoad} />}>
          <GameCanvas autoStart={!isDemo} playerName={playerName || "DEMO"} />
        </Suspense>
      ) : (
        <GameLauncher initialName={playerName} onEnter={launchGame} />
      )}
    </ErrorBoundary>
  );
}
