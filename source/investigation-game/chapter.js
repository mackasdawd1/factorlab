(function(root) {
  'use strict';
  const Base=typeof module!=='undefined'?require('../card-game/engine.js'):root.FACTORLAB_CARDS;
  const VERSION='investigation-v1';
  const SECTORS=['半导体','机器人与工业自动化','先进材料','清洁能源装备','AI 与数字基础设施','Cash'];
  const INITIAL=[.2,.2,.15,.15,.15,.15];
  const CHOICES={hold:'维持配置',increase:'增加 5 个百分点',decrease:'减少 5 个百分点'};
  const REASONS={demand:'需求正在改善',valuation:'价格已反映部分增长',policy:'关注政策的长期作用',uncertain:'证据仍不充分',anchor:'维持长期配置计划'};
  const EVIDENCE=[
    {id:'E1',kind:'需求线索',title:'订单回来了，利润呢？',finding:'模拟行业的新增订单连续两个月改善，下游客户开始补充库存。',limit:'订单不等于确认收入；还要观察交付、库存消化和利润率。',question:'需求改善会持续，还是一次补库存？',source:'作者编写的合成需求简报',availableAt:'模拟月 0',signal:'经营改善',tone:'green'},
    {id:'E2',kind:'价格线索',title:'好消息，可能已在价格里',finding:'模拟半导体篮子的价格在此前六个月上涨 24%，盈利改善尚未得到确认。',limit:'过去上涨不能证明未来还会上涨；行业成长与买入价格需要分开判断。',question:'如果增长兑现得更慢，你能接受等待吗？',source:'作者编写的合成价格路径',availableAt:'模拟月 0',signal:'预期先行',tone:'orange'},
    {id:'E3',kind:'政策线索',title:'长期支持，不是短期保底',finding:'模拟政策鼓励设备与工艺研发，产业能力建设需要时间。',limit:'政策支持不等于下一月盈利增加，也不能消除估值与执行风险。',question:'什么新证据会让你改变长期判断？',source:'作者编写的合成政策情境',availableAt:'模拟月 0',signal:'长期变量',tone:'blue'}
  ];
  const FACTOR_NAMES=['动量','价值','质量','低波动'];
  const EXPOSURES=[[.5,0,.5,-.5],[0,.5,1,0],[-.5,1,0,.5],[-1,-.5,-.5,1],[1,-1,-1,-1]];
  const OUTCOME={sector_returns:[-.05,-.02,-.01,-.03,-.06,.001],benchmark_return:-.034,exposures:EXPOSURES,
    factor_returns:[-.01,.004,.003,.006],market_return:-.02,event_returns:[-.01,0,0,-.01,-.02],
    residual_returns:[-.0135,-.005,-.002,-.012499999999999999,.003000000000000006],event:'利率上行'};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function initial() {
    return {version:VERSION,phase:'investigate',weights:[...INITIAL],choice:'hold',reason:'',note:'',seen:[],commands:[],result:null};
  }
  function preview(s,choice=s.choice) {
    if(!Object.hasOwn(CHOICES,choice))return {ok:false,error:'请选择本章提供的三个行动之一。'};
    const w=[...s.weights], delta=choice==='increase'?.05:choice==='decrease'?-.05:0;
    if(w.length!==6||w.some(v=>!Number.isFinite(v)||v<0)||Math.abs(w.reduce((a,b)=>a+b,0)-1)>1e-10)return {ok:false,error:'持仓数据无效。'};
    if(delta>0&&w[5]+1e-12<delta)return {ok:false,error:'Cash 不足 5%，无法增加该仓位。'};
    if(delta<0&&w[0]+1e-12<-delta)return {ok:false,error:'半导体持仓不足 5%，无法减少该仓位。'};
    w[0]+=delta;w[5]-=delta;
    if(w.slice(0,5).some(v=>v>.4+1e-12))return {ok:false,error:'单个行业不能超过 40% 的教学仓位上限。'};
    return {ok:true,weights:w,delta,riskExposure:1-w[5],cash:w[5],semiconductor:w[0]};
  }
  function reduce(s,a) {
    if(!a||typeof a!=='object')throw Error('无效操作');
    if(s.phase==='review'&&a.type==='lock')return s;
    if(s.phase!=='investigate')throw Error('本章已结算，决定不能再修改');
    const n=clone(s);let command;
    if(a.type==='read') {
      if(!EVIDENCE.some(e=>e.id===a.id))throw Error('未知证据');
      if(s.seen.includes(a.id))return s;
      n.seen.push(a.id);command={type:'read',id:a.id};
    }else if(a.type==='choose') {
      const p=preview(s,a.choice);if(!p.ok)throw Error(p.error);
      n.choice=a.choice;command={type:'choose',choice:a.choice};
    }else if(a.type==='reason') {
      if(!Object.hasOwn(REASONS,a.reason)||typeof a.note!=='string'||a.note.length>280)throw Error('请选一个理由，补充文字最多 280 字');
      n.reason=a.reason;n.note=a.note;command={type:'reason',reason:a.reason,note:a.note};
    }else if(a.type==='lock') {
      if(n.seen.length<1||!n.reason)throw Error('请先查看至少一张证据，并留下你的判断理由');
      const p=preview(s);if(!p.ok)throw Error(p.error);
      const r=Base.settle(p.weights,100000,[],OUTCOME),anchor=Base.settle(INITIAL,100000,[],OUTCOME);
      n.result={...r,anchorAfter:anchor.after,anchorReturn:anchor.return_value,tacticalAmount:r.after-anchor.after,tacticalPP:(r.return_value-anchor.return_value)*100,
        headline:'订单故事仍在，市场先担心资金成本',explanation:'模拟月 1：利率上行，科技行业估值承压。半导体篮子下跌 5%；这并不能单凭一个月就否定长期需求。',synthetic:true};
      n.phase='review';command={type:'lock'};
    }else throw Error('未知操作');
    if(n.commands.length>=1000)throw Error('本章操作记录已满，请导出后重新开始');
    n.commands.push(command);return n;
  }
  function serialize(s) {return {version:VERSION,commands:clone(s.commands)};}
  function restore(raw) {
    const save=typeof raw==='string'?JSON.parse(raw):raw;
    if(!save||save.version!==VERSION||!Array.isArray(save.commands)||save.commands.length>1000)throw Error('存档版本或内容不兼容');
    return save.commands.reduce((s,a)=>reduce(s,a),initial());
  }
  function coachContext(s) {
    const p=preview(s);
    const context={scenario:'合成教学：半导体订单改善与估值预期的矛盾',synthetic:true,phase:s.phase,decisionTime:'模拟月 0',
      evidence:clone(EVIDENCE),seen:[...s.seen],sectors:[...SECTORS],currentWeights:[...s.weights],proposedWeights:p.weights,
      choice:CHOICES[s.choice],playerReason:s.reason?REASONS[s.reason]:null,playerNote:s.note||null,
      factors:{names:FACTOR_NAMES,scores:EXPOSURES.map(row=>row.map(v=>(v+1)*50)),meaning:'合成教学代理分数，不是预期收益'},
      rules:'初始虚拟资产 100000；单行业上限 40%；本章仅半导体与 Cash 转换 5 个百分点；教学零交易成本。'};
    if(s.phase==='review')context.result={id:'RESULT',...clone(s.result)};
    return context;
  }
  function sampleReply(s,question='') {
    let summary,detail,references;
    if(s.phase==='review') {
      summary=`你选择了${CHOICES[s.choice]}，记录的理由是“${REASONS[s.reason]}”。本轮相对维持原配置的差额为 ${s.result.tacticalAmount.toFixed(2)} 虚拟币；单次盈亏不能证明这个理由正确或错误。`;
      detail='可以检查：当时是否同时考虑了订单改善和价格预期？下次再观察订单能否转化为收入，以及盈利变化是否足以支持估值。这里只复述你已填写的理由，不推断未表达的想法。';references=['E1','E2','RESULT'];
    }else if(/反对|风险|估值|贵|跌|亏/.test(question)) {
      summary='最大的反对理由是：价格已先行上涨，盈利改善还没确认。加仓会提高半导体暴露，同时减少 Cash 缓冲；需求改善并不保证短期价格继续上涨。';
      detail='E2 记录了过去六个月的合成价格变化。它描述市场已表现出的预期，不提供下一月预测；可以把 E1 的订单转化和 E2 的估值压力一起考虑。';references=['E1','E2'];
    }else if(/长期|政策|改变/.test(question)) {
      summary='政策支持与订单改善可以构成长线观察理由，但兑现需要时间。短期调整应解释你在承担什么风险，不能把政策支持当作收益保底。';
      detail='E3 指向产业能力建设，E1 指向需求变化；两者都不能告诉我们下一月价格。可以提前写下会改变长期判断的证据，例如订单持续下降或利润率恶化。';references=['E1','E3'];
    }else if(/支持|加仓|订单|需求/.test(question)) {
      summary='支持加仓的线索是订单连续改善，可能意味着需求正在修复。但价格已提前上涨，能否变成利润仍未知；这两条证据需要一起判断。';
      detail='E1 属于经营线索，E2 属于价格与预期线索。增加 5 个百分点会让半导体持仓从 20% 变为 25%，Cash 从 15% 变为 10%；这改变风险承担，不改变市场本身。';references=['E1','E2'];
    }else {
      summary='当前是预写的证据提示，不能像在线 AI 一样回答任意追问。本章可先比较“订单改善”和“价格先行”，再决定是否调整半导体仓位。';
      detail='课程 API 尚未接通或当前网络不可用时，这些提示仍能帮助你完成章节。它们不是实时生成的研究意见；可以使用三个快捷问题查看对应提示。';references=['E1','E2'];
    }
    return {mode:'example',summary,detail,references};
  }
  function fixedReply(){return {mode:'fixed',summary:'先区分长期定位与短期调整，再检查证据支持的范围。',detail:'固定对照提示：行业配置需要同时考虑需求、估值、政策与风险；教学场景不能证明未来收益。这段预写内容不随问题、决定或结果变化。',references:[]};}
  const api={VERSION,SECTORS,CHOICES,REASONS,EVIDENCE,FACTOR_NAMES,initial,preview,reduce,serialize,restore,coachContext,sampleReply,fixedReply};
  if(typeof module!=='undefined')module.exports=api;else root.InvestigationChapter=api;
})(typeof window==='undefined'?globalThis:window);
