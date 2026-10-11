'use strict';
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
class XMLParser {
  parseFromString(text){
    const py=`import sys,json,xml.etree.ElementTree as E
def dump(e):
 return {'name':e.tag,'attrs':e.attrib,'text':''.join(e.itertext()),'children':[dump(c) for c in e]}
try: print(json.dumps(dump(E.fromstring(sys.stdin.read()))))
except E.ParseError: print(json.dumps({'name':'parsererror','attrs':{},'text':'invalid','children':[]}))`;
    const p=spawnSync('python',['-c',py],{input:text,encoding:'utf8'});assert.equal(p.status,0);
    function make(n,parent=null){const el={localName:n.name,textContent:n.text,children:[],parentElement:parent,getAttribute:k=>n.attrs[k]??null,getElementsByTagName(name){return this.children.flatMap(c=>[...(c.localName===name?[c]:[]),...c.getElementsByTagName(name)]);}};el.children=n.children.map(c=>make(c,el));return el;}
    const root=make(JSON.parse(p.stdout));return {documentElement:root,getElementsByTagName:n=>[...(root.localName===n?[root]:[]),...root.getElementsByTagName(n)]};
  }
}

module.exports=XMLParser;
