from pathlib import Path
from decimal import Decimal as Dec, getcontext
import json
import hashlib
import datetime

getcontext().prec=40
P=Path(__file__).resolve().parent
source=P.parent/'docs/week2/wireframes/prototype-fixture.json'
fixture=json.loads(source.read_text(encoding='utf-8'),parse_float=Dec)
data=json.loads((P/'data.json').read_text(encoding='utf-8'),parse_float=Dec)
old=json.loads((P.parent/'docs/checkpoint1/compressed/playable/data.json').read_text(encoding='utf-8'),parse_float=Dec)
count=0
paths=0


def close(actual,expected,label):
    global count
    count+=1
    assert abs(Dec(str(actual))-expected)<Dec('1e-9'),label


def walk(key,actions,weights,nav,returns,cumulative,benchmark,peak,dd):
    global paths
    id=key+':'+'.'.join(actions);node=data['nodes'][id]
    assert node['round']==len(actions)+1
    close(node['nav'],nav,'NAV')
    for a,b in zip(node['weights'],weights):close(a,b,'drift')
    if len(actions)==6:
        assert node['options']=={}
        paths+=1
        return
    i=len(actions);r=fixture['rounds'][i]
    for action,option in node['options'].items():
        w=weights.copy();shift=Dec({'guardian':'.03','navigator':'.05','challenger':'.07'}[key])
        if action=='boost':
            delta=min(shift,w[-1]);w[4]+=delta;w[5]-=delta
        if action=='buffer':
            delta=min(shift,w[4]);w[4]-=delta;w[5]+=delta
        assert all(0<=v<=1 for v in w)
        close(sum(w),Dec(1),'weight sum')
        for a,b in zip(option['weights'],w):close(a,b,'preview weights')
        ret=sum(a*b for a,b in zip(w,r['sector_returns']))
        after=nav*(1+ret);drift=[w[j]*(1+r['sector_returns'][j])/(1+ret) for j in range(6)]
        components=[sum(w[j]*r['exposures'][j][k] for j in range(5))*r['factor_returns'][k] for k in range(4)]
        components += [(1-w[5])*r['market_return'],sum(w[j]*r['event_returns'][j] for j in range(5)),sum(w[j]*r['residual_returns'][j] for j in range(5)),w[5]*r['sector_returns'][5]]
        total=[a+nav/100000*b for a,b in zip(cumulative,components)]
        actual=data['nodes'][option['next']]['record']
        new_returns=returns+[ret];new_peak=max(peak,after);new_dd=max(dd,1-after/new_peak)
        new_benchmark=benchmark*(1+sum(r['sector_returns'][:5])/5)
        for name,expected in [('before',nav),('after',after),('return_value',ret),('cash_after',after*drift[5]),('maximum_drawdown',new_dd),('benchmark_nav',new_benchmark),('effect_vs_hold',ret-sum(a*b for a,b in zip(weights,r['sector_returns'])))]:close(actual[name],expected,name)
        close(sum(components),ret,'round attribution');close(sum(total),after/100000-1,'cumulative attribution')
        for a,b in zip(actual['cumulative_contributions'],total):close(a,b,'component total')
        if len(new_returns)==1:assert actual['sharpe'] is None and actual['volatility'] is None
        else:
            mean=sum(new_returns)/len(new_returns)
            vol=(sum((v-mean)**2 for v in new_returns)/(len(new_returns)-1)).sqrt()
            close(actual['volatility'],vol,'sample vol')
            if vol>Dec('1e-12'):close(actual['sharpe'],(mean-Dec('.001'))/vol,'monthly Sharpe')
            else:assert actual['sharpe'] is None
        if len(actions)<2:assert actual==old['nodes'][id]['options'][action],'Week 3 compatibility'
        walk(key,actions+[action],drift,after,new_returns,total,new_benchmark,new_peak,new_dd)


for key,weights in {'guardian':['.1','.1','.15','.15','.1','.4'],'navigator':['.2','.2','.15','.15','.15','.15'],'challenger':['.25','.15','.1','.1','.3','.1']}.items():
    walk(key,[],list(map(Dec,weights)),Dec(100000),[],[Dec(0)]*8,Dec(100000),Dec(100000),Dec(0))
assert paths==2187 and len(data['nodes'])==3279
assert data['fixture_sha256']==hashlib.sha256(source.read_bytes()).hexdigest()
assert (P/'data.js').read_text(encoding='utf-8')=='window.FACTORLAB_CAMPAIGN = '+(P/'data.json').read_text(encoding='utf-8').strip()+';\n'
evidence=dict(status='PASS',checks=count,complete_paths=paths,settlements=3276,week3_compatibility='36 records exactly equal',method='Independent recursive Decimal recalculation from immutable fixture; no production settlement imported',verified_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
(P/'evidence').mkdir(exist_ok=True)
(P/'evidence/finance.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
print(json.dumps(evidence))
