const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const directory=process.argv[2];
if(!directory||!path.isAbsolute(directory))throw Error('Укажите абсолютный путь папки документов');
const file=path.join(directory,crypto.randomUUID());
try{fs.writeFileSync(file,'strova-storage-check',{mode:0o600,flag:'wx'});if(fs.readFileSync(file,'utf8')!=='strova-storage-check')throw Error('storage/read-failed');console.log('Хранилище документов доступно для записи и чтения');}
finally{try{fs.unlinkSync(file);}catch{}}
