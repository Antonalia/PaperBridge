// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = name => fs.readFileSync(new URL('../plugin/content/'+name,import.meta.url),'utf8');
const prefs = new Map();
const prefix='extensions.zotero.codexPdfBridge.';
const context = vm.createContext({Zotero:{Prefs:{get:key=>prefs.get(key),set:(key,value)=>prefs.set(key,value)}}});
vm.runInContext(source('i18n.js'),context);
const i18n=context.PaperBridgeI18n;
assert.equal(i18n.language(),'zh'); assert.equal(i18n.t('保存规则'),'保存规则');
prefs.set(prefix+'language','en'); assert.equal(i18n.t('保存规则'),'Save rules');
// Coverage of actual static XML and dynamic UI literals, excluding language names and user-authored rules.
const xml=source('preferences.xhtml');
const literals=[...xml.matchAll(/(?:label|value|placeholder|aria-label)="([^"]+)"/g),...xml.matchAll(/>([^<>]+)</g)].map(x=>x[1].trim()).filter(x=>/[\u4e00-\u9fff]/.test(x) && x!=='简体中文');
for(const text of literals) assert.ok(i18n.strings[text], 'Missing static translation: '+text);
for(const name of ['preferences.js','installer.js']) for(const match of source(name).matchAll(/(?:this\.)?t\(("(?:[^"\\]|\\.)*")\)/g)) {
    const text=JSON.parse(match[1]);
    if(/[\u4e00-\u9fff]/.test(text)) assert.ok(i18n.strings[text], 'Missing dynamic translation: '+text);
}
class Node {
    constructor(name, text='') {this.nodeType=name==='#text'?3:1;this.localName=name;this.nodeValue=text;this.childNodes=[];this.attributes={};this.style={};this.events={};this.textContent='';}
    get children(){return this.childNodes.filter(x=>x.nodeType===1);}
    hasAttribute(key){return key in this.attributes;} getAttribute(key){return this.attributes[key];} setAttribute(key,value){this.attributes[key]=value;}
    appendChild(child){child.parentNode=this;this.childNodes.push(child);return child;}
    replaceChildren(){this.childNodes=[];} addEventListener(name,fn){this.events[name]=fn;} focus(){} closest(){return null;}
}
const root=new Node('vbox'), paragraph=root.appendChild(new Node('p'));const text=paragraph.appendChild(new Node('#text',' 标注规则 '));
i18n.apply(root);assert.equal(text.nodeValue,' Annotation rules ');prefs.set(prefix+'language','zh');i18n.apply(root);assert.equal(text.nodeValue,' 标注规则 ');
const nodes=new Map();
for(const match of xml.matchAll(/id="([^"]+)"/g)){const node=new Node('control');node.id=match[1];nodes.set(node.id,node);}
nodes.set('codex-bridge-pane',root);
const events={};context.document={getElementById:id=>nodes.get(id),createElementNS:(_,name)=>new Node(name),addEventListener:(name,fn)=>events[name]=fn};
context.Zotero.PaperBridgeI18n=i18n;
prefs.set(prefix+'annotationRules','用户编写的规则');prefs.set(prefix+'configuredVersion','1.0.3');
vm.runInContext(source('preferences.js'),context);
let card=nodes.get('codex-bridge-ruleCards').children[0];let input=card.children[1];input.value='未保存的个人修改';input.events.input();
const menu=nodes.get('codex-bridge-language');menu.value='en';await events.command({target:menu});
card=nodes.get('codex-bridge-ruleCards').children[0];assert.equal(card.children[1].value,'未保存的个人修改');
assert.equal(nodes.get('codex-bridge-defaultColor-swatch').getAttribute('aria-label'),'Yellow');
assert.match(nodes.get('codex-bridge-setup-status').textContent,/Configured version/);
assert.equal(prefs.get(prefix+'annotationRules'),'用户编写的规则');
await events.command({target:nodes.get('codex-bridge-resetRules')});
card=nodes.get('codex-bridge-ruleCards').children[0];assert.match(card.children[1].value,/Select complete sentences/);
menu.value='zh';await events.command({target:menu});assert.equal(nodes.get('codex-bridge-defaultColor-swatch').getAttribute('aria-label'),'黄色');
assert.equal(prefs.get(prefix+'annotationRules'),'用户编写的规则');
console.log('PASS bilingual coverage, Chinese default, reversible static switching, preserved unsaved rule drafts, localized colors/status and English default-rule previews');
