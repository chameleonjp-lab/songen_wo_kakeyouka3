import { arenaAssets } from "@/game/assets";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { PLAYER_NAME_MAX_LENGTH, sanitizePlayerName } from "@/game/PlayerProfile";

type GameLauncherProps = {
  initialName?: string;
  onEnter: (name: string) => void;
};

export default function GameLauncher({ initialName = "", onEnter }: GameLauncherProps) {
  const [name, setName] = useState(initialName);
  const sanitizedName = useMemo(() => sanitizePlayerName(name), [name]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sanitizedName) onEnter(sanitizedName);
  };

  return (
    <main className="arena-shell launcher-shell" aria-label="尊厳を賭けようか3 起動画面" style={{ "--arena-panel-image": `url("${arenaAssets.visualTarget}")` } as CSSProperties}>
      <section className="intro-panel">
        <div className="arena-seal" aria-hidden="true"><span>Ⅲ</span><i /></div>
        <img className="intro-sigil" src={arenaAssets.sigil} alt="" />
        <p className="eyebrow">BRONZE &amp; BLOOD ARENA</p>
        <h1>尊厳を<br />賭けようか3</h1>
        <p className="intro-copy">6体との一騎打ち。体力を奪うか、頭を狙って尊厳を奪うか、隙を作って心臓を狙うか。戦い方で得点が変わります。</p>
        <p className="threat-line"><span>SIX CONSECUTIVE DUELS</span><strong>6</strong></p>
        <form className="player-name-form" onSubmit={submit}>
          <label htmlFor="player-name">プレイヤー名（必須）</label>
          <input
            id="player-name"
            name="playerName"
            value={name}
            maxLength={PLAYER_NAME_MAX_LENGTH}
            autoComplete="nickname"
            enterKeyHint="done"
            onChange={(event) => setName(event.target.value)}
            placeholder="12文字まで"
          />
          <button className="enter-button" type="submit" disabled={!sanitizedName}>闘技場へ入る <span>↗</span></button>
        </form>
        <p className="input-note">名前はこの端末だけに保存します。アカウント登録はありません。</p>
      </section>
    </main>
  );
}
