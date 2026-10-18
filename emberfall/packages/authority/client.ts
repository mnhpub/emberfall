import { restore } from '../game-core/index.ts';
import { parseEnvelope, type AuthorityMode, type Intent, type RequestEnvelope, type Snapshot } from './protocol.ts';

type Store = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
// One ordered outbox per actor/room. Tokens remain in memory, never in the outbox.
export class AuthorityClient {
  snapshot?: Snapshot;
  pending?: RequestEnvelope;
  busy=false;
  private key='';
  private stopped=false;
  private retryAt=0;
  private failures=0;
  private paused=false;
  readonly room: string;
  private token: string;
  private store: Store;
  private publish: (snapshot: Snapshot)=>void;
  private status: (message: string)=>void;
  private transport: typeof fetch;
  readonly mode:AuthorityMode;
  constructor(room: string, token: string, store: Store,
    publish: (snapshot: Snapshot)=>void, status: (message: string)=>void,
    transport: typeof fetch=(...args)=>globalThis.fetch(...args), mode:AuthorityMode='private') {
    this.mode=mode;
    this.room=room;this.token=token;this.store=store;this.publish=publish;this.status=status;this.transport=transport;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(room)) throw new Error('Invalid room');
  }
  private async request(path: string, body?: RequestEnvelope) {
    return this.transport(`/api/${this.mode==='shared'?'world':'authority'}/${this.room}/${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${this.token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  }
  private accept(value: Snapshot) {
    if (value.protocol!==1 || value.room!==this.room || typeof value.actor!=='string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value.actor) || !Number.isSafeInteger(value.sequence) || value.sequence<0 || (this.snapshot && (value.actor!==this.snapshot.actor || value.sequence<this.snapshot.sequence))) throw new Error('Invalid authority snapshot');
    if(this.mode==='shared' && (value.authority!=='shared' || !value.shared || !Number.isSafeInteger(value.shared.revision) || (this.snapshot?.shared && value.shared.revision<this.snapshot.shared.revision)))throw new Error('Invalid shared-world revision');
    if(this.mode==='shared' && (value.shared?.economy?.version!==1 || !Array.isArray(value.shared.economy.colonies) || !Array.isArray(value.shared.economy.contracts)))throw new Error('Colony server update required');
    this.snapshot={...value,state:restore(value.state)};
    if(!this.stopped) this.publish(this.snapshot);
  }
  async connect() {
    const response=await this.request('snapshot');
    if(!response.ok) throw new Error('Authority connection refused ('+response.status+')');
    const value=await response.json() as Snapshot;
    if(this.stopped) return;
    this.accept(value);
    this.key=`emberfall.authority.pending:${this.room}:${value.actor}${this.mode==='shared'?':shared':''}`;
    const raw=this.store.getItem(this.key);
    if(raw) this.pending=parseEnvelope(JSON.parse(raw),this.mode==='shared');
    this.status(this.pending?'Recovering pending action…':this.connectedStatus());
    if(this.pending) await this.flush();
  }
  async send(command: Intent): Promise<boolean> {
    if(this.stopped || this.paused || !this.snapshot || this.pending || this.busy) return false;
    const envelope=parseEnvelope({sequence:this.snapshot.sequence+1,commandId:crypto.randomUUID(),command},this.mode==='shared');
    // Fail closed before any request if durable client intent cannot be recorded.
    try {this.store.setItem(this.key,JSON.stringify(envelope));}
    catch {this.paused=true;this.status('Connection paused: cannot save pending action on this device');return false;}
    this.pending=envelope;
    await this.flush(); return true;
  }
  async flush() {
    if(!this.pending || this.busy || this.stopped || this.paused || Date.now()<this.retryAt) return;
    this.busy=true;
    try {
      const response=await this.request('command',this.pending);
      if(this.stopped) return;
      if(response.status===429) {this.retryAt=Date.now()+150;return;}
      if(response.status===409) {this.paused=true;this.status('Action conflict: reconnect to inspect server state; pending action retained');return;}
      if(!response.ok) {this.paused=true;this.status(`Connection paused (${response.status}); pending action retained`);return;}
      const value=await response.json() as Snapshot;
      if(value.sequence!==this.pending.sequence) throw new Error('Unexpected acknowledgement');
      this.accept(value);
      this.store.removeItem(this.key);
      this.pending=undefined; this.failures=0; this.retryAt=0;
      this.status(this.connectedStatus());
    } catch {
      this.failures++;this.retryAt=Date.now()+Math.min(5000,250*2**Math.min(this.failures,4));
      this.status('Reconnecting… pending action retained');
    } finally {this.busy=false;}
  }
  async useServerProgress() {
    if(this.busy || this.stopped || !this.snapshot) throw new Error('Wait for the current request to finish');
    this.busy=true;
    try {
      const response=await this.request('snapshot');
      if(!response.ok) throw new Error('Could not reload server progress');
      const snapshot=await response.json() as Snapshot;
      if(this.stopped) return;
      this.accept(snapshot);
      // Explicit player choice; never rebase and resubmit an economic intent automatically.
      this.store.removeItem(this.key);this.pending=undefined;this.paused=false;this.retryAt=0;this.failures=0;
      this.status(this.connectedStatus());
    } finally {this.busy=false;}
  }
  stop() {this.stopped=true;this.token='';}
  private connectedStatus() {return this.mode==='shared'?'Authority connected · shared colony room':'Authority connected · private expedition';}
}
