import { useEffect, useMemo, useState } from 'react';
import { socket } from './socket';
import { GameOverModal } from './components/GameOverModal';
import { GameBoard } from './components/GameBoard';
import LobbyScreen from './components/LobbyScreen';
import { WaitingRoom } from './components/WaitingRoom';
import type { GameOverPayload, GameState, RoomState } from './types';

type Screen = 'lobby' | 'waiting' | 'game';

function inviteRoomFromUrl() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase().slice(0, 6) ?? '';
}

export default function App() {
  const invitedRoomId = inviteRoomFromUrl();
  const [screen, setScreen] = useState<Screen>('lobby');
  const [roomId, setRoomId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [error, setError] = useState('');
  const [discardExcess, setDiscardExcess] = useState(0);
  const [lobbyUsername, setLobbyUsername] = useState('');
  const [lobbyAvatarId, setLobbyAvatarId] = useState(0);
  const [lobbyRoomCode, setLobbyRoomCode] = useState(invitedRoomId);
  const [lobbyJoining, setLobbyJoining] = useState(Boolean(invitedRoomId));
  const [lobbyBusy, setLobbyBusy] = useState(false);

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const preventNativeDrag = (event: DragEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[data-allow-native-drag="true"]')) return;
      event.preventDefault();
    };

    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('dragstart', preventNativeDrag);
    document.addEventListener('dragover', preventNativeDrag);
    document.addEventListener('drop', preventNativeDrag);
    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('dragstart', preventNativeDrag);
      document.removeEventListener('dragover', preventNativeDrag);
      document.removeEventListener('drop', preventNativeDrag);
    };
  }, []);

  useEffect(() => {
    const onRoomUpdated = (state: RoomState) => {
      setRoomState(state);
      setRoomId(state.roomId);
      if (!state.started) setScreen('waiting');
    };
    const onGameState = (state: GameState) => {
      setGameState(state);
      setRoomId(state.roomId);
      setPlayerId((prev) => prev || state.myPlayerId);
      setScreen('game');
      if (!state.pendingDiscardPlayerId) setDiscardExcess(0);
    };
    const onActionRequired = (data: { type: 'discard_tokens'; excess: number }) => {
      if (data.type === 'discard_tokens') setDiscardExcess(data.excess);
    };
    const onGameOver = (payload: GameOverPayload) => {
      setGameOver(payload);
      setScreen('game');
    };
    const onError = (payload: { message: string }) => setError(payload.message);

    socket.on('room_updated', onRoomUpdated);
    socket.on('game_state', onGameState);
    socket.on('action_required', onActionRequired);
    socket.on('game_over', onGameOver);
    socket.on('error', onError);
    return () => {
      socket.off('room_updated', onRoomUpdated);
      socket.off('game_state', onGameState);
      socket.off('action_required', onActionRequired);
      socket.off('game_over', onGameOver);
      socket.off('error', onError);
    };
  }, []);

  const myPlayer = useMemo(() => {
    if (gameState) return gameState.players.find((player) => player.id === gameState.myPlayerId) ?? null;
    if (roomState && playerId) return roomState.players.find((player) => player.id === playerId) ?? null;
    return null;
  }, [gameState, playerId, roomState]);

  const createRoom = (username: string, avatarId: number) => {
    const cleanUsername = username.trim();
    setError('');
    if (!cleanUsername) {
      setError('请输入玩家昵称。');
      return;
    }
    setLobbyBusy(true);
    socket.emit('create_room', { username: cleanUsername, avatarId }, (response: { roomId?: string; playerId?: string; error?: string }) => {
      setLobbyBusy(false);
      if (response.error || !response.roomId || !response.playerId) {
        setError(response.error ?? '创建房间失败');
        return;
      }
      setRoomId(response.roomId);
      setPlayerId(response.playerId);
      setScreen('waiting');
    });
  };

  const joinRoom = (targetRoomId: string, username: string, avatarId: number) => {
    const cleanRoomId = targetRoomId.trim().toUpperCase();
    const cleanUsername = username.trim();
    setError('');
    if (!cleanUsername) {
      setError('请输入玩家昵称。');
      return;
    }
    if (!cleanRoomId) {
      setError('请输入邀请链接中的房间号。');
      return;
    }
    setLobbyBusy(true);
    socket.emit('join_room', { roomId: cleanRoomId, username: cleanUsername, avatarId }, (response: { playerId?: string; error?: string }) => {
      setLobbyBusy(false);
      if (response.error || !response.playerId) {
        setError(response.error ?? '加入房间失败');
        return;
      }
      setRoomId(cleanRoomId);
      setPlayerId(response.playerId);
      setScreen('waiting');
    });
  };

  const startGame = () => {
    setError('');
    socket.emit('start_game', { roomId }, (response: { error?: string }) => {
      if (response.error) setError(response.error);
    });
  };

  const resetToLobby = () => {
    setScreen('lobby');
    setRoomId('');
    setPlayerId('');
    setRoomState(null);
    setGameState(null);
    setGameOver(null);
    setDiscardExcess(0);
    setError('');
    setLobbyBusy(false);
  };

  if (screen === 'lobby') {
    return (
      <LobbyScreen
        username={lobbyUsername}
        avatarId={lobbyAvatarId}
        roomCode={lobbyRoomCode}
        joining={lobbyJoining}
        busy={lobbyBusy}
        error={error}
        onUsernameChange={setLobbyUsername}
        onAvatarChange={setLobbyAvatarId}
        onRoomCodeChange={(value) => setLobbyRoomCode(value.toUpperCase().slice(0, 6))}
        onToggleJoin={() => setLobbyJoining(true)}
        onCreate={createRoom}
        onJoin={joinRoom}
      />
    );
  }

  if (screen === 'waiting' && roomState) {
    return (
      <WaitingRoom
        roomState={roomState}
        playerId={playerId}
        onStart={startGame}
        error={error}
      />
    );
  }

  if (screen === 'game' && gameState && myPlayer) {
    return (
      <>
        <GameBoard gameState={gameState} pendingDiscardExcess={discardExcess || null} />
        {gameOver ? <GameOverModal payload={gameOver} /> : null}
      </>
    );
  }

  return (
    <main className="loading-shell">
      正在连接璀璨宝石桌局...
    </main>
  );
}
