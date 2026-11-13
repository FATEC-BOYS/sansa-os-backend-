import {createHmac,timingSafeEqual} from "node:crypto";

export function constantTimeStringMatch(a:unknown,b:string):boolean {
  if(typeof a!=="string"||!a||!b)return false;
  const left=Buffer.from(a,"utf8"),right=Buffer.from(b,"utf8");
  return left.length===right.length && timingSafeEqual(left,right);
}

export function verifyMetaSignature(raw:unknown,signature:unknown,secret:string):boolean{
  if(!secret||!Buffer.isBuffer(raw)||typeof signature!=="string"||!/^sha256=[a-f0-9]{64}$/i.test(signature))return false;
  const received=Buffer.from(signature.slice(7),"hex");
  const expected=createHmac("sha256",secret).update(raw).digest();
  return received.length===expected.length && timingSafeEqual(received,expected);
}
