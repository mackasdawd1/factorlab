from decimal import Decimal, localcontext
from pathlib import Path
import json

P=Path(__file__).resolve().parent
runs=json.loads((P/'evidence/trajectories.json').read_text(encoding='utf-8'),parse_float=Decimal)
D=json.loads((P.parent/'data.json').read_text(encoding='utf-8'),parse_float=Decimal)
checks=0
def near(actual, expected, tolerance=Decimal('1e-8')):
    global checks
    assert abs(Decimal(actual)-expected)<tolerance,(actual,expected)
    checks+=1
with localcontext() as ctx:
    ctx.prec=40
    for run in runs:
        nav=Decimal(100000);anchor=nav;aw=D['strategies'][run['key']]['weights'];cum=[Decimal(0)]*9;rets=[];peak=nav;dd=Decimal(0)
        for rec,market in zip(run['ledger'],D['rounds']):
            w=rec['weights'];gross=sum(x*y for x,y in zip(w,market['sector_returns']))
            moves=rec['repairs']+[m for c in rec['cards'] for m in c['moved']]
            rate=sum(m['amount']*(Decimal('.0013') if m['from']==5 else Decimal('.0018') if m['to']==5 else Decimal('.0031')) for m in moves) if run['mode']=='realistic' else Decimal(0)
            fee=nav*rate;after=(nav-fee)*(1+gross);ret=after/nav-1
            near(rec['after'],after,Decimal('1e-6'));near(rec['costs_paid'],fee);near(rec['return_value'],ret)
            parts=[sum(w[i]*market['exposures'][i][k]*market['factor_returns'][k] for i in range(5)) for k in range(4)]
            parts += [sum(w[:5])*market['market_return'],sum(w[i]*market['event_returns'][i] for i in range(5)),sum(w[i]*market['residual_returns'][i] for i in range(5)),w[5]*market['sector_returns'][5]]
            parts=[p*(1-rate) for p in parts]+[-rate]
            near(sum(parts),ret)
            for k,p in enumerate(parts):
                near(rec['contributions'][k],p);cum[k]+=nav/100000*p;near(rec['cumulative_contributions'][k],cum[k])
            near(sum(cum),after/100000-1)
            for i in range(6):near(rec['drift'][i],w[i]*(1+market['sector_returns'][i])/(1+gross))
            ar=sum(x*y for x,y in zip(aw,market['sector_returns']));anchor*=1+ar;aw=[x*(1+y)/(1+ar) for x,y in zip(aw,market['sector_returns'])]
            near(rec['anchor_nav'],anchor,Decimal('1e-6'));near(rec['tactical_pp'],ret-ar)
            rets.append(ret);mean=sum(rets)/len(rets)
            if len(rets)>1:
                vol=(sum((x-mean)**2 for x in rets)/(len(rets)-1)).sqrt();near(rec['volatility'],vol)
                if vol>Decimal('1e-12'):near(rec['sharpe'],(mean-Decimal('.001'))/vol)
            else:assert rec['volatility'] is None and rec['sharpe'] is None
            peak=max(peak,after);dd=max(dd,1-after/peak);near(rec['maximum_drawdown'],dd);nav=after
report=dict(passed=True,campaigns=len(runs),decimal_checks=checks,net_costs_and_attribution=True,anchor_and_risk=True)
(P/'evidence/finance.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
