import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(url.pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep))throw Error('Forbidden');const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body)}catch{res.writeHead(404);res.end('Not found')}}).listen(Number(process.env.PORT)||3000,'0.0.0.0');
