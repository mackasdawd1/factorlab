(function(root){
 let timers=[],context=null,sound=false;
 function tone(kind=0){if(!sound)return;try{context ||= new (window.AudioContext||window.webkitAudioContext)();context.resume().catch(()=>{});const o=context.createOscillator(),g=context.createGain();o.type='sine';o.frequency.value=[220,330,440,550,660][kind%5];g.gain.setValueAtTime(.035,context.currentTime);g.gain.exponentialRampToValueAtTime(.001,context.currentTime+.13);o.connect(g);g.connect(context.destination);o.start();o.stop(context.currentTime+.15);}catch{sound=false;}}
 function stop(){timers.forEach(clearTimeout);timers=[];}
 function play(rows,done){stop();if(matchMedia('(prefers-reduced-motion:reduce)').matches){done();return;}const nodes=[...document.querySelectorAll('[data-stage]')];const duration=Math.min(450,8000/Math.max(1,nodes.length));nodes.forEach((el,i)=>{el.classList.add('pending');timers.push(setTimeout(()=>{el.classList.remove('pending');el.classList.add('stage-pop');tone(i);},duration*i));});timers.push(setTimeout(done,duration*nodes.length));}
 root.DuelStage={play,stop,tone,toggle(){sound=!sound;if(sound)tone(1);return sound;}};
})(window);
