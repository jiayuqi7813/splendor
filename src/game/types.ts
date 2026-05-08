export const GEM_TYPES = ['ruby', 'sapphire', 'onyx', 'diamond', 'emerald'] as const
export const TOKEN_TYPES = [...GEM_TYPES, 'pearl', 'gold'] as const

export type GemType = (typeof GEM_TYPES)[number]
export type TokenType = (typeof TOKEN_TYPES)[number]
export type GameType = 'duel' | 'classic' | 'pokemon'
export type PlayerId = 'p1' | 'p2' | 'p3' | 'p4'
export type AiDifficultyId = 'idiot' | 'beginner' | 'casual' | 'standard' | 'hard' | 'expert' | 'nightmare' | 'oracleDebug'
export type Tier = 1 | 2 | 3
export type PokemonSpecialDeck = 'rare' | 'legendary'
export type PokemonSpecialSet = 'primary' | 'alternate'
export type CardSource =
  | { type: 'market'; tier: Tier; index: number }
  | { type: 'reserve'; index: number }
  | { type: 'deck'; tier: Tier }
  | { type: 'pokemonSpecial'; deck: PokemonSpecialDeck }

export type CardAbility =
  | 'extraTurn'
  | 'takePrivilege'
  | 'stealToken'
  | 'takeRuby'
  | 'takeSapphire'
  | 'takeOnyx'
  | 'takeDiamond'
  | 'takeEmerald'

export type Cost = Record<GemType | 'pearl', number>

export interface CardDefinition {
  id: string
  cardId: number
  number: number
  tier: Tier | 'royal'
  color?: GemType
  points: number
  crowns: number
  doubleGem: boolean
  wild: boolean
  royalOnlyPoints: boolean
  cost: Cost
  ability?: CardAbility
  name?: string
  deckKind?: 'common' | PokemonSpecialDeck
  pokemonSpecialSet?: PokemonSpecialSet
  goldCost?: number
  bonusColors?: GemType[]
  evolvesFrom?: string
  evolutionCost?: Cost
  atlas:
    | 'tier1'
    | 'tier2'
    | 'tier3'
    | 'royal'
    | 'classic-tier1'
    | 'classic-tier2'
    | 'classic-tier3'
    | 'classic-noble'
    | 'pokemon-stage1'
    | 'pokemon-stage2'
    | 'pokemon-stage3'
    | 'pokemon-rare'
    | 'pokemon-legendary'
  x: number
  y: number
}

export interface PurchasedCard {
  cardId: number
  wildColor?: GemType
}

export interface Token {
  id: string
  type: TokenType
}

export interface BoardCell {
  id: string
  x: number
  y: number
  token?: Token
}

export interface PlayerState {
  id: PlayerId
  name: string
  isAi?: boolean
  aiDifficulty?: AiDifficultyId
  aiControlled?: boolean
  connected: boolean
  seated: boolean
  tokens: Record<TokenType, number>
  tokenSlots: Token[]
  privileges: number
  reserve: number[]
  purchased: PurchasedCard[]
  tucked?: number[]
  turnsTaken?: number
}

export type VictoryReason = 'points' | 'crowns' | 'colorPoints'

export type PendingChoice =
  | { type: 'chooseRoyal'; playerId: PlayerId; reason: 'threeCrowns' | 'sixCrowns' | 'noble'; options: number[]; resume: TurnResume }
  | { type: 'takeBoardToken'; playerId: PlayerId; tokenType: GemType; resume: TurnResume }
  | { type: 'stealToken'; playerId: PlayerId; resume: TurnResume }
  | { type: 'discard'; playerId: PlayerId; count: number; resume: TurnResume }

export interface TurnResume {
  extraTurn: boolean
  continueTurn?: boolean
  royalChoice?: { reason: 'threeCrowns' | 'sixCrowns' | 'noble'; options: number[] }
}

export interface TurnActions {
  usedPrivilege?: boolean
  replenished?: boolean
  mandatoryDone?: boolean
  evolved?: boolean
}

export interface GameState {
  roomId: string
  gameType: GameType
  status: 'waiting' | 'playing' | 'finished'
  currentPlayer: PlayerId
  firstPlayer: PlayerId
  playerOrder: PlayerId[]
  turnNumber: number
  board: BoardCell[]
  bag: Token[]
  decks: Record<Tier, number[]>
  market: Record<Tier, Array<number | null>>
  royalCards: number[]
  pokemonSpecial?: {
    set: PokemonSpecialSet
    rareDeck: number[]
    rareFaceUp: number | null
    legendaryDeck: number[]
    legendaryFaceUp: number | null
    evolutionPile: number[]
  }
  availablePrivileges: number
  turnActions?: TurnActions
  players: Record<PlayerId, PlayerState>
  pending?: PendingChoice
  finalRound?: { triggerPlayerId: PlayerId; targetTurns: number; reason: VictoryReason; overtimeRounds?: number }
  winner?: { playerId: PlayerId; reason: VictoryReason }
  myPlayerId?: PlayerId
  myIsHost?: boolean
  feed?: RoomFeedItem[]
  log: string[]
}

export type RoomFeedKind = 'chat' | 'event' | 'status' | 'action'

export interface RoomFeedItem {
  id: string
  seq: number
  at: number
  kind: RoomFeedKind
  message: string
  playerId?: PlayerId
  playerName?: string
}

export type GameAction =
  | { type: 'startGame'; playerId: PlayerId }
  | { type: 'usePrivilege'; playerId: PlayerId; cellId: string }
  | { type: 'replenishBoard'; playerId: PlayerId }
  | { type: 'reorderTokenSlots'; playerId: PlayerId; tokenIds: string[] }
  | { type: 'takeTokens'; playerId: PlayerId; cellIds: string[] }
  | { type: 'takeClassicBankTokens'; playerId: PlayerId; tokenTypes: GemType[] }
  | { type: 'reserveCard'; playerId: PlayerId; source: CardSource; goldCellId: string }
  | { type: 'purchaseCard'; playerId: PlayerId; source: CardSource; wildColor?: GemType }
  | { type: 'evolvePokemon'; playerId: PlayerId; source: CardSource }
  | { type: 'endTurn'; playerId: PlayerId }
  | { type: 'chooseRoyal'; playerId: PlayerId; cardId: number }
  | { type: 'takeBoardToken'; playerId: PlayerId; cellId: string }
  | { type: 'stealToken'; playerId: PlayerId; tokenType: Exclude<TokenType, 'gold'>; tokenId?: string }
  | { type: 'discardToken'; playerId: PlayerId; tokenType: TokenType; tokenId?: string }

export type RoomIntent =
  | { type: 'hoverToken'; cellId?: string }
  | { type: 'hoverReplenish'; active?: boolean }
  | { type: 'tokenSelection'; originId: string; cellIds: string[]; valid: boolean; invalidPoint?: { x: number; y: number } }
  | { type: 'classicHoverBankToken'; tokenType?: TokenType }
  | { type: 'classicTokenDraft'; tokenTypes: GemType[]; confirmable: boolean; hoverTokenType?: GemType; hoverSlotIndex?: number; hoverOnly?: boolean; committed?: boolean }
  | { type: 'hoverCard'; source?: CardSource }
  | { type: 'purchaseTarget'; source: CardSource; gem?: GemType; valid: boolean }
  | { type: 'goldTarget'; cellId: string; source?: CardSource }
  | { type: 'privilegeTarget'; cellId?: string; index?: number }
  | { type: 'cursorMove'; x: number; y: number; visible: boolean; path?: { x: number; y: number; at: number; visible: boolean }[]; click?: boolean }
  | { type: 'clear' }

export type AnyGameState = any
export type AnyGameAction = any

export interface PublicRoomStateEvent {
  seq: number
  type: 'snapshot' | 'joined' | 'action' | 'error'
  message: string
  state: AnyGameState
  action?: AnyGameAction
}

export interface PublicRoomIntentEvent {
  seq: number
  type: 'intent'
  playerId: PlayerId
  intent: RoomIntent
}

export type PublicRoomEvent = PublicRoomStateEvent | PublicRoomIntentEvent
