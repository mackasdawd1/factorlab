from decimal import Decimal, getcontext
from pathlib import Path
import hashlib
import json
import subprocess


getcontext().prec = 48
ROOT = Path(__file__).resolve().parent
D = Decimal
ZERO, ONE = D(0), D(1)
AMOUNT_TOLERANCE = D('0.000001')
RATIO_TOLERANCE = D('0.000000001')
checks = 0


def near(actual, expected, label, tolerance=AMOUNT_TOLERANCE):
    global checks
    actual, expected = D(actual), D(expected)
    assert actual.is_finite() and expected.is_finite(), (label, actual, expected)
    assert abs(actual - expected) <= tolerance, (label, str(actual), str(expected))
    checks += 1


def require(condition, label):
    global checks
    assert condition, label
    checks += 1


def total_attribution(attribution):
    return sum((D(attribution[key]) for key in ('market', 'sector', 'event', 'idiosyncratic', 'cash', 'cost')), ZERO) + sum(attribution['factors'], ZERO)


def solve_post_fee_nav(before, holdings, target):
    net = before
    for _ in range(20):
        signed_rates = [D('.0013') if target[i] * net >= holdings[i] else -D('.0018') for i in range(5)]
        updated = (before + sum((holdings[i] * signed_rates[i] for i in range(5)), ZERO)) / (ONE + sum((target[i] * signed_rates[i] for i in range(5)), ZERO))
        if abs(updated - net) < D('1e-35'):
            return updated
        net = updated
    raise AssertionError('Independent piecewise-affine fee solution did not converge')


SCRIPT = r"""
const E=require('./simulation.js');
const snapshot=s=>({day:s.day,nav:s.nav,cash:s.cash,units:s.units,prices:s.prices,weights:s.weights});
const results=[];
for(const seed of [1,11,927,2026])for(const scenario of ['', 'stress'])for(const policy of ['balanced','cash','rotate']){
 let s=E.initial({seed,...(scenario?{scenario}:{})}),initial=snapshot(s),locks=[];
 while(s.phase!=='complete'){
  if(s.phase==='decision'){
   const weights=policy==='cash'?[0,0,0,0,0,1]:policy==='balanced'?[.2,.2,.15,.15,.15,.15]:s.day%40===0?[.4,.3,.1,.05,.05,.1]:[.05,.05,.1,.3,.4,.1];
   const before=snapshot(s);
   s=E.reduce(s,{type:'lock',weights,factorWeights:[.25,.25,.25,.25],reason:'Independent accounting verification: preserve allocation evidence.',forecast:'flat'});
   locks.push({before,after:snapshot(s),target:weights,transaction:s.transactions.at(-1),metrics:E.metrics(s)});
  }else s=E.reduce(s,{type:s.phase==='event'?'resume':s.phase==='review'?'next':'advance',days:120});
 }
 results.push({seed,scenario:scenario||'default',policy,initial,locks,final:snapshot(s),history:s.history,rounds:s.results,metrics:E.metrics(s),exposures:E.EXPOSURES});
}
process.stdout.write(JSON.stringify(results));
"""


def verify_run(run):
    label = f"{run['seed']}/{run['scenario']}/{run['policy']}"
    initial, final, history = run['initial'], run['final'], run['history']
    require(len(history) == 121 and len(run['rounds']) == 6, label + '/six rounds')
    near(history[0]['nav'], D(100000), label + '/initial NAV')
    require(history[0]['day'] == 0 and history[-1]['day'] == 120, label + '/daily coverage')
    fees = {}
    locks = {}
    for lock in run['locks']:
        before, after, target = lock['before'], lock['after'], lock['target']
        day = int(before['day'])
        holdings = [before['units'][i] * before['prices'][i] for i in range(5)]
        near(sum(holdings, before['cash']), before['nav'], label + f'/pre-trade balance {day}')
        net = solve_post_fee_nav(before['nav'], holdings, target)
        fee = before['nav'] - net
        buys = sum((max(ZERO, target[i] * net - holdings[i]) for i in range(5)), ZERO)
        sells = sum((max(ZERO, holdings[i] - target[i] * net) for i in range(5)), ZERO)
        near(after['nav'], net, label + f'/net-of-fee NAV {day}')
        near(lock['transaction']['fee'], fee, label + f'/fee fixed point {day}')
        near(lock['transaction']['buys'], buys, label + f'/buy notional {day}')
        near(lock['transaction']['sells'], sells, label + f'/sell notional {day}')
        near(fee, buys * D('.0013') + sells * D('.0018'), label + f'/asymmetric fee {day}')
        near(after['cash'], before['cash'] + sells - buys - fee, label + f'/self-financing cash {day}')
        near(after['cash'], net * target[5], label + f'/cash weight {day}')
        for i in range(5):
            near(after['units'][i] * after['prices'][i], net * target[i], label + f'/target {day}/{i}')
        near(sum(after['weights'], ZERO), ONE, label + f'/weights sum {day}', RATIO_TOLERANCE)
        require(all(ZERO <= w <= D('.4') + RATIO_TOLERANCE for w in after['weights'][:5]), label + f'/sector cap {day}')
        require(after['cash'] >= ZERO and after['nav'] > ZERO, label + f'/solvency {day}')
        fees[day + 1] = fee
        locks[day] = after
        observed_peak, observed_drawdown = D(initial['nav']), ZERO
        for nav in [h['nav'] for h in history[:day + 1]] + [after['nav']]:
            nav = D(nav)
            observed_peak = max(observed_peak, nav)
            observed_drawdown = max(observed_drawdown, ONE - nav / observed_peak)
        near(lock['metrics']['maxDrawdown'], observed_drawdown, label + f'/immediate cost-inclusive drawdown {day}', RATIO_TOLERANCE)

    units, cash = initial['units'], initial['cash']
    anchor_units, anchor_cash = initial['units'], initial['cash']
    benchmark = initial['nav']
    cumulative_attribution = ZERO
    peak, maximum_drawdown = initial['nav'], ZERO
    daily_returns = []
    for offset, day in enumerate(history[1:], 1):
        previous = history[offset - 1]
        require(day['day'] == offset, label + '/monotonic day')
        if offset - 1 in locks:
            units, cash = locks[offset - 1]['units'], locks[offset - 1]['cash']
        holdings = [units[i] * previous['prices'][i] for i in range(5)]
        fee = fees.get(offset, ZERO)
        near(day['beforeNav'], previous['nav'], label + f'/continuous NAV {offset}')
        near(day['cashBefore'], cash, label + f'/cash carry {offset}')
        near(day['cashRate'], previous['macro']['rate'] / D(100) / D(252), label + f'/known prior-day risk-free rate {offset}', RATIO_TOLERANCE)
        for i in range(5):
            near(day['holdingsBefore'][i], holdings[i], label + f'/holdings carry {offset}/{i}')
            near(day['prices'][i], previous['prices'][i] * (ONE + day['sectorReturns'][i]), label + f'/price compounding {offset}/{i}')
        cash *= ONE + day['cashRate']
        expected_nav = sum((units[i] * day['prices'][i] for i in range(5)), cash)
        near(day['nav'], expected_nav, label + f'/daily NAV {offset}')
        anchor_cash *= ONE + day['cashRate']
        near(day['anchorNav'], sum((anchor_units[i] * day['prices'][i] for i in range(5)), anchor_cash), label + f'/buy-hold anchor {offset}')
        benchmark *= ONE + sum(day['sectorReturns'], ZERO) / D(5)
        near(day['benchmarkNav'], benchmark, label + f'/equal-weight daily benchmark {offset}')
        attribution = day['attribution']
        near(attribution['cost'], -fee, label + f'/cost exactly once {offset}')
        near(attribution['cash'], day['cashBefore'] * day['cashRate'], label + f'/cash interest {offset}')
        for component in ('market', 'sector', 'event', 'idiosyncratic'):
            expected = sum((holdings[i] * day['contributionReturns'][i][component] for i in range(5)), ZERO)
            near(attribution[component], expected, label + f'/attribution {offset}/{component}')
        for factor in range(4):
            expected = sum((holdings[i] * day['contributionReturns'][i]['factors'][factor] for i in range(5)), ZERO)
            near(attribution['factors'][factor], expected, label + f'/factor attribution {offset}/{factor}')
        for i in range(5):
            components = day['contributionReturns'][i]
            near(day['sectorReturns'][i], sum((components[k] for k in ('market', 'sector', 'event', 'idiosyncratic')), sum(components['factors'], ZERO)), label + f'/sector decomposition {offset}/{i}', RATIO_TOLERANCE)
            for factor in range(4):
                near(components['factors'][factor], run['exposures'][i][factor] * day['factorReturns'][factor], label + f'/factor exposure {offset}/{i}/{factor}', RATIO_TOLERANCE)
        total = total_attribution(attribution)
        near(total, day['nav'] - previous['nav'], label + f'/daily reconciliation {offset}')
        cumulative_attribution += total
        peak = max(peak, day['nav'])
        maximum_drawdown = max(maximum_drawdown, ONE - day['nav'] / peak)
        daily_returns.append(day['nav'] / previous['nav'] - ONE)
        require(day['nav'] > ZERO, label + f'/positive NAV {offset}')

    near(final['nav'] - initial['nav'], cumulative_attribution, label + '/cross-round attribution')
    near(final['nav'], history[-1]['nav'], label + '/final close')
    near(final['cash'], cash, label + '/final cash')
    near(run['metrics']['returnValue'], final['nav'] / initial['nav'] - ONE, label + '/total return', RATIO_TOLERANCE)
    near(run['metrics']['maxDrawdown'], maximum_drawdown, label + '/initial-inclusive daily MDD', RATIO_TOLERANCE)
    near(sum((r['after'] - r['before'] for r in run['rounds']), ZERO), final['nav'] - initial['nav'], label + '/round totals')
    near(total_attribution(run['metrics']['attribution']), cumulative_attribution, label + '/reported aggregate attribution')
    near(run['metrics']['diversification'], ONE - sum((w * w for w in final['weights']), ZERO), label + '/diversification including cash', RATIO_TOLERANCE)
    n = D(len(daily_returns))
    mean = sum(daily_returns, ZERO) / n
    variance = sum(((r - mean) ** 2 for r in daily_returns), ZERO) / (n - ONE)
    excess = [daily_returns[i] - history[i + 1]['cashRate'] for i in range(len(daily_returns))]
    excess_mean = sum(excess, ZERO) / n
    excess_variance = sum(((r - excess_mean) ** 2 for r in excess), ZERO) / (n - ONE)
    near(run['metrics']['volatility'], (variance * D(252)).sqrt(), label + '/sample annualized volatility', RATIO_TOLERANCE)
    if excess_variance < D('1e-20'):
        require(run['metrics']['sharpe'] is None, label + '/zero excess variance Sharpe')
    else:
        near(run['metrics']['sharpe'], excess_mean / excess_variance.sqrt() * D(252).sqrt(), label + '/daily excess-return Sharpe', RATIO_TOLERANCE)
    require(run['metrics']['observations'] == 120 and run['metrics']['annualization'] == 252 and run['metrics']['rf'] == 'known-daily-policy-rate', label + '/risk metadata')
    for index, result in enumerate(run['rounds']):
        start, end = index * 20, (index + 1) * 20
        before = run['locks'][index]['before']
        counterfactual_cash = before['cash']
        for day in history[start + 1:end + 1]:
            counterfactual_cash *= ONE + day['cashRate']
        counterfactual_nav = sum((before['units'][i] * history[end]['prices'][i] for i in range(5)), counterfactual_cash)
        near(result['counterfactualNav'], counterfactual_nav, label + f'/no-trade counterfactual {index + 1}')
        near(result['tacticalAmount'], history[end]['nav'] - counterfactual_nav, label + f'/same-path tactical difference {index + 1}')
        near(result['returnValue'], history[end]['nav'] / history[start]['nav'] - ONE, label + f'/round return {index + 1}', RATIO_TOLERANCE)
        near(total_attribution(result['attribution']), history[end]['nav'] - history[start]['nav'], label + f'/round attribution {index + 1}')
    return daily_returns


def main():
    source_hash = hashlib.sha256((ROOT / 'simulation.js').read_bytes()).hexdigest()
    output = subprocess.check_output(['node', '-e', SCRIPT], cwd=ROOT)
    runs = json.loads(output.decode('utf-8'), parse_float=D)
    for run in runs:
        verify_run(run)
    groups = {}
    for run in runs:
        groups.setdefault((run['seed'], run['scenario']), []).append(run)
    for key, variants in groups.items():
        reference = variants[0]
        for other in variants[1:]:
            for day, compared in zip(reference['history'], other['history']):
                for field in ('prices', 'macro'):
                    require(day[field] == compared[field], f'{key}/CRN/{field}/{day["day"]}')
                near(day['anchorNav'], compared['anchorNav'], f'{key}/CRN/anchor/{day["day"]}')
                near(day['benchmarkNav'], compared['benchmarkNav'], f'{key}/CRN/benchmark/{day["day"]}')
    require(source_hash == hashlib.sha256((ROOT / 'simulation.js').read_bytes()).hexdigest(), 'Simulation source unchanged during independent verification')
    print(json.dumps({
        'status': 'PASS', 'checks': checks, 'campaigns': len(runs),
        'dailyObservations': sum(len(run['history']) - 1 for run in runs),
        'sourceSha256': source_hash, 'decimalPrecision': getcontext().prec,
        'amountTolerance': str(AMOUNT_TOLERANCE), 'ratioTolerance': str(RATIO_TOLERANCE),
        'coverage': ['piecewise-affine trading fee solution', 'self-financing cash', 'daily NAV', 'buy-and-hold anchor', 'daily equal-weight benchmark', 'five-sector and four-factor attribution and exposure', 'cross-round cost reconciliation', 'initial-inclusive daily drawdown', 'sample daily volatility and variable-risk-free Sharpe', 'common random numbers across allocations', 'per-round no-trade counterfactual'],
        'boundary': 'Independent accounting verification of synthetic outputs, not empirical economic calibration or investment efficacy.'
    }, indent=2))


if __name__ == '__main__':
    main()
