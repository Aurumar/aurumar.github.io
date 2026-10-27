import {check,keys,encode,sha,frame,idOK} from '../core/package/src/codec.mjs';
export const PROFILE='LBOS_SEQUENTIAL_OWNER_APP_1';
export const SCOPE='LBOS_OWNER_SEQUENTIAL_V1';
export const LIMITS=Object.freeze({operations:10000,pageItems:128,pageBytes:8388608,leaseSeconds:120,renewSeconds:30,safetySeconds:5});
export const initialHead=({accountId,vaultId,genesisPin})=>sha(frame('LBOS/MD1/head0',accountId,vaultId,genesisPin));
export const nextHead=(head,version,certificate)=>sha(frame('LBOS/MD1/head',head,String(version),sha(encode(certificate))));
export const same=(a,b)=>sha(encode(a))===sha(encode(b));
export function stateHead(value){keys(value,['version','head']);check(Number.isSafeInteger(value.version)&&value.version>=0&&idOK(value.head),'MD_HEAD');return value;}
export function assertReady(state){check(state.status==='WRITE_READY'&&!state.pending,'MD_NOT_WRITE_READY');}
