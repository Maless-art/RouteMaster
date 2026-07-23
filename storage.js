
const STORAGE_KEY = "routemaster_v0_5_0";
const LEGACY_KEYS = ["routemaster_v0_1_0"];

const defaultData = {
  version: "0.9.0",
  drivers: [],
  assistants: [],
  vehicles: [],
  routeCatalog: [],
  plans: [],
  settings: { simpleMax: 2000, mediumMax: 3500 }
};

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

window.RouteMasterStorage = {
  load(){
    try{
      let raw = localStorage.getItem(STORAGE_KEY);
      if(!raw){
        for(const key of LEGACY_KEYS){
          const legacy = localStorage.getItem(key);
          if(legacy){ raw = legacy; break; }
        }
      }
      if(!raw) return clone(defaultData);
      const parsed = JSON.parse(raw);
      const migrated = {
        ...clone(defaultData),
        ...parsed,
        drivers: parsed.drivers || [],
        assistants: parsed.assistants || [],
        vehicles: parsed.vehicles || [],
        routeCatalog: parsed.routeCatalog || [],
        plans: parsed.plans || [],
        settings: { ...defaultData.settings, ...(parsed.settings || {}) }
      };
      this.save(migrated);
      return migrated;
    }catch(error){
      console.error(error);
      return clone(defaultData);
    }
  },
  save(data){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); },
  reset(){ localStorage.removeItem(STORAGE_KEY); return clone(defaultData); },
  key: STORAGE_KEY
};
