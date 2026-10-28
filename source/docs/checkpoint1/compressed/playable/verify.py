from pathlib import Path
from decimal import Decimal as D, getcontext
from itertools import product
import hashlib
import json

getcontext().prec = 40
P = Path(__file__).resolve().parent
ROOT = P.parents[3]
source = ROOT / 'docs/week2/wireframes/prototype-fixture.json'
f = json.loads(source.read_text(encoding='utf-8'), parse_float=D)
data = json.loads((P / 'data.json').read_text(encoding='utf-8'), parse_float=D)
count = 0


def check(ok, label):
    global count
    count += 1
    assert ok, label


def close(a, b):
    return abs(D(str(a)) - D(str(b))) < D('1e-9')


bases = {'guardian': ['.1','.1','.15','.15','.1','.4'],
         'navigator': ['.2','.2','.15','.15','.15','.15'],
         'challenger': ['.25','.15','.1','.1','.3','.1']}
shifts = dict(guardian=D('.03'), navigator=D('.05'), challenger=D('.07'))
caps = dict(guardian=D('.10'), navigator=D('.20'), challenger=D('.40'))
paths = []
for strategy, first, second in product(bases, ['boost','hold','buffer'], ['boost','hold','buffer']):
    nav, benchmark, peak, dd = D(100000), D(100000), D(100000), D(0)
    current = list(map(D, bases[strategy])); returns = []; cumulative = [D(0)]*8
    prefix = []
    for i, decision in enumerate([first,second]):
        r = f['rounds'][i]
        actual = data['nodes'][strategy + ':' + '.'.join(prefix)]['options'][decision]
        w = current.copy()
        shift = min(shifts[strategy], w[5] if decision == 'boost' else w[4]) if decision != 'hold' else D(0)
        w[4] += shift if decision == 'boost' else -shift
        w[5] -= shift if decision == 'boost' else -shift
        check(all(close(a,b) for a,b in zip(actual['weights'],w)), 'independent strategy transfer')
        check(all(0 <= a <= 1 for a in w) and close(sum(w),1), 'valid weights')
        ret = sum(a*b for a,b in zip(w,r['sector_returns']))
        contribution = [sum(w[j]*r['exposures'][j][k] for j in range(5))*r['factor_returns'][k] for k in range(4)]
        contribution += [(1-w[-1])*r['market_return'], sum(w[j]*r['event_returns'][j] for j in range(5)),sum(w[j]*r['residual_returns'][j] for j in range(5)), w[-1]*r['sector_returns'][-1]]
        cumulative = [a+nav/D(100000)*b for a,b in zip(cumulative,contribution)]
        nav *= 1+ret; returns.append(ret)
        benchmark *= 1+sum(r['sector_returns'][:5])/5
        peak=max(peak,nav); dd=max(dd,1-nav/peak)
        current=[a*(1+b)/(1+ret) for a,b in zip(w,r['sector_returns'])]
        for label,want in [('after',nav),('return_value',ret),('benchmark_nav',benchmark),('maximum_drawdown',dd)]:
            check(close(actual[label],want),label)
        check(all(close(a,b) for a,b in zip(actual['drift'],current)), 'drift feeds next decision')
        check(all(close(a,b) for a,b in zip(actual['contributions'],contribution)), 'eight contributions')
        check(close(sum(cumulative),nav/100000-1), 'wealth-weighted reconciliation')
        check(all(close(a,b) for a,b in zip(actual['cumulative_contributions'],cumulative)), 'cumulative components')
        expected_quality = 'reflect' if decision == 'boost' and w[4] > caps[strategy]+D('1e-10') else 'recognized'
        check(actual['reward']['quality'] == expected_quality, 'ex-ante budget controls reward')
        check(abs(ret-sum(a*b for a,b in zip(data['nodes'][strategy+':'+'.'.join(prefix)]['weights'],r['sector_returns']))) <= D('.00427')+D('1e-10'), 'moderate effect <= 0.427 pp')
        if i == 0:
            check(actual['volatility'] is None and actual['sharpe'] is None,'n=1')
        else:
            vol = (sum((x-sum(returns)/2)**2 for x in returns)).sqrt()
            check(close(actual['volatility'],vol),'sample volatility')
            check(close(actual['sharpe'],(sum(returns)/2-D('.001'))/vol),'monthly Sharpe')
        prefix.append(decision)
    terminal=data['nodes'][strategy+':'+'.'.join(prefix)]
    check(terminal['round']==3 and len(terminal['ledger'])==2, 'terminal after exactly two rounds')
    check(close(terminal['nav'],nav),'final NAV')
    paths.append(dict(strategy=strategy,decisions=prefix,nav=float(nav)))
check(len(data['nodes'])==39,'finite state coverage')
check(all(D(96000)<=node['nav']<=D(104000) for node in data['nodes'].values()),'shared chart bounds contain every path')
check((P/'data.js').read_text(encoding='utf-8') == 'window.FACTORLAB_DATA = '+(P/'data.json').read_text(encoding='utf-8').strip()+';\n','browser data matches verified data')
check(data['source_sha256']==hashlib.sha256(source.read_bytes()).hexdigest(),'unchanged fixture')
check(data['nodes']['guardian:']['options']['boost']['return_value']>0 and data['nodes']['guardian:']['options']['boost']['reward']['quality']=='reflect','lucky gain not excessive reward')
loss=data['nodes']['guardian:hold']['options']['buffer']
check(loss['return_value']<0 and loss['reward']['quality']=='recognized','sound risk action recognized despite loss')
result=dict(status='PASS',checks=count,paths=paths,complete_paths=27,settlement_edges=36,method='Independent Decimal recalculation from immutable fixture and explicit allocation policy',user_testing='NOT RUN')
(P/'evidence').mkdir(exist_ok=True)
(P/'evidence/finance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(status='PASS',checks=count,paths=len(paths))))
