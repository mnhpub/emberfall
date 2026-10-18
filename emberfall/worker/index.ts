import { authorityRoute, type AuthorityEnv } from './authority.ts';
export { AuthoritySession } from './authority.ts';
export { SharedWorld } from './shared-world.ts';
export interface Env extends AuthorityEnv {
  DB: D1Database;
  GAME_ASSETS: R2Bucket;
  WORLD_ROOMS: DurableObjectNamespace;
  SESSION_TOKEN?: string;
  PLAYER_ID?: string;
}

type PlayerSave = {
  position: { x: number; y: number; z: number };
  inventory: Record<string, number>;
  discovered: string[];
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization' },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/authority/') || url.pathname.startsWith('/api/world/')) return authorityRoute(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization' } });
    if (url.pathname === '/api/health') return json({ status: 'ok', service: 'emberfall-api', version: '0.1.0', persistence: Boolean(env.DB), rooms: Boolean(env.WORLD_ROOMS) });

    // Private staging gate only. Production requires per-user sessions and membership.
    if (!env.SESSION_TOKEN || !env.PLAYER_ID) return json({ error: 'Persistent APIs disabled until staging credentials are configured.' }, 503);
    if (request.headers.get('authorization') !== `Bearer ${env.SESSION_TOKEN}`) return json({ error: 'Unauthorized' }, 401);
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > 65536) return json({ error: 'Payload too large' }, 413);
    if (request.method === 'POST') {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      if (reader) while (true) {
        const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
        if (size > 65536) { await reader.cancel(); return json({error:'Payload too large'},413); }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
      request = new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
    }
    if (url.pathname === '/api/profile' && request.method === 'GET') {
      const playerId = env.PLAYER_ID;
      if (!playerId || !/^[a-zA-Z0-9_-]{8,80}$/.test(playerId)) return json({ error: 'A valid playerId is required.' }, 400);
      const profile = await env.DB.prepare('SELECT player_id, display_name, level, experience, created_at, updated_at FROM player_profiles WHERE player_id = ?').bind(playerId).first();
      return json({ profile: profile ?? null });
    }

    if (url.pathname === '/api/profile' && request.method === 'POST') {
      const body = await request.json().catch(() => null) as { playerId?: string; displayName?: string } | null;
      if (body?.playerId !== env.PLAYER_ID) return json({ error: 'Player ownership mismatch' }, 403);
      if (!body?.playerId || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.playerId)) return json({ error: 'A valid playerId is required.' }, 400);
      if (body.displayName !== undefined && typeof body.displayName !== 'string') return json({ error: 'displayName must be a string' }, 400);
      const displayName = (body.displayName ?? 'Wanderer').trim().slice(0, 24) || 'Wanderer';
      await env.DB.prepare('INSERT INTO player_profiles (player_id, display_name) VALUES (?, ?) ON CONFLICT(player_id) DO UPDATE SET display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP').bind(body.playerId, displayName).run();
      await env.DB.prepare('INSERT INTO player_saves (player_id, save_json) VALUES (?, ?) ON CONFLICT(player_id) DO NOTHING').bind(body.playerId, JSON.stringify(defaultSave())).run();
      const profile = await env.DB.prepare('SELECT player_id, display_name, level, experience, created_at, updated_at FROM player_profiles WHERE player_id = ?').bind(body.playerId).first();
      return json({ profile });
    }

    if (url.pathname === '/api/save' && request.method === 'GET') {
      const playerId = env.PLAYER_ID;
      if (!playerId || !/^[a-zA-Z0-9_-]{8,80}$/.test(playerId)) return json({ error: 'A valid playerId is required.' }, 400);
      const row = await env.DB.prepare('SELECT save_json, updated_at FROM player_saves WHERE player_id = ?').bind(playerId).first<{ save_json: string; updated_at: string }>();
      if (!row) return json({ error: 'Player save not found.' }, 404);
      return json({ save: JSON.parse(row.save_json) as PlayerSave, updatedAt: row.updated_at });
    }

    if (url.pathname === '/api/save' && request.method === 'POST') {
      const body = await request.json().catch(() => null) as { playerId?: string; save?: PlayerSave } | null;
      if (body?.playerId !== env.PLAYER_ID) return json({ error: 'Player ownership mismatch' }, 403);
      if (!body?.playerId || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.playerId) || !body.save || typeof body.save !== 'object') return json({ error: 'Valid playerId and save are required.' }, 400);
      const save = sanitizeSave(body.save);
      const result = await env.DB.prepare('UPDATE player_saves SET save_json = ?, updated_at = CURRENT_TIMESTAMP WHERE player_id = ?').bind(JSON.stringify(save), body.playerId).run();
      if (!result.meta.changes) return json({ error: 'Player save not found. Create a profile first.' }, 404);
      return json({ saved: true });
    }

    if (url.pathname.startsWith('/api/room/')) {
      const match = /^\/api\/room\/([a-zA-Z0-9_-]{1,64})\/(state|presence)$/.exec(url.pathname);
      if (!match) return json({ error: 'Invalid room route' }, 400);
      const roomId = match[1];
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(roomId)) return json({ error: 'Invalid room id.' }, 400);
      const id = env.WORLD_ROOMS.idFromName(roomId);
      const roomPath = url.pathname.split('/').filter(Boolean).slice(3).join('/');
      const forwarded = new Request(`https://world-room/${roomPath}${url.search}`, request);
      forwarded.headers.set('x-verified-player', env.PLAYER_ID);
      return env.WORLD_ROOMS.get(id).fetch(forwarded);
    }
    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

function defaultSave(): PlayerSave {
  return { position: { x: 0, y: 0, z: 4 }, inventory: { wood: 0, stone: 0, shard: 0, fiber: 0 }, discovered: [] };
}

function sanitizeSave(save: PlayerSave): PlayerSave {
  const clamp = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
  const inventory: Record<string, number> = {};
  for (const key of ['wood', 'stone', 'shard', 'fiber']) inventory[key] = Math.floor(clamp(save.inventory?.[key], 0, 9999));
  return {
    position: { x: clamp(save.position?.x, -10000, 10000), y: clamp(save.position?.y, -1000, 1000), z: clamp(save.position?.z, -10000, 10000) },
    inventory,
    discovered: Array.isArray(save.discovered) ? save.discovered.filter((v): v is string => typeof v === 'string').slice(0, 500).map((v) => v.slice(0, 80)) : [],
  };
}

export class WorldRoom {
  private state: DurableObjectState;
  constructor(state: DurableObjectState) { this.state = state; }

  private async activePlayers() {
    const all = await this.state.storage.list<{x:number;z:number;seenAt:number}>({prefix:'player:'});
    const active = [];
    for (const [key,value] of all) {
      if (Date.now()-value.seenAt>=45000) await this.state.storage.delete(key);
      else active.push({playerId:key.slice(7),x:value.x,z:value.z});
    }
    return active;
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/state') {
      const players = (await this.activePlayers()).length;
      const world = await this.state.storage.get('world') ?? { seed: 'ashen-reach-01', day: 1, weather: 'haze', players };
      return json({ ...world as object, players, room: 'active' });
    }
    if (request.method === 'POST' && url.pathname === '/presence') {
      const body = await request.json().catch(() => null) as { playerId?: string; x?: number; z?: number } | null;
      if (!body?.playerId || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.playerId)) return json({ error: 'Valid playerId required.' }, 400);
      if (body.playerId !== request.headers.get('x-verified-player')) return json({error:'Player ownership mismatch'},403);
      const clamp = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.min(10000, Math.max(-10000, n)) : 0;
      await this.state.storage.put(`player:${body.playerId}`, { x: clamp(body.x), z: clamp(body.z), seenAt: Date.now() });
      const online = await this.activePlayers();
      return json({ players: online });
    }
    return json({ error: 'Room route not found.' }, 404);
  }
}
