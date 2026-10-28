from pathlib import Path
import hashlib
import json
import statistics

P = Path(__file__).resolve().parent
SOURCE = P.parents[3] / 'docs/week2/wireframes/prototype-fixture.json'
F = json.loads(SOURCE.read_text(encoding='utf-8'))
STRATEGIES = {
    'guardian': dict(name='Guardian', style='Conservative', cn='守住缓冲，稳步参与', accent='#9ec7b3', icon='shield', weights=[.1,.1,.15,.15,.1,.4], shift=.03, cap=.1, keyword='Cash buffer'),
    'navigator': dict(name='Navigator', style='Balanced', cn='兼顾参与和风险预算', accent='#a8bedb', icon='compass', weights=[.2,.2,.15,.15,.15,.15], shift=.05, cap=.2, keyword='Balance'),
    'challenger': dict(name='Challenger', style='Aggressive', cn='承担波动，探索增长', accent='#e7bc88', icon='arrow', weights=[.25,.15,.1,.1,.3,.1], shift=.07, cap=.4, keyword='Growth exposure'),
}
DECISIONS = {
    'boost': dict(name='增加 AI 暴露', en='Lean into growth', reason='用一部分 Cash 换取 AI 参与度', risk='Higher'),
    'hold': dict(name='保持当前配置', en='Stay the course', reason='不交易，保留当前实际持仓', risk='Unchanged'),
    'buffer': dict(name='增加 Cash 缓冲', en='Build a buffer', reason='减少 AI 暴露，增加缓冲空间', risk='Lower'),
}
CLUES = [dict(title='增长与估值之间', text='AI 需求正在扩张，但估值和波动压力也在上升。参与增长，还是留出缓冲？', tag='DEMAND / VALUATION'),
         dict(title='当风险偏好降温', text='利率压力正在抬头，科技主题可能更易波动。增长故事仍在，你会怎样管理暴露？', tag='RATES / VOLATILITY')]
NODES = {}


def reward(strategy, action, weights, ret):
    disciplined = not (action == 'boost' and weights[4] > strategy['cap'] + 1e-10)
    label = {'boost':'Opportunity Seeker','hold':'Disciplined','buffer':'Risk-aware'}[action] if disciplined else 'Pause & Reflect'
    reason = ('增加缓冲，回应线索中的波动风险。' if action == 'buffer' else '保留持仓，避免被短期线索驱动频繁交易。' if action == 'hold' else '增加暴露，同时守住本策略的 AI 参考上限。') if disciplined else '加仓后超过本策略的 AI 参考上限；正收益也不抵消这个取舍。'
    return dict(quality='recognized' if disciplined else 'reflect',badge=label,reason=reason,
                result_note='本轮收益为正；收益只是次要反馈。' if ret >= 0 else '本轮亏损；风险意识仍值得认可。' if disciplined else '本轮亏损；下次可先对照风险预算。')


def settle(key, actions, weights, nav, ledger, action):
    strategy=STRATEGIES[key]; i=len(actions); r=F['rounds'][i]
    w=weights.copy(); amount=min(strategy['shift'],w[5] if action=='boost' else w[4]) if action!='hold' else 0
    w[4]+=amount if action=='boost' else -amount; w[5]-=amount if action=='boost' else -amount
    ret=sum(a*b for a,b in zip(w,r['sector_returns'])); after=nav*(1+ret)
    drift=[a*(1+b)/(1+ret) for a,b in zip(w,r['sector_returns'])]
    contributions=[sum(w[j]*r['exposures'][j][k]*r['factor_returns'][k] for j in range(5)) for k in range(4)]
    contributions += [sum(w[:5])*r['market_return'],sum(w[j]*r['event_returns'][j] for j in range(5)),sum(w[j]*r['residual_returns'][j] for j in range(5)),w[5]*r['sector_returns'][5]]
    cumulative=[(ledger[-1]['cumulative_contributions'][k] if ledger else 0)+nav/100000*v for k,v in enumerate(contributions)]
    returns=[a['return_value'] for a in ledger]+[ret]; curve=[100000]+[a['after'] for a in ledger]+[after]
    peak=curve[0]; dd=0
    for value in curve: peak=max(peak,value); dd=max(dd,1-value/peak)
    vol=statistics.stdev(returns) if len(returns)>1 else None
    benchmark=(ledger[-1]['benchmark_nav'] if ledger else 100000)*(1+r['benchmark_return'])
    hold_return=sum(a*b for a,b in zip(weights,r['sector_returns']))
    record=dict(round=i+1,decision=action,weights=w,before=nav,after=after,return_value=ret,drift=drift,
                cash_after=after*drift[5],benchmark_nav=benchmark,contributions=contributions,cumulative_contributions=cumulative,
                maximum_drawdown=dd,volatility=vol,sharpe=(statistics.mean(returns)-.001)/vol if vol and vol>1e-12 else None,
                event=r['event'],effect_vs_hold=ret-hold_return,reward=reward(strategy,action,w,ret),
                next=key+':'+'.'.join(actions+[action]))
    return record


def visit(key, actions, weights, nav, ledger):
    strategy=STRATEGIES[key]; i=len(actions); id=key+':'+'.'.join(actions)
    node=dict(id=id,strategy=key,round=i+1,weights=weights,nav=nav,ledger=ledger,options={})
    NODES[id]=node
    if i==2:
        recognized=sum(r['reward']['quality']=='recognized' for r in ledger)
        if recognized<2: title='Reflective Explorer'
        elif actions==['hold','hold']: title='Disciplined '+strategy['name']
        elif actions[0]!=actions[1]: title='Adaptive Strategist'
        elif actions==['buffer','buffer']: title='Risk-aware '+strategy['name']
        else: title='Bold '+strategy['name']
        node['profile']=dict(title=title,explanation=f'两轮中 {recognized}/2 次动作符合可见风险准则；'+('你调整了行动方式。' if actions[0]!=actions[1] else '你保持了行动风格。')+('本局盈利，仍需关注风险。' if nav>=100000 else '本局亏损，不等于每次决策都失当。'))
        return
    r=F['rounds'][i]
    for action in DECISIONS:
        record=settle(key, actions, weights, nav, ledger, action)
        node['options'][action]=record
        visit(key,actions+[action],record['drift'],record['after'],ledger+[record])


if __name__ == '__main__':
    for key,strategy in STRATEGIES.items(): visit(key,[],strategy['weights'],100000,[])
    data=dict(version='week3-playable-v1',synthetic=True,source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              strategies=STRATEGIES,decisions=DECISIONS,clues=CLUES,sectors=F['sectors'],contribution_labels=F['contribution_labels'],nodes=NODES)
    encoded=json.dumps(data,ensure_ascii=False,separators=(',',':'))
    (P/'data.json').write_text(encoded+'\n',encoding='utf-8')
    (P/'data.js').write_text('window.FACTORLAB_DATA = '+encoded+';\n',encoding='utf-8')
    print('Built 39 nodes, 36 settlements, 27 complete paths')
