// Deliberately limited to the byte operations used by the pinned core closure.
export class Buffer extends Uint8Array {
 static from(value,encoding='utf8'){
  let bytes;
  if(typeof value==='string'){
   if(encoding==='utf8'||encoding==='utf-8')bytes=new TextEncoder().encode(value);
   else if(encoding==='hex'){
    if(value.length%2||!/^[a-fA-F0-9]*$/.test(value))throw new Error('PORTABLE_HEX');
    bytes=Uint8Array.from(value.match(/../g)||[],x=>parseInt(x,16));
   }else if(encoding==='base64url'){
    if(!/^[A-Za-z0-9_-]*$/.test(value))throw new Error('PORTABLE_BASE64');
    // Core unb64 performs canonical round-trip rejection after Node's permissive decode.
    const trimmed=value.length%4===1?value.slice(0,-1):value;
    const s=atob(trimmed.replace(/-/g,'+').replace(/_/g,'/'));bytes=Uint8Array.from(s,c=>c.charCodeAt(0));
   }else throw new Error('PORTABLE_ENCODING');
  }else if(value instanceof ArrayBuffer)bytes=new Uint8Array(value);
  else if(ArrayBuffer.isView(value))bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  else if(Array.isArray(value))bytes=Uint8Array.from(value);
  else throw new Error('PORTABLE_BYTES');
  return new Buffer(bytes);
 }
 static alloc(n){if(!Number.isSafeInteger(n)||n<0)throw new Error('PORTABLE_LENGTH');return new Buffer(n);}
 static concat(values){const out=new Buffer(values.reduce((n,v)=>n+v.length,0));let i=0;for(const v of values){out.set(v,i);i+=v.length;}return out;}
 equals(other){if(this.length!==other.length)return false;let n=0;for(let i=0;i<this.length;i++)n|=this[i]^other[i];return n===0;}
 writeUInt32BE(value,offset=0){if(!Number.isInteger(value)||value<0||value>0xffffffff)throw new Error('PORTABLE_INTEGER');new DataView(this.buffer,this.byteOffset,this.byteLength).setUint32(offset,value,false);return offset+4;}
 toString(encoding='utf8'){
  if(encoding==='hex')return Array.from(this,b=>b.toString(16).padStart(2,'0')).join('');
  if(encoding==='utf8'||encoding==='utf-8')return new TextDecoder().decode(this);
  if(encoding==='base64url'){let s='';for(let i=0;i<this.length;i+=8192)s+=String.fromCharCode(...this.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  throw new Error('PORTABLE_ENCODING');
 }
}
