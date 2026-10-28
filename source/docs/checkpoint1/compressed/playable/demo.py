from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import argparse
import functools
import hashlib
import hmac
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
IDENTITY = hashlib.sha256(str(HERE).encode()).hexdigest()
RUNTIME = ROOT / '.local' / 'factorlab-demo.json'
APP_ID = 'factorlab-week3-playable'


def smoke():
    for name in ['index.html','app.js','style.css','data.js','data.json']:
        if not (HERE/name).is_file():
            raise RuntimeError('Missing demo file: '+name)
    raw=(HERE/'data.json').read_text(encoding='utf-8').strip()
    data=json.loads(raw)
    if (HERE/'data.js').read_text(encoding='utf-8') != 'window.FACTORLAB_DATA = '+raw+';\n':
        raise RuntimeError('Data files differ. Run build.py, then verify.py before demo.')
    source=ROOT/'docs/week2/wireframes/prototype-fixture.json'
    if data['source_sha256'] != hashlib.sha256(source.read_bytes()).hexdigest():
        raise RuntimeError('Scenario source changed. Revalidate before demo.')
    if len(data['nodes']) != 39 or len(data['strategies']) != 3:
        raise RuntimeError('Incomplete scenario tree.')
    for node in data['nodes'].values():
        if node['round']<3 and len(node['options'])!=3:
            raise RuntimeError('Missing decision.')
        for record in node['options'].values():
            if record['next'] not in data['nodes'] or abs(sum(record['weights'])-1)>1e-10:
                raise RuntimeError('Broken transition or allocation.')
    return data['version']


def health(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/__factorlab_health',timeout=.6) as response:
            result=json.loads(response.read(4096))
            valid = (isinstance(result,dict) and result.get('app')==APP_ID and result.get('identity')==IDENTITY
                     and type(result.get('pid')) is int and result['pid']>0)
            return result if valid else None
    except (OSError,ValueError):
        return None


def read_runtime():
    recovery = ' No process was stopped or record overwritten. Open playable/index.html directly as the offline fallback.'
    try:
        record=json.loads(RUNTIME.read_text(encoding='utf-8'))
    except (ValueError,UnicodeError) as error:
        raise RuntimeError('Saved server record is invalid.'+recovery) from error
    if (not isinstance(record,dict) or type(record.get('port')) is not int or not 1024<=record['port']<=65535
            or type(record.get('pid')) is not int or record['pid']<=0
            or not isinstance(record.get('token'),str) or len(record['token'])<32
            or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in record['token'])):
        raise RuntimeError('Saved server record is invalid.'+recovery)
    if record.get('identity')!=IDENTITY:
        raise RuntimeError('Saved server record belongs to another repository.'+recovery)
    return record


def serve(port):
    smoke()
    token=secrets.token_urlsafe(32)

    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path=='/__factorlab_health':
                body=json.dumps(dict(app=APP_ID,identity=IDENTITY,version='week3-playable-v1',pid=os.getpid())).encode()
                self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
            else:
                super().do_GET()

        def end_headers(self):
            self.send_header('Cache-Control','no-store')
            super().end_headers()

        def do_POST(self):
            if self.path!='/__factorlab_stop' or not hmac.compare_digest(self.headers.get('X-FactorLab-Token',''),token):
                self.send_error(403); return
            self.send_response(200); self.end_headers(); self.wfile.write(b'Stopping FactorLab')
            threading.Thread(target=server.shutdown,daemon=True).start()

    server=ThreadingHTTPServer(('127.0.0.1',port),functools.partial(Handler,directory=str(HERE)))
    RUNTIME.parent.mkdir(exist_ok=True)
    RUNTIME.write_text(json.dumps(dict(port=port,token=token,identity=IDENTITY,pid=os.getpid())),encoding='utf-8')
    try: server.serve_forever(poll_interval=.1)
    finally: server.server_close()


def start(port, no_browser):
    smoke()
    info=health(port)
    if info:
        print(f'FactorLab already running on port {port}; reusing server PID {info["pid"]}.')
    else:
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1',port))==0:
                raise RuntimeError(f'Port {port} is occupied by another service. No process was stopped. Use demo.py start --port 8877 or stop that service yourself.')
        if RUNTIME.exists():
            previous=read_runtime()
            if previous.get('port')!=port and health(previous['port']):
                raise RuntimeError(f'FactorLab is already running on port {previous["port"]}. Stop it before selecting another port.')
        RUNTIME.parent.mkdir(exist_ok=True)
        with (RUNTIME.parent/'factorlab-demo.log').open('ab') as log:
            child=subprocess.Popen([sys.executable,str(__file__),'serve','--port',str(port)],stdout=log,stderr=log,stdin=subprocess.DEVNULL,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0,close_fds=True)
        for _ in range(50):
            if health(port): break
            if child.poll() is not None: raise RuntimeError('Server failed to start. See .local/factorlab-demo.log.')
            time.sleep(.1)
        else: raise RuntimeError('Startup timed out. See .local/factorlab-demo.log; run STOP before retrying.')
        print(f'FactorLab started on port {port}.')
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html',timeout=2) as response:
        if b'FactorLab' not in response.read(): raise RuntimeError('HTTP smoke check failed.')
    url=f'http://127.0.0.1:{port}/index.html'
    print('Smoke check PASS. Open '+url)
    if not no_browser and os.environ.get('FACTORLAB_NO_BROWSER')!='1': webbrowser.open(url)


def stop():
    if not RUNTIME.exists(): print('No managed FactorLab server. Nothing to stop.'); return
    saved=read_runtime()
    info=health(saved['port'])
    if not info: print('Managed server is not running. Other services were not touched.'); return
    if saved.get('identity')!=IDENTITY or info['pid']!=saved.get('pid'):
        raise RuntimeError('Server identity does not match the saved session. No process was stopped.')
    request=urllib.request.Request(f'http://127.0.0.1:{saved["port"]}/__factorlab_stop',method='POST',headers={'X-FactorLab-Token':saved['token']})
    with urllib.request.urlopen(request,timeout=2) as response: response.read()
    for _ in range(40):
        if not health(saved['port']): print('FactorLab stopped.'); return
        time.sleep(.1)
    raise RuntimeError('Server has not stopped yet. Retry STOP shortly.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Offline FactorLab mentor demo')
    parser.add_argument('command',choices=['start','stop','serve','smoke'])
    parser.add_argument('--port',type=int,default=8876)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    try:
        if not 1024<=args.port<=65535: raise RuntimeError('Port must be between 1024 and 65535.')
        if args.command=='start': start(args.port,args.no_browser)
        elif args.command=='stop': stop()
        elif args.command=='serve': serve(args.port)
        else: print('Smoke check PASS: '+smoke())
    except (OSError,ValueError,RuntimeError,KeyError) as error:
        print('FactorLab: '+str(error),file=sys.stderr); sys.exit(1)
