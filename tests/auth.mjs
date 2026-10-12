import assert from 'node:assert/strict';
import { GoogleAuth, isGoogleUser, displayName, authMessage } from '../src/auth/google-auth.js';
import { FirebaseTransport } from '../src/multiplayer/firebase-transport.js';
const states=[],changes=[],calls=[];let listener,popupError=null;
const user={uid:'google-alice',displayName:'Alice <Test>',isAnonymous:false,providerData:[{providerId:'google.com'}]};
const auth={currentUser:null};
const sdk={getAuth:()=>auth,browserSessionPersistence:{},async setPersistence(){calls.push('persistence');},
 onAuthStateChanged(_,cb){listener=cb;cb(null);return()=>{};},
 GoogleAuthProvider:class{setCustomParameters(p){assert.equal(p.prompt,'select_account');}},
 async signInWithPopup(){calls.push('popup');if(popupError)throw popupError;auth.currentUser=user;listener(user);},
 async signOut(){calls.push('signout');auth.currentUser=null;listener(null);}
};
const control=new GoogleAuth({},u=>changes.push(u),(s,m)=>states.push([s,m]),async()=>[{initializeApp:()=>({})},sdk,{}]);
await control.start();assert.equal(states.at(-1)[0],'signed-out');
assert(!isGoogleUser({isAnonymous:true,providerData:[]}));assert(!isGoogleUser(null));
assert.equal(displayName(user),'Alice Test');
for(const code of ['auth/popup-closed-by-user','auth/popup-blocked','auth/network-request-failed','auth/unauthorized-domain']){
 popupError={code};await control.signIn();assert.equal(control.busy,false);assert.equal(states.at(-1)[1],authMessage({code}));assert.equal(control.user,null);
}
popupError=null;await control.signIn();assert.equal(control.user,user);assert.equal(states.at(-1)[0],'signed-in');
await control.signOut();assert.equal(control.user,null);assert.equal(states.at(-1)[0],'signed-out');
const noAuth=new FirebaseTransport({},'mountain-v2');let rejected;
await noAuth.start({status(){},error:e=>rejected=e},()=>({}));assert.equal(rejected.code,'auth/sign-in-required');assert.equal(await noAuth.publish({}),false);
const anonymous={uid:'anon',isAnonymous:true,providerData:[]};
const anonTransport=new FirebaseTransport({},'mountain-v2',{auth:{currentUser:anonymous},user:anonymous});
await anonTransport.start({status(){},error:e=>rejected=e},()=>({}));assert.equal(rejected.code,'auth/sign-in-required');
// Same Google account in two tabs gets independent presence IDs; auth is never deleted.
const subscriptions=[],network=[];
const dbSDK={getDatabase:()=>({}),goOnline(){},ref:(_,p)=>p,serverTimestamp:()=>Date.now(),
 onValue(p,cb){subscriptions.push([p,cb]);return()=>network.push('unsubscribe');},
 onChildAdded:()=>()=>{},onChildChanged:()=>()=>{},onChildRemoved:()=>()=>{},
 onDisconnect:()=>({async remove(){network.push('armed');}}),
 async set(){network.push('set');},async remove(){network.push('remove');},goOffline(){network.push('offline');}
};
const context={app:{},auth:{currentUser:user},user,dbSDK};
const one=new FirebaseTransport({},'mountain-v2',context),two=new FirebaseTransport({},'mountain-v2',context);
const cb={identity(){},status(){},error(e){throw e;}};
await one.start(cb,()=>({}));await two.start(cb,()=>({}));assert.notEqual(one.uid,two.uid);
await one.establishPresence(one.generation); // No write while not connected.
assert(!network.includes('set'));
subscriptions.find(([p])=>p==='.info/connected')[1]({val:()=>true});
await Promise.resolve();await Promise.resolve();await Promise.resolve();assert(one.ready);
assert(network.indexOf('armed')<network.indexOf('set'));
context.auth.currentUser=null;assert.equal(await one.publish({}),false);
await one.stop();assert(network.indexOf('remove')<network.indexOf('offline'));assert(one.disposed);
await two.stop();
console.log('Google sign-in/out, cancelled/blocked/error flows, anonymous write denial, isolated tab identities and presence cleanup pass (SDK contract tests).');
