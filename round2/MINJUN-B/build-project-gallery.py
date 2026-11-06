from pathlib import Path
import base64, json, re, html
from PIL import Image
root=Path(__file__).parent
projects=json.loads((root/'project-examples.json').read_text(encoding='utf-8-sig'))
source=(root/'index.html').read_text(encoding='utf-8-sig')
articles=[]
for i,p in enumerate(projects,1):
    image_path=root/'images'/f'{p["slug"]}.png'
    with Image.open(image_path) as im:
        im=im.convert('RGB')
        im.thumbnail((1100,800))
        out=root/'images'/f'{p["slug"]}.jpg'
        im.save(out,quality=86,optimize=True)
    uri='data:image/jpeg;base64,'+base64.b64encode(out.read_bytes()).decode()
    esc=html.escape
    details=''.join(f'<dt>{esc(k)}</dt><dd>{esc(v)}</dd>' for k,v in p['details'])
    details+='<dt>결과물 링크</dt><dd class="pending">[준비 필요]</dd>'
    articles.append(f'''<article class="project"><figure class="project-visual"><img src="{uri}" alt="가상 브랜드 {esc(p['brand'])}의 홈페이지 리뉴얼 콘셉트 이미지" width="1100" height="733" loading="lazy" decoding="async"><figcaption>AI 생성 이미지 · 가상 홈페이지 디자인 예시</figcaption></figure><div class="project-content"><p class="project-label">PROJECT {i:02d} / {esc(p['category'])} · 가상 프로젝트</p><h3>{esc(p['title'])}</h3><p class="project-brand">{esc(p['brand'])}</p><p class="description">{esc(p['description'])}</p><dl class="details">{details}</dl></div></article>''')
section='''<section class="projects" id="projects" aria-labelledby="projects-title"><div class="wrap"><div class="section-top"><div><p class="section-label">01 / SELECTED PROJECTS</p><h2 id="projects-title">함께한 프로젝트</h2></div><span class="count">05 프로젝트</span></div><p class="fiction-note">아래 5개 프로젝트는 모두 학습용 가상 사례입니다. 이미지와 리뉴얼 제안은 콘셉트 예시이며, 실제 고객사 작업이나 측정된 성과가 아닙니다.</p><div class="project-list">'''+''.join(articles)+'''</div><div class="project-bottom"><span>INSIGHT LAB — PROJECT ARCHIVE</span><span>가상 브랜드 5개 · 홈페이지 리뉴얼 기획 사례</span></div></div></section>'''
source=re.sub(r'<section class="projects"[\s\S]*?</section>',lambda m:section,source,count=1)
css='''
/* 프로젝트 갤러리: 대표 프로젝트 + 네 개의 추가 사례 */
.project-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.project-list .project{display:flex;flex-direction:column;min-width:0}.project-list .project:first-child{grid-column:1/-1;display:grid;grid-template-columns:1.05fr 1fr}.project-visual{margin:0;background:var(--soft);display:flex;flex-direction:column;justify-content:center;padding:22px;gap:12px;min-width:0}.project-visual img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:contain;border-radius:4px}.project-visual figcaption{font-size:10px;color:var(--muted);text-align:center}.project-list .project-content{padding:30px}.project-list .project:first-child .project-content{padding:38px}.project-brand{font-size:13px;color:var(--blue);font-weight:600;margin:-12px 0 18px}.fiction-note{font-size:13px;color:var(--muted);max-width:760px;margin:-14px 0 30px;line-height:1.85}.project-list h3{font-size:25px}.project-list .details{grid-template-columns:76px minmax(0,1fr)}
@media(max-width:900px){.project-list{gap:20px}.project-list .project-content,.project-list .project:first-child .project-content{padding:25px}.project-list h3{font-size:23px}.project-visual{padding:16px}.project-list .details{grid-template-columns:1fr;gap:4px}.project-list .details dd{margin-bottom:12px}}
@media(max-width:640px){.project-list{grid-template-columns:1fr;gap:26px}.project-list .project:first-child{display:flex;grid-column:auto}.project-list .project-content,.project-list .project:first-child .project-content{padding:26px 22px}.project-visual{padding:16px}.project-list .details{grid-template-columns:76px minmax(0,1fr);gap:12px}.project-list .details dd{margin-bottom:0}.fiction-note{font-size:12px;margin-top:-8px}.count{white-space:nowrap}}
'''
source=source.replace('</style>',css+'</style>')
(root/'index.html').write_text(source,encoding='utf-8')
print('Embedded images and project cards:',len(articles))
print('HTML size:',(root/'index.html').stat().st_size)
