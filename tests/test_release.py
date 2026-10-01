# SPDX-License-Identifier: AGPL-3.0-or-later
"""Synthetic PDF, frozen MCP protocol and temporary-vault release checks."""
from pathlib import Path
import base64, hashlib, json, os, subprocess, sys, tempfile, xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'tools'))
import pymupdf
from obsidian_import import natural_quote, prepare, apply
from extract_pdf import disjoint_rect_union
executable=root/'plugin/runtime/codex-zotero-mcp.exe'
clean_env=dict(os.environ)
clean_env['PATH']=os.pathsep.join([str(Path(os.environ['SystemRoot'])/'System32'),os.environ['SystemRoot']])
manifest=json.loads((root/'plugin/manifest.json').read_text(encoding='utf-8'))
runtime=json.loads((root/'plugin/runtime/manifest.json').read_text(encoding='utf-8'))
version=manifest['version']
assert version==runtime['version']==json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
assert hashlib.sha256(executable.read_bytes()).hexdigest()==runtime['sha256']
ET.parse(root/'plugin/content/preferences.xhtml')
for path in manifest['icons'].values():assert (root/'plugin'/path).is_file()
rects=[[0,0,20,12],[0,10,20,22]]
after=disjoint_rect_union(rects)
for i,a in enumerate(after):
    for b in after[i+1:]:assert not (min(a[2],b[2])>max(a[0],b[0]) and min(a[3],b[3])>max(a[1],b[1]))
assert sum((a[2]-a[0])*(a[3]-a[1]) for a in after)==440
assert natural_quote('One line\ncontinues.\n\nSecond paragraph.')=='One line continues.\n\nSecond paragraph.'
with tempfile.TemporaryDirectory() as folder:
    temp=Path(folder);pdf=temp/'fixture.pdf'
    with pymupdf.open() as document:
        page=document.new_page();page.insert_textbox((60,60,220,160),'One complete sentence wraps across several lines. Another sentence.',fontsize=12)
        document.save(pdf)
    original=pdf.read_bytes()
    def worker(kind,request):
        result=subprocess.run([str(executable),'--worker',kind],input=json.dumps(request).encode(),capture_output=True,timeout=45,env=clean_env)
        assert result.returncode==0,result.stderr.decode(errors='replace')
        value=json.loads(result.stdout);assert 'error' not in value,value
        return value
    extracted=worker('extract',dict(path=str(pdf),start_page=1,end_page=1,query='One complete sentence wraps across several lines.'))
    assert extracted['page_count']==1 and extracted['annotation_geometry']=='compact-font-disjoint-v1'
    passages=extracted['pages'][0]['passages'];assert len(passages)==1 and passages[0]['text'].endswith('lines.')
    assert 'Another' not in passages[0]['text']
    rendered=worker('region',dict(path=str(pdf),page=1))
    assert base64.b64decode(rendered['png_base64']).startswith(b'\x89PNG')
    assert pdf.read_bytes()==original
    requests=[dict(jsonrpc='2.0',id=1,method='initialize',params={'protocolVersion':'2025-06-18'}),dict(jsonrpc='2.0',id=2,method='ping'),dict(jsonrpc='2.0',id=3,method='tools/list')]
    result=subprocess.run([str(executable),'--config',str(temp/'no-config.json')],input=('\n'.join(json.dumps(x) for x in requests)+'\n').encode(),capture_output=True,timeout=45,env=clean_env)
    assert result.returncode==0
    responses=[json.loads(line) for line in result.stdout.splitlines()]
    assert responses[0]['result']['serverInfo']['version']==version
    tool_names={x['name'] for x in responses[2]['result']['tools']}
    assert {'zotero_prepare_annotations','zotero_prepare_obsidian_import','zotero_apply_obsidian_import'}<=tool_names
    vault=temp/'vault';(vault/'.obsidian').mkdir(parents=True)
    snapshot=dict(attachment_id='u-ABCDEFGH',title='Synthetic paper',source_pdf_path=str(pdf),collections=[dict(collection_id='u-12345678',path=['具身智能'])],settings=dict(vault_path=str(vault),top_folder='文献笔记',folder_layout='collections',links={'effective':{'annotation':False,'image':True,'chart':True}}),annotations=[dict(annotation_id='u-23456789',type='highlight',content_kind='annotation',page_label='1',text='One line\ncontinues.',comment='教学批注。',image_path=None)])
    arguments=dict(attachment_id='u-ABCDEFGH',collection_id='u-12345678')
    plan=prepare(snapshot,arguments)['_obsidian_plan']
    assert plan['note_relative_path'].startswith('文献笔记/具身智能/')
    saved=apply(plan,snapshot)
    note=vault/plan['note_relative_path'];assert note.is_file() and 'One line continues.' in note.read_text(encoding='utf-8')
    assert apply(plan,snapshot)['reused']
    for entry in json.loads((root/'third_party/source-manifest.json').read_text(encoding='utf-8')):
        assert hashlib.sha256((root/'third_party/sources'/entry['filename']).read_bytes()).hexdigest()==entry['sha256']
print(json.dumps(dict(version=version,frozen_pdf_extraction=True,complete_sentence_boundary=True,pdf_render=True,pdf_unchanged=True,frozen_mcp_protocol=True,collection_hierarchy=True,natural_quote=True,idempotent_import=True,geometry_union=True,dependency_source_hashes=True)))
