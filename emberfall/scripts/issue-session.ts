import { issueSession } from '../worker/session.ts';
// Operator-only utility. Never expose this key through VITE_ variables or a public endpoint.
const [actor,room,ttl='900']=process.argv.slice(2);
const secret=process.env.AUTHORITY_SIGNING_KEY;
if(!secret || !actor || !room) {console.error('Usage: AUTHORITY_SIGNING_KEY=<secret> npm run session:issue -- player_001 haven [ttl-seconds]');process.exit(1);}
try {process.stdout.write(await issueSession(secret,actor,room,Math.floor(Date.now()/1000),Number(ttl))+'\n');}
catch(e) {console.error(e instanceof Error?e.message:'Session issuance failed');process.exit(1);}
