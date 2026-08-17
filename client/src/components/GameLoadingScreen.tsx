type GameLoadingScreenProps = {
  onRetry: () => void;
};

export default function GameLoadingScreen({ onRetry }: GameLoadingScreenProps) {
  return (
    <main className="arena-shell launcher-shell" aria-live="polite" aria-busy="true">
      <section className="game-loading-panel">
        <p className="eyebrow">PREPARING THE BLOOD RING</p>
        <h1>闘技場を構築中</h1>
        <p>3D戦闘データを読み込んでいます。通信が不安定な場合は再試行できます。</p>
        <div className="game-loading-track" aria-hidden="true"><i /></div>
        <button className="enter-button game-loading-retry" onClick={onRetry}>再試行 <span>↻</span></button>
      </section>
    </main>
  );
}
