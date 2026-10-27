import {createBrowserBackend} from './backend.mjs';
try{
 const response=await fetch('/public-config.json',{cache:'no-store',redirect:'error',credentials:'same-origin'});if(!response.ok)throw new Error('MD_PUBLIC_CONFIG_REQUIRED');
 const config=await response.json();globalThis.LIFE_BRICK_MD_BACKEND=await createBrowserBackend({config});
 await import('../../user-app/public/app.mjs');
}catch(error){const output=document.getElementById('status');if(output)output.textContent='다중 장치 시작 보류 · '+(error.code??error.message);}
