// Small, scroll-built illustrations: the coin turns effort into a useful record.
const receipt=(x,y,angle=0)=>`<g transform="translate(${x} ${y}) rotate(${angle})"><path class="lp-value-paper" d="M-23-32H23V32L15 27 7 32 0 27-8 32-16 27-23 32Z"/><path class="lp-value-line" d="M-12-17H12M-12-7H6M-12 3H12"/><path class="lp-value-check" pathLength="1" d="m-8 16 6 6 12-13"/></g>`;
const person=(x,y)=>`<g transform="translate(${x} ${y})"><circle class="lp-value-paper" cy="-9" r="10"/><path class="lp-value-paper" d="M-18 22V15a18 18 0 0 1 36 0v7Z"/></g>`;
const art={
 platform:`<path class="lp-value-route" pathLength="1" d="M43 73Q120 0 197 73M197 73Q245 140 166 191M166 191Q50 225 43 73"/>${receipt(43,73,-14)}${person(197,73)}<g transform="translate(166 181)"><rect class="lp-value-paper" x="-30" y="-22" width="60" height="45" rx="9"/><path class="lp-value-chart" pathLength="1" d="m-20 12 14-13 13 4 15-17"/></g>`,
 payment:`<g transform="translate(-156 -156) scale(2.3)">${receipt(120,120,-9)}</g>`,
 people:`<path class="lp-value-route" pathLength="1" d="M42 77 120 120 199 77M120 120 65 183M120 120 182 183"/>${person(42,72)}${person(199,72)}${person(65,182)}${person(182,182)}`,
 records:`${receipt(65,109,-18)}${receipt(175,109,18)}`,
 team:`<path class="lp-value-route" pathLength="1" d="M40 120Q120 10 200 120Q120 230 40 120"/>${person(40,120)}${person(200,120)}`,
 insights:`<path class="lp-value-line" d="M32 182H210"/><g class="lp-value-columns"><rect x="40" y="137" width="30" height="45" rx="5"/><rect x="103" y="97" width="30" height="85" rx="5"/><rect x="166" y="46" width="30" height="136" rx="5"/></g><path class="lp-value-chart" pathLength="1" d="m38 115 64-39 40 8 52-61"/>`,
 access:`<path class="lp-value-route" pathLength="1" d="M30 173 120 40 210 173Z"/><path class="lp-value-paper" d="M54 173v-54l66-48 66 48v54Z"/><path class="lp-value-line" d="M120 71V40M54 173H186M85 173v-43h70v43"/><path class="lp-value-check" pathLength="1" d="m98 110 15 15 31-34"/>`,
 finish:`<circle class="lp-value-paper" cx="120" cy="120" r="85"/><path class="lp-value-check" pathLength="1" d="m79 121 28 29 56-65"/>`
};

export function updateCoinScenes(page,points,scroll,height){
 for(const point of points){
  const anchor=page.querySelector('[data-coin-anchor="'+point.name+'"]');
  if(!anchor||!art[point.name])continue;
  if(!anchor.querySelector('.lp-value-scene')){
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 240 240');svg.setAttribute('aria-hidden','true');svg.classList.add('lp-value-scene');svg.innerHTML=art[point.name];anchor.append(svg);
  }
  const reveal=Math.max(0,Math.min(1,1+(scroll-point.scroll)/(height*.38)));
  anchor.style.setProperty('--value-built',reveal.toFixed(3));
  anchor.style.setProperty('--value-unbuilt',(1-reveal).toFixed(3));
 }
}

export function clearCoinScenes(page){
 page.querySelectorAll('.lp-value-scene').forEach(el=>el.remove());
 page.querySelectorAll('[data-coin-anchor]').forEach(el=>{el.style.removeProperty('--value-built');el.style.removeProperty('--value-unbuilt');});
}
