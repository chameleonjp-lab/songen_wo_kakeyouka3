import { arenaAssets } from "@/game/assets";

type GameLauncherProps = {
  onEnter: () => void;
};

export default function GameLauncher({ onEnter }: GameLauncherProps) {
  return (
    <main className="arena-shell launcher-shell" aria-label="Barbarian Arena launcher">
      <section className="intro-panel">
        <div className="arena-seal" aria-hidden="true"><span>Ⅲ</span><i /></div>
        <img className="intro-sigil" src={arenaAssets.sigil} alt="" />
        <p className="eyebrow">COMBAT PROTOTYPE 01</p>
        <h1>群れを割れ。<br />間合いを奪え。</h1>
        <p className="intro-copy">闘技場の準備は必要になった瞬間に始まる。先に軽量な起動画面を表示し、戦いを選んだ時だけ3D戦闘データを読み込む。</p>
        <p className="threat-line"><span>HOSTILES BEYOND THE RING</span><strong>∞</strong></p>
        <button className="enter-button" onClick={onEnter}>ARENAへ入る <span>↗</span></button>
        <p className="input-note">ゲーム開始後に3D闘技場と戦闘アセットを読み込みます。</p>
      </section>
    </main>
  );
}
