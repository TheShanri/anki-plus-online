(function(){
var base='/classic';
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){}return null}
var isLogin=document.body.getAttribute('data-login')==='1';
var nav=[['home','Home Page'],['study','Study!!'],['atlas','Atlas'],['phrenology','Phrenology'],['links','Cool Brain Links (1996)'],['guestbook','Guestbook'],['download','Download our App!']];
var NAV=nav.map(function(n,i){return '<a class="btn" href="'+base+'/'+n[0]+'" style="text-decoration:none">'+n[1]+(i==1?' <span class="blink">NEW!</span>':'')+'</a>'}).join(' ');
var c=document.getElementById('content');
var n=(+ls('cl_hits')||41)+1;ls('cl_hits',n);var hits=('000000'+n).slice(-6);
var head='<div class="logo"><span>ANKI+ ONLINE 2000!!!</span></div>'+
'<div class="uc"><b>&#9888; UNDER CONSTRUCTION &#9888;</b></div>'+
'<div class="ring">&lt;&lt; <a href="'+base+'/uc">Prev</a> | <a href="'+base+'/uc">The Brain Webring</a> | <a href="'+base+'/uc">Random Lobe</a> | <a href="'+base+'/uc">Next</a> &gt;&gt;</div>';
var foot='<hr class="rb"><div class="foot cs"><img alt="[email icon]" width="32" height="32" src="data:image/png;base64,AAAA" style="vertical-align:middle"> <a href="mailto:">E-mail me!!</a> (goes nowhere)<br>'+
'You are visitor #'+hits+'<br>Best viewed in Netscape Navigator 4.0 at 800x600<br>'+
'<a href="'+base+'/guestbook">Sign my Guestbook!</a><br><small><a id="c97" href="#" style="color:#555;text-decoration:none">&copy; 1997</a> ANKI+ Online. All rights reserved.</small></div>';
var inner=(isLogin?'':'<div class="nav" style="padding:6px;text-align:center">'+NAV+'</div><hr class="rb">')+c.innerHTML;
c.innerHTML='<div class="wrap">'+head+inner+foot+'</div><div id="clippy"></div><div id="jk"><span>Just kidding.</span></div>';
var busy=false;
function reveal(e){if(e)e.preventDefault();if(busy)return;busy=true;
var j=document.getElementById('jk');document.body.classList.add('glitch');
setTimeout(function(){j.classList.add('on')},500);
setTimeout(function(){document.body.classList.remove('glitch');j.classList.add('t')},800);
setTimeout(function(){j.classList.add('fade')},1900);
setTimeout(function(){location.href='/'},2700)}
document.getElementById('c97').addEventListener('click',reveal);
document.addEventListener('keydown',function(e){if(e.ctrlKey&&e.shiftKey&&e.key==='Enter')reveal(e)});
var cl=document.getElementById('clippy');
cl.innerHTML='<div class="bub">It looks like you&#39;re trying to study the brain!<br>Would you like help?<button data-a="1">Get help with studying the brain</button><button data-a="2">Just study the brain without help</button><button data-a="3">Don&#39;t show me this tip again</button></div>'+
'<svg width="60" height="80" viewBox="0 0 60 80"><path d="M30 6C12 6 12 30 24 36 8 44 14 74 32 74S54 44 38 36C50 30 48 6 30 6Z" fill="none" stroke="#777" stroke-width="5"/><ellipse cx="25" cy="30" rx="6" ry="8" fill="#fff" stroke="#000"/><ellipse cx="38" cy="30" rx="6" ry="8" fill="#fff" stroke="#000"/><circle cx="26" cy="32" r="2"/><circle cx="39" cy="32" r="2"/><path d="M17 20Q24 14 30 20" stroke="#000" fill="none"/></svg>';
function say(t){cl.querySelector('.bub').innerHTML=t+'<button data-a="x">OK</button>'}
cl.addEventListener('click',function(e){var a=e.target.getAttribute&&e.target.getAttribute('data-a');if(!a)return;
if(a==='1')say('Great! I see you are studying a brain. Have you tried turning it off and on again?');
else if(a==='2')say('Studying without help is not supported in this version. Please buy ANKI+ ONLINE 2001.');
else if(a==='3'){say('Okay! I will show you this tip again in 20 seconds.');setTimeout(function(){cl.style.display='block'},20000);cl.style.display='none'}
else cl.style.display='none'});
if(!isLogin)setTimeout(function(){cl.style.display='block'},6000);
window.cl_ie=function(){try{if(sessionStorage.getItem('cl_ie'))return;sessionStorage.setItem('cl_ie','1')}catch(e){}
setTimeout(function(){alert('Please upgrade to Internet Explorer 4 for the best experience.')},1500)};
window.cl_music=function(btn){var A=window.AudioContext||window.webkitAudioContext;if(!A)return;
if(window.cl_ac){window.cl_ac.close();window.cl_ac=null;clearInterval(window.cl_iv);btn.textContent='Play background MIDI';return}
var ac=new A();window.cl_ac=ac;btn.textContent='Stop MIDI (please)';
var notes=[261.6,329.6,392,523.3,392,329.6,293.7,349.2,440,587.3,440,349.2],i=0;
window.cl_iv=setInterval(function(){var o=ac.createOscillator(),g=ac.createGain();o.type='square';o.frequency.value=notes[i++%notes.length];
g.gain.setValueAtTime(.05,ac.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.22);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+.24)},240)};
window.cl_ls=ls;
})();
