import { DoorOpen, Plus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { AVATARS } from "~/game/types";
import type { GameVariant } from "~/game/types";

interface LobbyScreenProps {
  username?: string;
  avatarId?: number;
  roomCode?: string;
  variant?: GameVariant;
  joining?: boolean;
  busy?: boolean;
  error: string;
  onUsernameChange?: (value: string) => void;
  onAvatarChange?: (value: number) => void;
  onRoomCodeChange?: (value: string) => void;
  onVariantChange?: (value: GameVariant) => void;
  onToggleJoin?: () => void;
  onCreateRoom?: () => void;
  onJoinRoom?: () => void;
  onCreate?: (username: string, avatarId: number) => void;
  onJoin?: (roomId: string, username: string, avatarId: number) => void;
}

export default function LobbyScreen({
  username: controlledUsername,
  avatarId: controlledAvatarId,
  roomCode: controlledRoomCode,
  variant: controlledVariant,
  joining: controlledJoining,
  busy = false,
  error,
  onUsernameChange,
  onAvatarChange,
  onRoomCodeChange,
  onVariantChange,
  onToggleJoin,
  onCreateRoom,
  onJoinRoom,
  onCreate,
  onJoin,
}: LobbyScreenProps) {
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const [localUsername, setLocalUsername] = useState("");
  const [localAvatarId, setLocalAvatarId] = useState(0);
  const [localRoomCode, setLocalRoomCode] = useState("");
  const [localVariant, setLocalVariant] = useState<GameVariant>("classic");
  const [localJoining, setLocalJoining] = useState(false);
  const username = controlledUsername ?? localUsername;
  const avatarId = controlledAvatarId ?? localAvatarId;
  const roomCode = controlledRoomCode ?? localRoomCode;
  const variant = controlledVariant ?? localVariant;
  const joining = controlledJoining ?? localJoining;

  const changeUsername = (value: string) => {
    onUsernameChange?.(value);
    if (controlledUsername === undefined) setLocalUsername(value);
  };

  const changeAvatar = (value: number) => {
    onAvatarChange?.(value);
    if (controlledAvatarId === undefined) setLocalAvatarId(value);
  };

  const changeRoomCode = (value: string) => {
    onRoomCodeChange?.(value);
    if (controlledRoomCode === undefined) setLocalRoomCode(value);
  };

  const changeVariant = (value: GameVariant) => {
    onVariantChange?.(value);
    if (controlledVariant === undefined) setLocalVariant(value);
  };

  const create = () => {
    if (!username.trim()) {
      usernameInputRef.current?.focus();
      usernameInputRef.current?.reportValidity();
      return;
    }
    onCreateRoom?.();
    onCreate?.(username.trim(), avatarId);
  };

  const join = () => {
    if (!username.trim()) {
      usernameInputRef.current?.focus();
      usernameInputRef.current?.reportValidity();
      return;
    }
    if (onJoinRoom) onJoinRoom();
    else onJoin?.(roomCode.trim().toUpperCase(), username.trim(), avatarId);
  };

  const toggleJoin = () => {
    onToggleJoin?.();
    if (controlledJoining === undefined) setLocalJoining(true);
  };

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    if (joining) join();
    else toggleJoin();
  };

  return (
    <main className="lobby-shell">
      <section className="lobby-card">
        <div className="brand-lockup lobby-brand">
          <span className="gem-logo" aria-hidden="true" />
          <strong>璀璨宝石</strong>
        </div>
        <p className="hud-label">Splendor Online</p>
        <h1>建立一张新的宝石桌局</h1>
        <p className="lobby-copy">创建或加入房间，和好友在浏览器中完成一局完整的璀璨宝石。</p>

        <form className="lobby-form" onSubmit={submitJoin}>
          <label>
            <span>玩家昵称</span>
            <input
              ref={usernameInputRef}
              value={username}
              maxLength={16}
              required
              onChange={(event) => changeUsername(event.target.value)}
              className="hud-input"
              placeholder="请输入最多 16 字"
              autoComplete="nickname"
              spellCheck={false}
            />
          </label>

          <div className="avatar-field">
            <span>选择头像</span>
            <div className="crest-grid">
              {AVATARS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => changeAvatar(index)}
                  className={`crest-button ${avatarId === index ? "selected" : ""}`}
                  aria-label={`头像 ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!joining ? (
            <div className="variant-field">
              <span>选择玩法</span>
              <div className="variant-toggle" role="radiogroup" aria-label="选择玩法">
                {(["classic", "pokemon"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={variant === value}
                    onClick={() => changeVariant(value)}
                    className={variant === value ? "selected" : ""}
                  >
                    <strong>{value === "pokemon" ? "宝可梦版" : "经典版"}</strong>
                    <small>{value === "pokemon" ? "18 分 · 捕捉与进化" : "15 分 · 贵族来访"}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {joining ? (
            <label>
              <span>房间号</span>
              <input
                value={roomCode}
                maxLength={6}
                onChange={(event) => changeRoomCode(event.target.value.toUpperCase())}
                className="hud-input room-input"
                placeholder="ABC123"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          ) : null}

          {error ? <p className="status-box error-text">{error}</p> : null}

          <div className="button-row">
            <button type="button" onClick={create} className="hud-button" disabled={busy}>
              <Plus size={19} />
              {busy ? "处理中" : "创建房间"}
            </button>
            <button type="submit" className="hud-button secondary" disabled={busy}>
              <DoorOpen size={19} />
              {busy ? "处理中" : joining ? "确认加入" : "加入房间"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
