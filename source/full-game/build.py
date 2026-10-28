from pathlib import Path
import importlib.util
import hashlib
import json

P=Path(__file__).resolve().parent
source=P.parent/'docs/checkpoint1/compressed/playable/build.py'
spec=importlib.util.spec_from_file_location('week3_finance',source)
engine=importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
events=json.loads((P/'events.json').read_text(encoding='utf-8'))
nodes={}


def visit(key, actions, weights, nav, ledger, parent=None):
    id=key+':'+'.'.join(actions)
    node=dict(id=id,strategy=key,round=len(actions)+1,weights=weights,nav=nav,parent=parent,
              record=ledger[-1] if ledger else None,options={})
    nodes[id]=node
    if len(actions)==len(events):
        return
    for action in engine.DECISIONS:
        record=engine.settle(key,actions,weights,nav,ledger,action)
        node['options'][action]=dict(weights=record['weights'],next=record['next'])
        visit(key,actions+[action],record['drift'],record['after'],ledger+[record],id)


for key,s in engine.STRATEGIES.items():
    visit(key,[],s['weights'],100000,[])
data=dict(version='factorlab-campaign-v1',synthetic=True,rounds=len(events),events=events,
          strategies=engine.STRATEGIES,decisions=engine.DECISIONS,sectors=engine.F['sectors'],
          contribution_labels=engine.F['contribution_labels'],nodes=nodes,
          finance_source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
          fixture_sha256=hashlib.sha256(engine.SOURCE.read_bytes()).hexdigest())
encoded=json.dumps(data,ensure_ascii=False,separators=(',',':'))
(P/'data.json').write_text(encoded+'\n',encoding='utf-8')
(P/'data.js').write_text('window.FACTORLAB_CAMPAIGN = '+encoded+';\n',encoding='utf-8')
print(json.dumps(dict(nodes=len(nodes),paths=sum(n['round']==7 for n in nodes.values()),bytes=len(encoded.encode('utf-8')))))
