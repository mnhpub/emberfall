import { useState } from 'react';
import type { AuthorityMode } from '../../packages/authority/protocol';
export default function AuthorityPanel({active,connect,leave,reconcile}:{active:boolean;connect:(room:string,token:string,mode:AuthorityMode)=>Promise<void>;leave:()=>void;reconcile:()=>Promise<void>}) {
  const [mode,setMode]=useState<AuthorityMode>('private');
  const [room,setRoom]=useState('haven'); const [token,setToken]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  return <details><summary>Online expeditions · preview</summary>
    <p>Server progress is separate from your local save. Shared colony rooms have common resources, colonies and a crewed ferry, with up to eight characters.</p>
    {active?<><button onClick={leave}>Return to local save</button><button onClick={async()=>{try{await reconcile();setError('');}catch(e){setError(e instanceof Error?e.message:'Recovery failed');}}}>Reload server progress · discard pending action</button></>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await connect(room,token,mode);setToken('');}catch(e){setError(e instanceof Error?e.message:'Connection failed');}finally{setBusy(false);}}}>
      <label>Expedition <select aria-label="Authority mode" value={mode} onChange={e=>setMode(e.target.value as AuthorityMode)}><option value="private">Private expedition</option><option value="shared">Shared colony room</option></select></label>
      <label>Room <input aria-label="Authority room" value={room} onChange={e=>setRoom(e.target.value)} pattern="[a-zA-Z0-9_\-]{1,64}" required /></label>
      <label>Access token <input aria-label="Authority access token" type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} required /></label>
      <button disabled={busy}>{busy?'Connecting…':'Connect to expedition'}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
