const SEAT_SESSION_KEY = "splendor:seat:v1";

export interface StoredSeatSession {
  roomId: string;
  playerId: string;
  reconnectToken: string;
  username: string;
  avatarId: number;
  updatedAt: number;
}

function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase().slice(0, 6);
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readSeatSession(): StoredSeatSession | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(SEAT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSeatSession>;
    const roomId = typeof parsed.roomId === "string" ? normalizeRoomId(parsed.roomId) : "";
    const playerId = typeof parsed.playerId === "string" ? parsed.playerId : "";
    const reconnectToken = typeof parsed.reconnectToken === "string" ? parsed.reconnectToken : "";
    if (!roomId || !playerId || !reconnectToken) return null;
    return {
      roomId,
      playerId,
      reconnectToken,
      username: typeof parsed.username === "string" ? parsed.username.slice(0, 16) : "",
      avatarId: typeof parsed.avatarId === "number" ? parsed.avatarId : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveSeatSession(session: Omit<StoredSeatSession, "updatedAt">): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(
      SEAT_SESSION_KEY,
      JSON.stringify({
        ...session,
        roomId: normalizeRoomId(session.roomId),
        username: session.username.slice(0, 16),
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function clearSeatSession(): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(SEAT_SESSION_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}
