import { firebaseConfig as config } from '../src/firebase-config.js';
let token;
try {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({returnSecureToken:true}), signal:AbortSignal.timeout(15000),
  });
  const value=await response.json();
  if(!response.ok) console.log(JSON.stringify({anonymousAuth:false,error:value.error?.message}));
  else {
    token=value.idToken;
    const check=await fetch(`${config.databaseURL}/stillward/runs/mountain-v1/players.json?auth=${encodeURIComponent(token)}&shallow=true`,{signal:AbortSignal.timeout(15000)});
    console.log(JSON.stringify({anonymousAuth:true,databaseRead:check.ok,status:check.status}));
  }
}catch(error){console.log(JSON.stringify({serviceProbe:'unavailable',reason:error.cause?.code||error.message}));process.exitCode=1;}
finally {if(token){const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});console.log(JSON.stringify({temporaryTestIdentityDeleted:response.ok}));}}
