(function(root){
 'use strict';
 const cards={
  buy:{name:'试探建仓',cost:1,suite:'attack',amount:.03,mode:'buy',text:'Cash → 板块 +3pp'},
  focus:{name:'集中布局',cost:2,suite:'attack',amount:.06,mode:'buy',text:'+6pp；AI/半导体新增对决贡献 ×1.2'},
  spread:{name:'分散布局',cost:2,suite:'attack',amount:.01,mode:'spread',text:'Cash → 五板块各 +1pp'},
  sell:{name:'留出缓冲',cost:1,suite:'defense',amount:.04,mode:'sell',text:'板块 → Cash 4pp；护盾 +1'},
  reserve:{name:'收回筹码',cost:1,suite:'defense',amount:.03,mode:'reserve',text:'最大板块 → Cash 3pp；护盾 +1'},
  rotate:{name:'板块轮动',cost:2,suite:'attack',amount:.04,mode:'rotate',text:'先选转出，再选转入；转移 4pp'},
  scout:{name:'深入研究',cost:1,suite:'intel',mode:'scout',text:'1 研究点：展开已有历史与历史范围'},
  stop:{name:'止损单',cost:1,suite:'defense',amount:.03,mode:'sell',text:'减持 3pp；盾 +1，所选板块跌再 +1'},
  haven:{name:'避风港',cost:2,suite:'defense',amount:.05,mode:'haven',text:'风险板块等比例减持共 5pp；盾 +1'},
  ballast:{name:'压舱石',cost:0,suite:'defense',mode:'passive',text:'抽到生效：Cash 每 10% +0.15 对决分，上限 +0.6'},
  leverage:{name:'激进加仓',cost:2,suite:'attack',amount:.06,mode:'buy',rare:true,text:'Cash → 板块 +6pp；失守额外承压伤害 10'},
  chase:{name:'追热',cost:1,suite:'attack',amount:.04,mode:'chase',text:'上月最强板块 +4pp；新增对决贡献 ×1.5'},
  insurance:{name:'对决保险',cost:1,suite:'defense',mode:'insurance',rare:true,text:'对决分 −0.2；本轮护盾后承压伤害减半'},
  bet:{name:'事件对赌',cost:2,suite:'intel',mode:'bet',rare:true,text:'猜本轮基准涨跌：对决分 +1.5 / −1.0'},
  report:{name:'机构研报',cost:1,suite:'intel',mode:'report',text:'查看上一已结算月排名；每局限 2 次'},
  trap:{name:'反身陷阱',cost:2,suite:'attack',amount:.05,mode:'buy',rare:true,text:'+5pp；本轮最强/最弱板块对决分 +1 / −1'}
 };
 const classes={
  guardian:{name:'守护者',en:'Guardian',min:.30,max:.70,passive:'每轮护盾 +1',deck:['sell','sell','buy','buy','rotate','stop','haven','ballast','spread','scout']},
  navigator:{name:'领航员',en:'Navigator',min:.40,max:.85,passive:'每轮可弃 1 张非被动牌，换 1 行动力',deck:['buy','buy','sell','sell','rotate','focus','spread','scout','report','reserve']},
  challenger:{name:'挑战者',en:'Challenger',min:.50,max:1,passive:'超额筹码 ×1.3；原始承压伤害 ×1.25',deck:['focus','focus','buy','buy','chase','leverage','rotate','bet','report','scout']}
 };
 const upgrades={energy:{name:'行动余量',price:3000,text:'每轮基础行动力变为 4'},lens:{name:'研究效率',price:2000,text:'深入研究不消耗行动力'},precision:{name:'调仓强化',price:2500,text:'试探/缓冲额度 +1pp'},research:{name:'研究补给',price:2000,text:'立即补充 2 研究点'},search:{name:'牌库检索',price:3000,text:'以后每轮指定抽 1 张'} };
 const markets=[{target:.8,title:'需求扩张',intent:'增长升温 · 估值承压',icon:'↗'},{target:-2,title:'利率上行',intent:'利率抬头 · 科技波动',icon:'≈'},{target:.5,title:'供应链瓶颈',intent:'供需错位 · 板块分化',icon:'⇄'},{target:2.9,title:'技术突破',intent:'创新升温 · 兑现未定',icon:'↗'},{target:1,title:'产业政策',intent:'政策讨论 · 轮动加速',icon:'⇄'},{target:-3,title:'风险偏好骤降',intent:'情绪脆弱 · 同步波动',icon:'!',boss:true}];
 const combos={informed:'研究 + 布局',rotation:'轮动 + 缓冲',diverse:'多点布局',fortress:'铁壁',all:'全都要',conviction:'孤注一掷'};
 const C={cards,classes,upgrades,markets,combos};if(typeof module!=='undefined')module.exports=C;else root.FACTORLAB_DUEL_CATALOG=C;
})(typeof window==='undefined'?globalThis:window);
