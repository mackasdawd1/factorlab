from pathlib import Path
import importlib.util
import json
import os
import socket
import subprocess
import sys
import urllib.request

P=Path(__file__).resolve().parent
ROOT=P.parents[3]
spec=importlib.util.spec_from_file_location('demo',P/'demo.py')
demo=importlib.util.module_from_spec(spec);spec.loader.exec_module(demo)
env=dict(os.environ,FACTORLAB_NO_BROWSER='1')
checks=[]


def run(command, expected=0):
    result=subprocess.run(command,cwd=ROOT,env=env,capture_output=True,text=True,timeout=25)
    assert result.returncode==expected,(command,result.stdout,result.stderr)
    checks.append(dict(command=command,status='PASS',output=result.stdout.strip()))
    return result


run([sys.executable,str(P/'demo.py'),'smoke'])
missing=subprocess.run([os.environ['COMSPEC'],'/c','START_FACTORLAB_MVP.bat'],cwd=ROOT,env=dict(env,PATH=''),capture_output=True,text=True,timeout=10)
assert missing.returncode==1 and 'Python 3.9' in missing.stdout
checks.append(dict(command=['START with empty PATH'],status='PASS',output='Missing runtime reported; no server launch'))
run(['cmd','/c','STOP_FACTORLAB_MVP.bat'])
run(['cmd','/c','START_FACTORLAB_MVP.bat'])
first=demo.health(8876);assert first
run(['cmd','/c','START_FACTORLAB_MVP.bat'])
assert demo.health(8876)['pid']==first['pid']
try:
    urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8876/__factorlab_stop',method='POST'),timeout=2)
    raise AssertionError('Unauthenticated stop accepted')
except urllib.error.HTTPError as error:
    assert error.code==403
assert demo.health(8876)
run(['cmd','/c','STOP_FACTORLAB_MVP.bat'])
assert not demo.health(8876)
run(['cmd','/c','STOP_FACTORLAB_MVP.bat'])
with socket.socket() as blocker:
    blocker.bind(('127.0.0.1',8876));blocker.listen()
    output=run([sys.executable,str(P/'demo.py'),'start','--no-browser'],1)
    assert 'occupied' in output.stderr
run(['cmd','/c','START_FACTORLAB_MVP.bat'])
assert demo.health(8876)['pid']!=first['pid']
(P/'evidence/demo.json').write_text(json.dumps(dict(status='PASS',checks=checks,duplicate_server='same PID reused',unauthorized_stop='403, server preserved',collision='refused without stopping other service',restart='PASS',final_state='RUNNING on 8876'),indent=2)+'\n',encoding='utf-8')
print('PASS: launcher / duplicate / collision / authenticated stop / restart')
