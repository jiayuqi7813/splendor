import { createFileRoute } from '@tanstack/react-router'
import { Gem, Link as LinkIcon, Loader2, Sparkles, UsersRound } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { appPath } from '@/utils/paths'
import type { PokemonSpecialSet } from '@/game/types'

export const Route = createFileRoute('/')({
  component: Home,
})

const ROOM_MACHINE_HEADER = 'X-Splendor-Room-Machine'
const ROOM_MACHINE_PARAM = 'roomMachine'

function roomPath(roomId: string, machineId: string | null): string {
  const suffix = machineId ? `?${ROOM_MACHINE_PARAM}=${encodeURIComponent(machineId)}` : ''
  return appPath(`/room/${roomId}${suffix}`)
}

function Home() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [gameType, setGameType] = useState<'duel' | 'classic' | 'pokemon'>('classic')
  const [pokemonSpecialSet, setPokemonSpecialSet] = useState<PokemonSpecialSet>('primary')

  async function createRoom() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(appPath('/api/rooms'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType, pokemonSpecialSet: gameType === 'pokemon' ? pokemonSpecialSet : undefined }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '创建房间失败')
      localStorage.setItem(`splendor:${data.roomId}:secret`, data.playerSecret)
      sessionStorage.setItem(`splendor:${data.roomId}:tabSecret`, data.playerSecret)
      location.href = roomPath(data.roomId, response.headers.get(ROOM_MACHINE_HEADER))
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建房间失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="home homeCoverBackground" style={{ '--home-cover-image': `url(${appPath('/assets/home/splendor-box-cover.webp')})` } as CSSProperties}>
      <section className="homePanel">
        <div className="brandMark">
          <Gem size={30} />
        </div>
        <h1>Splendor</h1>
        <p>创建房间，把链接发给对手。当前支持《璀璨宝石》《璀璨宝石：宝可梦》和《璀璨宝石：对决》。</p>
        <div className="homeGamePicker" role="radiogroup" aria-label="选择游戏">
          <button className={gameType === 'classic' ? 'selectedGameType' : ''} type="button" onClick={() => setGameType('classic')}>
            <UsersRound size={17} />
            璀璨宝石
          </button>
          <button className={gameType === 'pokemon' ? 'selectedGameType' : ''} type="button" onClick={() => setGameType('pokemon')}>
            <Sparkles size={17} />
            宝可梦
          </button>
          <button className={gameType === 'duel' ? 'selectedGameType' : ''} type="button" onClick={() => setGameType('duel')}>
            <Gem size={17} />
            对决
          </button>
        </div>
        {gameType === 'pokemon' && (
          <div className="homeGamePicker compactGamePicker" role="radiogroup" aria-label="选择宝可梦特殊牌组">
            <button className={pokemonSpecialSet === 'primary' ? 'selectedGameType' : ''} type="button" onClick={() => setPokemonSpecialSet('primary')}>
              套组 A
            </button>
            <button className={pokemonSpecialSet === 'alternate' ? 'selectedGameType' : ''} type="button" onClick={() => setPokemonSpecialSet('alternate')}>
              套组 B
            </button>
          </div>
        )}
        <button className="primaryButton" onClick={createRoom} disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <LinkIcon size={18} />}
          创建房间链接
        </button>
        {error && <p className="errorText">{error}</p>}
      </section>
    </main>
  )
}
