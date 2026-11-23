// Existing private administrator scripts must follow the same database setting
// as strova.service, rather than writing back into Firestore after cutover.
const fs = require('node:fs'),path = require('node:path');
function getCliDatabase() {
  for (const file of ['/etc/strova-postgres/connection.env','/etc/strova-postgres/backend.env']) {
    try {
      if(fs.statSync(file).mode&0o077)throw new Error('Private database settings must have mode 600');
      for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
        const match=/^(STROVA_DATABASE_URL|STROVA_DATABASE_BACKEND)=(.*)$/.exec(line);
        if(match)process.env[match[1]]=match[2];
      }
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const mode=process.env.STROVA_DATABASE_BACKEND||'firestore';
  if(mode==='firestore'){const sdk=require('firebase-admin/firestore');return {db:sdk.getFirestore(),FieldValue:sdk.FieldValue,FieldPath:sdk.FieldPath};}
  if(mode!=='postgres')throw new Error('Invalid STROVA_DATABASE_BACKEND');
  const ts=require('typescript'),previous=require.extensions['.ts'];
  const directory=path.resolve(__dirname,'../../src/lib/database');
  require.extensions['.ts']=(module,filename)=>{
    if(!filename.startsWith(directory+path.sep)&&previous)return previous(module,filename);
    const result=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
    module._compile(result.outputText,filename);
  };
  try{
    const {getPostgresDb}=require(path.join(directory,'postgres.ts'));
    const {FieldValue,FieldPath}=require(path.join(directory,'admin-values.ts'));
    return {db:getPostgresDb(),FieldValue,FieldPath};
  }finally{if(previous)require.extensions['.ts']=previous;else delete require.extensions['.ts'];}
}
module.exports={getCliDatabase};
