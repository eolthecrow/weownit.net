/* DOM interaction adapter for workflow tests. No rendering or browser claims. */
const decode=s=>String(s).replace(/&(amp|lt|gt|quot|#39);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]));
function matches(el,selector){
 if(selector.includes(','))return selector.split(',').some(s=>matches(el,s.trim()));
 const parts=selector.trim().split(/\s+(?![^\[]*\])/);if(parts.length>1){if(!matches(el,parts.pop()))return false;let n=el.parentElement;while(parts.length){const s=parts.pop();while(n&&!matches(n,s))n=n.parentElement;if(!n)return false;n=n.parentElement;}return true;}
 let s=selector,checked=false;if(s.endsWith(':checked')){checked=true;s=s.slice(0,-8);}if(checked&&!el.checked)return false;
 const attrs=[...s.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/g)];s=s.replace(/\[[^\]]+\]/g,'');for(const [,k,v]of attrs){if(!(k in el.attrs)||v!==undefined&&el.attrs[k]!==v)return false;}
 const id=s.match(/#([\w-]+)/);if(id&&el.id!==id[1])return false;const classes=[...s.matchAll(/\.([\w-]+)/g)];if(classes.some(m=>!el.className.split(' ').includes(m[1])))return false;
 const tag=s.match(/^[\w-]+/);return !tag||el.tagName.toLowerCase()===tag[0].toLowerCase();
}
class Element{
 constructor(tag,attrs={},document=null){this.tagName=tag.toUpperCase();this.attrs={...attrs};this.ownerDocument=document;this.children=[];this.parentElement=null;this.handlers={};this._text='';this.value=attrs.value||'';this.hidden='hidden' in attrs;this.disabled='disabled' in attrs;this.checked='checked' in attrs;this.files=[];this.src=attrs.src||'';this.href=attrs.href||'';this.className=attrs.class||'';}
 get id(){return this.attrs.id||'';}get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=String(v);}getAttribute(k){return this.attrs[k]??null;}
 hasAttribute(k){return k in this.attrs;}
 get classList(){const el=this;return {contains:k=>el.className.split(' ').includes(k),add(k){this.toggle(k,true)},remove(k){this.toggle(k,false)},toggle(k,v){const set=new Set(el.className.split(' ').filter(Boolean));if(v??!set.has(k))set.add(k);else set.delete(k);el.setAttribute('class',[...set].join(' '));}};}
 contains(x){return this===x||this.children.some(c=>c.contains(x));}
 append(...els){els.forEach(el=>{el.parentElement=this;this.children.push(el)});}appendChild(el){this.append(el);return el;}
 dispatchEvent(e){e.target??=this;for(const fn of this.handlers[e.type]||[])fn(e);return true;}
 addEventListener(k,fn){(this.handlers[k]??=[]).push(fn);}removeEventListener(){}
 async dispatch(type){const event={type,target:this,preventDefault(){},key:''};let node=this,waiting=[];while(node){for(const fn of node.handlers[type]||[]){const p=fn(event);if(p?.then)waiting.push(p);}node=node.parentElement;}await Promise.all(waiting);}
 async click(){if(!this.disabled)await this.dispatch('click');}
 focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}scrollIntoView(){}
 closest(s){let n=this;while(n){if(matches(n,s))return n;n=n.parentElement;}return null;}
 querySelectorAll(s){return this.children.flatMap(c=>c instanceof Element?[...(matches(c,s)?[c]:[]),...c.querySelectorAll(s)]:[]);}querySelector(s){return this.querySelectorAll(s)[0]||null;}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}set textContent(v){this._text=String(v);this.children=[];}
 get innerHTML(){return this._html||'';}set innerHTML(v){this._html=String(v);this._text='';this.children=parse(v,this.ownerDocument);this.children.forEach(c=>c.parentElement=this);}
}
function parse(html,document){const root=new Element('fragment',{},document),stack=[root],voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
 const tokens=String(html).match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g)||[];
 for(const token of tokens){if(token.startsWith('<!'))continue;if(token.startsWith('</')){const tag=token.match(/^<\/([^\s>]+)/)[1].toLowerCase();let index=stack.findLastIndex(n=>n.tagName.toLowerCase()===tag);if(index>0){const n=stack[index];if(tag==='textarea')n.value=n.textContent;if(tag==='select')n.value=(n.children.find(c=>'selected'in c.attrs)||n.children[0])?.value||'';stack.length=index;}continue;}
 if(token.startsWith('<')){const m=token.match(/^<([^\s/>]+)([\s\S]*?)\/?\s*>$/);if(!m)continue;const attrs={};for(const a of m[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[a[1]]=decode(a[2]??a[3]??a[4]??'');const el=new Element(m[1],attrs,document);el.parentElement=stack.at(-1);stack.at(-1).children.push(el);if(!voids.has(m[1].toLowerCase())&&!token.endsWith('/>'))stack.push(el);}
 else{const text=new Element('text',{},document);text._text=decode(token);text.parentElement=stack.at(-1);stack.at(-1).children.push(text);}}
 return root.children;
}
class Document extends Element{constructor(html){super('document');this.ownerDocument=this;this.children=parse(html,this);this.children.forEach(c=>c.parentElement=this);this.documentElement=this.querySelector('html');this.activeElement=null;}getElementById(id){return this.querySelector('#'+id);}createElement(tag){return new Element(tag,{},this);}}
module.exports={Document};
