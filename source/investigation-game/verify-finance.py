from decimal import Decimal, getcontext
from pathlib import Path
import json
import subprocess

getcontext().prec = 40
root = Path(__file__).resolve().parent.parent
fixture = json.loads((root / 'card-game/data.json').read_text(encoding='utf-8'), parse_float=Decimal)['rounds'][1]
script = """
const C=require('./investigation-game/chapter.js');
console.log(JSON.stringify(['hold','increase','decrease'].map(choice=>{
 let s=C.reduce(C.initial(),{type:'read',id:'E2'});
 s=C.reduce(s,{type:'choose',choice});
 s=C.reduce(s,{type:'reason',reason:'valuation',note:'Independent financial verification'});
 return {choice,result:C.reduce(s,{type:'lock'}).result};
})));
"""
states = json.loads(subprocess.check_output(['node', '-e', script], cwd=root).decode('utf-8'), parse_float=Decimal)
initial = list(map(Decimal, ['.2', '.2', '.15', '.15', '.15', '.15']))
tol = Decimal('1e-10')
anchor_return = sum(w*r for w, r in zip(initial, fixture['sector_returns']))
checks = 0
for state in states:
    weights = initial.copy()
    delta = {'hold': Decimal(0), 'increase': Decimal('.05'), 'decrease': Decimal('-.05')}[state['choice']]
    weights[0] += delta
    weights[5] -= delta
    ret = sum(w*r for w, r in zip(weights, fixture['sector_returns']))
    nav = Decimal(100000)*(1+ret)
    r = state['result']
    expected = {
        'after': nav, 'return_value': ret,
        'anchorAfter': Decimal(100000)*(1+anchor_return),
        'tacticalAmount': Decimal(100000)*(ret-anchor_return),
        'tacticalPP': (ret-anchor_return)*100,
        'maximum_drawdown': max(Decimal(0), -ret),
        'benchmark_nav': Decimal(100000)*(1+fixture['benchmark_return']),
    }
    for key, value in expected.items():
        assert abs(Decimal(r[key])-value) < tol, (state['choice'], key)
        checks += 1
    assert abs(sum(r['drift'])-1) < tol
    assert abs(sum(r['contributions'])-ret) < tol
    assert abs(sum(r['sector_contributions'])-ret) < tol
    assert r['sharpe'] is None and r['volatility'] is None
    checks += 4
    for k in range(4):
        contribution = sum(weights[i]*fixture['exposures'][i][k]*fixture['factor_returns'][k] for i in range(5))
        assert abs(r['contributions'][k]-contribution) < tol
        checks += 1
print(f'PASS: {checks} independent Decimal checks across all three decisions; tolerance {tol}; no legacy files changed.')
