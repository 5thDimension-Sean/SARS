// Per-tab JavaScript memory only. Never retain a NASA/Earthdata credential.
export interface CoordinateSession {
  id: string; accessToken: string; expiresAt: string;
  latitude: number; longitude: number; endpoint: string;
}
let current: CoordinateSession | null = null;

export function rememberCoordinateSession(session: CoordinateSession): boolean {
  if (!/^[A-Za-z0-9_-]{29,32}$/.test(session.id) || !/^[A-Za-z0-9_-]{43}$/.test(session.accessToken)
    || !Number.isFinite(session.latitude) || !Number.isFinite(session.longitude)
    || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) return false;
  current = { ...session };
  return true;
}
export function recallCoordinateSession(endpoint: string): CoordinateSession | null {
  if (!current || current.endpoint !== endpoint || Date.parse(current.expiresAt) <= Date.now()) {
    current = null;
    return null;
  }
  return { ...current };
}
export function forgetCoordinateSession() { current = null; }
