import { useEffect, useMemo, useState } from 'react';
import { socket } from './socket';
import { GameOverModal } from './components/GameOverModal';
import { GameBoard } from './components/GameBoard';
import LobbyScreen from './components/LobbyScreen';
import { WaitingRoom } from './components/WaitingRoom';
import type { GameOverPayload, GameState, RoomState } from './types';

type Screen = 'lobby' | 'waiting' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [roomId, setRoomId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [error, setError] = useState('');
  const [discardExcess, setDiscardExcess] = useState(0);

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
    setError('');
    socket.emit('create_room', { username, avatarId }, (response: { roomId?: string; playerId?: string; error?: string }) => {
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
    setError('');
    socket.emit('join_room', { roomId: targetRoomId, username, avatarId }, (response: { playerId?: string; error?: string }) => {
      if (response.error || !response.playerId) {
        setError(response.error ?? '加入房间失败');
        return;
      }
      setRoomId(targetRoomId);
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
  };

  if (screen === 'lobby') {
    return <LobbyScreen onCreate={createRoom} onJoin={joinRoom} error={error} />;
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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-amber-100">
      正在连接璀璨宝石桌局...
    </main>
  );
}
