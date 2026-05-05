import { useEffect, useMemo, useState } from 'react';
import { socket } from './socket';
import { GameOverModal } from './components/GameOverModal';
import { GameBoard } from './components/GameBoard';
import LobbyScreen from './components/LobbyScreen';
import { WaitingRoom } from './components/WaitingRoom';
import { clearSeatSession, readSeatSession, saveSeatSession, type StoredSeatSession } from './reconnectSession';
import type { GameOverPayload, GameState, RoomState } from './types';

type Screen = 'lobby' | 'waiting' | 'game';
type SeatResponse = {
  roomId?: string;
  playerId?: string;
  reconnectToken?: string;
  reconnected?: boolean;
  phase?: RoomState['phase'];
  error?: string;
};

function inviteRoomFromUrl() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase().slice(0, 6) ?? '';
}

export default function App() {
  const invitedRoomId = useMemo(() => inviteRoomFromUrl(), []);
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
  const [restoringSession, setRestoringSession] = useState(false);

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
    const onSessionReplaced = () => {
      clearSeatSession();
      setRoomId('');
      setPlayerId('');
      setRoomState(null);
      setGameState(null);
      setGameOver(null);
      setDiscardExcess(0);
      setLobbyBusy(false);
      setRestoringSession(false);
      setScreen('lobby');
      setError('这个座位已在另一个窗口恢复连接，本窗口已退出桌局。');
    };

    socket.on('room_updated', onRoomUpdated);
    socket.on('game_state', onGameState);
    socket.on('action_required', onActionRequired);
    socket.on('game_over', onGameOver);
    socket.on('error', onError);
    socket.on('session_replaced', onSessionReplaced);
    return () => {
      socket.off('room_updated', onRoomUpdated);
      socket.off('game_state', onGameState);
      socket.off('action_required', onActionRequired);
      socket.off('game_over', onGameOver);
      socket.off('error', onError);
      socket.off('session_replaced', onSessionReplaced);
    };
  }, []);

  const rememberSeat = (session: Omit<StoredSeatSession, 'updatedAt'>) => {
    saveSeatSession(session);
    setLobbyUsername(session.username);
    setLobbyAvatarId(session.avatarId);
    setLobbyRoomCode(session.roomId);
    setLobbyJoining(true);
  };

  const applyReconnectResponse = (session: StoredSeatSession, response: SeatResponse) => {
    const nextRoomId = response.roomId ?? session.roomId;
    const nextPlayerId = response.playerId ?? session.playerId;
    const nextToken = response.reconnectToken ?? session.reconnectToken;
    rememberSeat({
      roomId: nextRoomId,
      playerId: nextPlayerId,
      reconnectToken: nextToken,
      username: session.username,
      avatarId: session.avatarId,
    });
    setRoomId(nextRoomId);
    setPlayerId(nextPlayerId);
    setError('');
    setScreen(response.phase === 'waiting' ? 'waiting' : 'game');
  };

  const reconnectSeat = (session: StoredSeatSession, showLoading: boolean) => {
    if (showLoading) {
      setRestoringSession(true);
      setLobbyBusy(true);
    }
    socket.timeout(5000).emit(
      'reconnect_room',
      {
        roomId: session.roomId,
        playerId: session.playerId,
        reconnectToken: session.reconnectToken,
      },
      (timeoutError: Error | null, response?: SeatResponse) => {
        if (showLoading) {
          setRestoringSession(false);
          setLobbyBusy(false);
        }
        if (timeoutError) {
          setError('自动恢复连接超时，请检查服务器后刷新页面或手动加入。');
          return;
        }
        if (!response || response.error || !response.playerId) {
          clearSeatSession();
          setScreen('lobby');
          setLobbyJoining(true);
          setLobbyRoomCode(session.roomId);
          setError(response?.error ?? '自动恢复房间失败，请重新加入。');
          return;
        }
        applyReconnectResponse(session, response);
      },
    );
  };

  useEffect(() => {
    const session = readSeatSession();
    if (!session || (invitedRoomId && invitedRoomId !== session.roomId)) return;
    setLobbyUsername(session.username);
    setLobbyAvatarId(session.avatarId);
    setLobbyRoomCode(session.roomId);
    setLobbyJoining(true);

    const restore = () => reconnectSeat(session, true);
    if (socket.connected) restore();
    else socket.once('connect', restore);
    return () => {
      socket.off('connect', restore);
    };
  }, [invitedRoomId]);

  useEffect(() => {
    const onConnect = () => {
      const session = readSeatSession();
      if (!session || !roomId || !playerId) return;
      if (session.roomId !== roomId || session.playerId !== playerId) return;
      reconnectSeat(session, false);
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [playerId, roomId]);

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
    socket.emit('create_room', { username: cleanUsername, avatarId }, (response: SeatResponse) => {
      setLobbyBusy(false);
      if (response.error || !response.roomId || !response.playerId || !response.reconnectToken) {
        setError(response.error ?? '创建房间失败');
        return;
      }
      rememberSeat({
        roomId: response.roomId,
        playerId: response.playerId,
        reconnectToken: response.reconnectToken,
        username: cleanUsername,
        avatarId,
      });
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
    socket.emit('join_room', { roomId: cleanRoomId, username: cleanUsername, avatarId }, (response: SeatResponse) => {
      setLobbyBusy(false);
      const responseRoomId = response.roomId ?? cleanRoomId;
      if (response.error || !response.playerId || !response.reconnectToken) {
        setError(response.error ?? '加入房间失败');
        return;
      }
      rememberSeat({
        roomId: responseRoomId,
        playerId: response.playerId,
        reconnectToken: response.reconnectToken,
        username: cleanUsername,
        avatarId,
      });
      setRoomId(responseRoomId);
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
    clearSeatSession();
    setScreen('lobby');
    setRoomId('');
    setPlayerId('');
    setRoomState(null);
    setGameState(null);
    setGameOver(null);
    setDiscardExcess(0);
    setError('');
    setLobbyBusy(false);
    setRestoringSession(false);
    setLobbyRoomCode('');
    setLobbyJoining(false);
  };

  if (restoringSession) {
    return (
      <main className="loading-shell">
        正在恢复你的宝石桌座位...
      </main>
    );
  }

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
        {gameOver ? <GameOverModal payload={gameOver} onReturnToLobby={resetToLobby} /> : null}
      </>
    );
  }

  return (
    <main className="loading-shell">
      正在连接璀璨宝石桌局...
    </main>
  );
}
