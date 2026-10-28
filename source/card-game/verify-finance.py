from decimal import Decimal, localcontext
from pathlib import Path
import hashlib
import json
import subprocess

P = Path(__file__).resolve().parent
D = json.loads((P / 'data.json').read_text(encoding='utf-8'), parse_float=Decimal)
for name, expected in D['sources'].items():
    assert hashlib.sha256((P.parent / name).read_bytes()).hexdigest() == expected, name

# D16 rates must stay in sync with engine.js COST_RATES / costRate()
BUY_RATE = Decimal('0.0003') + Decimal('0.001')
SELL_RATE = Decimal('0.0003') + Decimal('0.001') + Decimal('0.0005')

script = r"""
const E=require('./engine.js'),D=require('./data.json');
const play=(s,seed,r)=>{const hand=E.hand(s),offset=(seed+r)%5;
  for(const card of [...hand.slice(offset),...hand.slice(0,offset)])s=E.reduce(s,{type:'play',card,target:(seed+r)%5,from:(seed+r+1)%5},D);
  return s;};
const campaign=(seed,key,mode)=>{
  let s=E.reduce(E.initial(seed),mode==='realistic'?{type:'start',key,mode:'realistic'}:{type:'start',key},D);
  for(let r=1;r<=6;r++){
    s=play(s,seed,r);
    s=E.reduce(s,{type:'lock'},D);s=E.reduce(s,{type:'next'},D);
    if(s.phase==='upgrade')s=E.reduce(s,{type:'upgrade',key:['energy','precision','lens'].find(u=>!s.upgrades.includes(u))},D);
  }
  return {seed,key,mode,ledger:s.ledger,finalNav:s.nav,finalAnchorNav:s.anchorNav};
};
const runs=[];
for(let seed=0;seed<40;seed++)for(const key of Object.keys(D.strategies)){
  runs.push(campaign(seed,key,'teaching'));
  runs.push(campaign(seed,key,'realistic'));
}
console.log(JSON.stringify(runs));
"""
runs = json.loads(subprocess.check_output(['node', '-e', script], cwd=P, text=True, encoding='utf-8'), parse_float=Decimal)
checks = 0
anchor_checks = 0
cost_checks = 0
realistic_runs = 0


def near(actual, expected, tolerance=Decimal('1e-9')):
    global checks
    assert abs(Decimal(actual) - expected) < tolerance, (actual, expected)
    checks += 1


with localcontext() as ctx:
    ctx.prec = 40
    for run in runs:
        realistic = run['mode'] == 'realistic'
        if realistic:
            realistic_runs += 1
        nav = Decimal(100000)
        benchmark = nav
        anchor_nav = nav
        cumulative = [Decimal(0)] * 8
        peak = nav
        max_dd = Decimal(0)
        returns = []
        costs_total = Decimal(0)
        first = True
        for rec, market in zip(run['ledger'], D['rounds']):
            w = [Decimal(x) for x in rec['weights']]
            near(sum(w), Decimal(1))
            assert all(0 <= x <= 1 for x in w)
            ret = sum(x * y for x, y in zip(w, market['sector_returns']))
            factors = [sum(w[i] * market['exposures'][i][k] * market['factor_returns'][k] for i in range(5)) for k in range(4)]
            parts = factors + [sum(w[:5]) * market['market_return'], sum(w[i] * market['event_returns'][i] for i in range(5)), sum(w[i] * market['residual_returns'][i] for i in range(5)), w[5] * market['sector_returns'][5]]
            near(sum(parts), ret)
            for k, part in enumerate(parts):
                near(rec['contributions'][k], part)
                cumulative[k] += nav / 100000 * part
                near(rec['cumulative_contributions'][k], cumulative[k])
            # D16 R2: anchor (no-trade) path
            aw = [Decimal(x) for x in rec['anchor_weights']]
            if first:
                assert aw == [Decimal(x) for x in D['strategies'][run['key']]['weights']]
            anchor_ret = sum(x * y for x, y in zip(aw, market['sector_returns']))
            near(rec['anchor_return'], anchor_ret)
            near(rec['anchor_nav'], anchor_nav * (1 + anchor_ret), Decimal('1e-7'))
            anchor_nav = Decimal(rec['anchor_nav'])
            near(rec['tactical_pp'], ret - anchor_ret)
            anchor_checks += 3
            # D16 R3: realistic costs recomputed from the played moves
            if realistic:
                charge = Decimal(0)
                for card in rec['cards']:
                    for m in card.get('moved', []):
                        buy = m['from'] == 5
                        sell = m['to'] == 5
                        rate = (BUY_RATE if (buy or not sell) else Decimal(0)) + (SELL_RATE if (sell or not buy) else Decimal(0))
                        charge += Decimal(str(m['amount'])) * nav * rate
                near(rec['costs_paid'], charge)
                costs_total += charge
                cost_checks += 1
            else:
                assert Decimal(rec['costs_paid']) == 0
            nav = nav * (1 + ret) - (Decimal(rec['costs_paid']) if realistic else Decimal(0))
            benchmark *= 1 + market['benchmark_return']
            peak = max(peak, nav)
            max_dd = max(max_dd, 1 - nav / peak)
            returns.append(ret)
            near(rec['after'], nav, Decimal('1e-7'))
            near(rec['benchmark_nav'], benchmark, Decimal('1e-7'))
            near(rec['maximum_drawdown'], max_dd)
            for i in range(6):
                near(rec['drift'][i], w[i] * (1 + market['sector_returns'][i]) / (1 + ret))
                near(rec['sector_contributions'][i], w[i] * market['sector_returns'][i])
            if len(returns) > 1:
                mean = sum(returns) / len(returns)
                volatility = (sum((x - mean) ** 2 for x in returns) / (len(returns) - 1)).sqrt()
                near(rec['volatility'], volatility)
                if volatility > Decimal('1e-12'):
                    near(rec['sharpe'], (mean - Decimal('.001')) / volatility)
            else:
                assert rec['volatility'] is None and rec['sharpe'] is None
            first = False
        near(Decimal(run['finalNav']), nav, Decimal('1e-7'))
        near(Decimal(run['finalAnchorNav']), anchor_nav, Decimal('1e-7'))
        if realistic:
            near(100000 * sum(cumulative) - costs_total, nav - 100000, Decimal('1e-6'))
        else:
            near(sum(cumulative), nav / 100000 - 1)

teaching_runs = len(runs) - realistic_runs
report = dict(passed=True, campaigns=teaching_runs, settlements=teaching_runs * 6, decimal_checks=checks,
              anchor_checks=anchor_checks, realistic_campaigns=realistic_runs, realistic_settlements=realistic_runs * 6,
              cost_checks=cost_checks, original_source_hashes_verified=True)
(P / 'evidence/finance.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
