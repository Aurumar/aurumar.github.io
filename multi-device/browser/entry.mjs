import {createBrowserBackend} from './backend.mjs';
try{
 const response=await fetch('/public-config.json',{cache:'no-store',redirect:'error',credentials:'same-origin'});if(!response.ok)throw new Error('MD_PUBLIC_CONFIG_REQUIRED');
 const config=await response.json();globalThis.LIFE_BRICK_MD_BACKEND=await createBrowserBackend({config});
 await import('../../user-app/public/app.mjs');
 // MD03 P2 R2: explicit sign-out of this device (closes like "저장 후 종료", then deletes the saved login and unlock phrase).
 const tools=document.querySelector('.header-tools');
 if(tools){const out=document.createElement('button');out.type='button';out.id='sign-out-device';out.className='secondary';out.textContent='이 기기에서 로그아웃';
  out.addEventListener('click',async()=>{if(!confirm('이 기기에서 로그아웃합니다. 저장된 로그인과 잠금해제 문구가 삭제되고, 다음에는 이메일 코드와 TOTP로 다시 로그인해야 합니다. 계속할까요?'))return;
   try{await globalThis.LIFE_BRICK_MD_BACKEND.request('/api/md/signout',{});location.reload();}
   catch(error){const s=document.getElementById('status');if(s)s.textContent='로그아웃 보류 · 저장된 로그인이 남아 있을 수 있습니다 · '+(error.code??error.message);}});
  tools.append(out);}
}catch(error){const output=document.getElementById('status');if(output)output.textContent='다중 장치 시작 보류 · '+(error.code??error.message);}
