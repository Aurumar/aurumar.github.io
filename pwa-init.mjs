// PWA copy only: ask the browser to keep this origin's storage (login, crypto and sync code are not touched).
// Chromium decides without a prompt; a refusal is normal and not an error.
const ask=async()=>{try{if(!isSecureContext||!navigator.storage?.persist)return;if(await navigator.storage.persisted())return;await navigator.storage.persist();}catch{}};
addEventListener('pointerdown',ask,{once:true,capture:true});
