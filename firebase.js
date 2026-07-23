const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCeDtSXCmAnez4gTvl8LGONsMiieqLDBj8",
  authDomain: "routemaster-57d76.firebaseapp.com",
  projectId: "routemaster-57d76",
  storageBucket: "routemaster-57d76.firebasestorage.app",
  messagingSenderId: "996205028935",
  appId: "1:996205028935:web:3d8afb17a294457af07362"
};

(function(){
  const DEVICE_KEY="routemaster_device_id";
  const CLOUD_STAMP_KEY="routemaster_cloud_stamp";
  const COLLECTION="routemaster";
  const DOCUMENT="shared-state";
  let db=null,docRef=null,unsubscribe=null,pushTimer=null,applyingRemote=false,started=false;
  let deviceId=localStorage.getItem(DEVICE_KEY);
  if(!deviceId){deviceId=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));localStorage.setItem(DEVICE_KEY,deviceId)}

  function status(state,label,message=""){
    window.dispatchEvent(new CustomEvent("routemaster-cloud-status",{detail:{state,label,message}}));
  }
  function meaningful(data){
    return !!data && ([data.drivers,data.assistants,data.vehicles,data.routeCatalog,data.plans].some(v=>Array.isArray(v)&&v.length>0));
  }
  function normalize(data){
    return {
      version:data?.version||"1.0.0",
      drivers:Array.isArray(data?.drivers)?data.drivers:[],
      assistants:Array.isArray(data?.assistants)?data.assistants:[],
      vehicles:Array.isArray(data?.vehicles)?data.vehicles:[],
      routeCatalog:Array.isArray(data?.routeCatalog)?data.routeCatalog:[],
      plans:Array.isArray(data?.plans)?data.plans:[],
      settings:{simpleMax:2000,mediumMax:3500,...(data?.settings||{})}
    };
  }
  async function pushNow(data){
    if(!docRef||applyingRemote||!navigator.onLine)return false;
    status("syncing","Sincronizando","Enviando cambios a Firebase");
    try{
      const payload=normalize(data);
      await docRef.set({state:payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:deviceId},{merge:false});
      localStorage.setItem(CLOUD_STAMP_KEY,String(Date.now()));
      status("online","Sincronizado","Los cambios están disponibles en los demás dispositivos");
      return true;
    }catch(error){
      console.error("RouteMaster Firebase push:",error);
      status(navigator.onLine?"error":"offline",navigator.onLine?"Error de sincronización":"Sin conexión",error.message||"");
      return false;
    }
  }
  function queuePush(data,immediate=false){
    clearTimeout(pushTimer);
    if(!navigator.onLine){status("offline","Sin conexión","Los cambios permanecen guardados localmente");return}
    pushTimer=setTimeout(()=>pushNow(data),immediate?0:650);
  }
  async function start(localState,onRemote){
    if(started)return;started=true;
    if(!window.firebase){status("error","Firebase no cargó","Verifica la conexión a Internet");return}
    status("connecting","Conectando","Buscando datos compartidos");
    try{
      if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
      db=firebase.firestore();docRef=db.collection(COLLECTION).doc(DOCUMENT);
      try{await db.enablePersistence({synchronizeTabs:true})}catch(e){if(!["failed-precondition","unimplemented"].includes(e.code))console.warn(e)}
      const snap=await docRef.get();
      if(!snap.exists){
        await pushNow(localState);
      }else{
        const cloud=normalize(snap.data()?.state);
        if(meaningful(localState)&&!meaningful(cloud))await pushNow(localState);
        else if(meaningful(cloud)){
          applyingRemote=true;onRemote(cloud);applyingRemote=false;
          status("online","Sincronizado","Datos cargados desde Firebase");
        }else await pushNow(localState);
      }
      unsubscribe=docRef.onSnapshot(snapshot=>{
        if(!snapshot.exists)return;
        const data=snapshot.data();
        if(data?.updatedBy===deviceId){status("online","Sincronizado","Cambios guardados en Firebase");return}
        const cloud=normalize(data?.state);
        applyingRemote=true;onRemote(cloud);applyingRemote=false;
        status("online","Actualizado","Se recibieron cambios de otro dispositivo");
      },error=>{console.error(error);status(navigator.onLine?"error":"offline",navigator.onLine?"Error de sincronización":"Sin conexión",error.message||"")});
    }catch(error){
      console.error("RouteMaster Firebase start:",error);
      status(navigator.onLine?"error":"offline",navigator.onLine?"Firebase bloqueado":"Sin conexión",error.message||"Revisa las reglas de Firestore");
    }
  }
  window.addEventListener("online",()=>{status("syncing","Reconectando");window.RouteMasterCloud?.queuePush(window.RouteMasterState?.()||null,true)});
  window.addEventListener("offline",()=>status("offline","Sin conexión","RouteMaster sigue funcionando con localStorage"));
  window.RouteMasterCloud={start,queuePush,pushNow};
})();
