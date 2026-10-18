import { initialLogistics, type Logistics } from '../logistics/index.ts';
import { type Profession } from '../game-core/catalog.ts';

export type ContributionSource={actor:string;profession:Profession|null;logistics:Logistics};
export type DeliveryFact={id:string;actor:string;profession:Profession|null;order:string;colony:string;quantity:number;points:number};
export type Standing={id:string;points:number;quantity:number;rank:number};
export type ContributionView={version:1;scope:'room-preview';room:string;season:'preview-1';official:false;total:number;deliveries:DeliveryFact[];players:Standing[];professions:Standing[];colonies:Standing[]};
/** Rebuild only from server-owned, retained custody journals. Never accepts client scores. */
export function projectContributions(room:string,sources:ContributionSource[]):ContributionView {
  const facts=new Map<string,DeliveryFact>(),orders=initialLogistics().orders;
  for(const source of sources)for(const event of source.logistics.events){
    if(event.type!=='OrderFulfilled')continue;
    const order=orders.find(o=>o.id===event.order?.id),credit=event.colonyCredit;
    if(!order || !credit || credit.colony!==order.destination || credit.good!==order.good || !Number.isSafeInteger(credit.quantity) || credit.quantity<1 || credit.quantity>order.required || event.reputationDelta!==credit.quantity*order.rewardPerUnit)throw new Error('Invalid contribution source');
    const fact:DeliveryFact={id:JSON.stringify([room,source.actor,event.sequence]),actor:source.actor,profession:source.profession,order:order.id,colony:credit.colony,quantity:credit.quantity,points:event.reputationDelta};
    const prior=facts.get(fact.id);
    if(prior && JSON.stringify(prior)!==JSON.stringify(fact))throw new Error('Conflicting contribution identity');
    facts.set(fact.id,fact);
  }
  const deliveries=[...facts.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  for(const order of orders)if(deliveries.filter(f=>f.order===order.id).reduce((n,f)=>n+f.quantity,0)>order.required)throw new Error('Contribution demand exceeded');
  const standings=(key:'actor'|'profession'|'colony'):Standing[]=>{
    const groups=new Map<string,Standing>();
    for(const f of deliveries){const id=f[key]??'unattributed';const row=groups.get(id)??{id,points:0,quantity:0,rank:0};row.points+=f.points;row.quantity+=f.quantity;groups.set(id,row);}
    const rows=[...groups.values()].sort((a,b)=>b.points-a.points||(a.id<b.id?-1:a.id>b.id?1:0));
    rows.forEach((row,i)=>{row.rank=i && rows[i-1].points===row.points?rows[i-1].rank:i+1;});return rows;
  };
  return {version:1,scope:'room-preview',room,season:'preview-1',official:false,total:deliveries.reduce((n,f)=>n+f.points,0),deliveries,players:standings('actor'),professions:standings('profession'),colonies:standings('colony')};
}
