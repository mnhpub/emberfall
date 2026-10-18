import { reduceCargo, type CargoEvent, type Logistics } from '../logistics/index.ts';
import type { CargoOffer } from './protocol.ts';

/** Called only inside the room transaction after proximity, consent and capacity checks. */
export function acceptCustody(sender: Logistics, recipient: Logistics, offer: CargoOffer, room: string) {
  const lot=sender.lots.find(l=>l.id===offer.lotId);
  if(!lot || lot.quantity<offer.quantity) throw new Error('Offered cargo is no longer available');
  if(sender.events.length>=512 || recipient.events.length>=512 || recipient.lots.length>=256) throw new Error('Cargo journal or instance capacity reached');
  const receivedId=`lot-${recipient.nextLotId}`;
  const request=JSON.stringify(['handoff',room,offer.id,offer.sender,offer.recipient,offer.lotId,offer.quantity]);
  const base=(s:Logistics,side:string):CargoEvent=>({schemaVersion:1,sequence:s.revision+1,commandId:`handoff:${offer.id}:${side}`,request,type:'CargoReleased',removed:[],upserted:[],nextLotId:s.nextLotId,reputationDelta:0});
  const released=base(sender,'out');
  released.removed=[lot.id];
  if(lot.quantity>offer.quantity) released.upserted=[{...lot,quantity:lot.quantity-offer.quantity}];
  const accepted=base(recipient,'in');accepted.type='CargoAccepted';accepted.nextLotId++;
  accepted.upserted=[{...lot,id:receivedId,rootId:receivedId,quantity:offer.quantity,
    provenance:lot.provenance??{actor:offer.sender,rootId:lot.rootId,room}}];
  return {sender:reduceCargo(sender,released),recipient:reduceCargo(recipient,accepted),receivedId};
}
