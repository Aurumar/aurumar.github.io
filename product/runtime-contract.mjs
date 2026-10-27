// Canonical independently versioned candidate contract. No downloaded policy or lexicographic gates.
export const APP_VERSION='1.5.0-b2-b3-candidate';
export const APP_BUILD=5;
export const STORE_FORMAT_VERSION=3;
export const DOMAIN_SCHEMA_VERSION=2;
export const SYNC_PROTOCOL_VERSION=1;
export const GAME_POLICY_VERSION='CONSERVATIVE_SEALED_RATIONAL_V1';
export const CAPABILITIES=Object.freeze(['DOMAIN_1','DOMAIN_2','ACTUAL_EFFECTIVE_DURATION_SECOND_V1','QUANTITY_DECIMAL_IDENTITY_UNIT_V1']);
export const CLIENT=Object.freeze({appVersion:APP_VERSION,appBuild:APP_BUILD,storeFormatVersion:STORE_FORMAT_VERSION,domainSchemaVersion:DOMAIN_SCHEMA_VERSION,syncProtocolVersion:SYNC_PROTOCOL_VERSION,capabilities:CAPABILITIES});
export const STORE_RUNTIME=Object.freeze({domainSchemaVersion:DOMAIN_SCHEMA_VERSION,syncProtocolVersion:SYNC_PROTOCOL_VERSION});
export const MEASUREMENT_CAPABILITIES=Object.freeze(CAPABILITIES.slice(2));
export function need(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
const shape=(x,n)=>need(x&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join('|')===[...n].sort().join('|'),'UPDATE_REQUIRED_INVALID_CAPABILITIES');
export function validateClient(c){
 shape(c,['appVersion','appBuild','storeFormatVersion','domainSchemaVersion','syncProtocolVersion','capabilities']);
 need(typeof c.appVersion==='string'&&c.appVersion.length<=80&&[c.appBuild,c.storeFormatVersion,c.domainSchemaVersion,c.syncProtocolVersion].every(x=>Number.isSafeInteger(x)&&x>=1),'UPDATE_REQUIRED_INVALID_CAPABILITIES');
 need([1,2,3].includes(c.storeFormatVersion)&&[1,2].includes(c.domainSchemaVersion)&&c.syncProtocolVersion===1,'UPDATE_REQUIRED_UNSUPPORTED_OPERATION');
 need(Array.isArray(c.capabilities)&&new Set(c.capabilities).size===c.capabilities.length&&c.capabilities.every(x=>typeof x==='string'&&CAPABILITIES.includes(x)),'UPDATE_REQUIRED_UNSUPPORTED_CAPABILITY');
 return c;
}
export function serverCapabilities(domainFloor=1){
 need([1,2].includes(domainFloor),'UPDATE_REQUIRED_DOMAIN_SCHEMA');
 return {format:'LB_RUNTIME_CAPABILITIES_1',minDomainWrite:domainFloor,maxDomainRead:2,maxDomainWrite:2,minSyncWrite:1,maxSyncWrite:1,operationCapabilities:[...MEASUREMENT_CAPABILITIES]};
}
export function assertCompatible(server,client=CLIENT){
 validateClient(client);shape(server,['format','minDomainWrite','maxDomainRead','maxDomainWrite','minSyncWrite','maxSyncWrite','operationCapabilities']);
 need(server.format==='LB_RUNTIME_CAPABILITIES_1'&&[1,2].includes(server.minDomainWrite)&&server.maxDomainRead===2&&server.maxDomainWrite===2&&server.minSyncWrite===1&&server.maxSyncWrite===1&&JSON.stringify(server.operationCapabilities)===JSON.stringify(MEASUREMENT_CAPABILITIES),'UPDATE_REQUIRED_SERVER_CONTRACT');
 need(client.syncProtocolVersion===1&&client.domainSchemaVersion>=server.minDomainWrite&&client.domainSchemaVersion<=server.maxDomainWrite,'UPDATE_REQUIRED_READ_ONLY_HOLD');
 if(server.minDomainWrite===2)need(MEASUREMENT_CAPABILITIES.every(x=>client.capabilities.includes(x)),'UPDATE_REQUIRED_READ_ONLY_HOLD');
 return server;
}
export function operationRequirements(op){
 const raw=op.edits.some(e=>e.value?.format==='LB_ACTION_MEASUREMENT_2');
 return {domainSchemaVersion:raw?2:1,capabilities:raw?[...MEASUREMENT_CAPABILITIES]:[]};
}
export function validateCompatibility(x){
 shape(x,['client','requiredDomainSchemaVersion','operationCapabilities']);validateClient(x.client);
 need([1,2].includes(x.requiredDomainSchemaVersion)&&x.client.syncProtocolVersion===1&&x.client.domainSchemaVersion>=x.requiredDomainSchemaVersion,'UPDATE_REQUIRED_UNSUPPORTED_OPERATION');
 const required=x.requiredDomainSchemaVersion===2?MEASUREMENT_CAPABILITIES:[];
 need(JSON.stringify(x.operationCapabilities)===JSON.stringify(required)&&required.every(c=>x.client.capabilities.includes(c)),'UPDATE_REQUIRED_UNSUPPORTED_OPERATION');return x;
}
export function assertOperationCompatibility(op,x){
 const r=operationRequirements(op);
 if(x){validateCompatibility(x);need(x.requiredDomainSchemaVersion===r.domainSchemaVersion&&JSON.stringify(x.operationCapabilities)===JSON.stringify(r.capabilities),'HOLD_SIGNED_OPERATION_CAPABILITY_MISMATCH');}
 else need(r.domainSchemaVersion===1,'HOLD_OPERATION_CAPABILITY_MISSING');
}
