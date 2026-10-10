"""Compose the 시결 logo (static/logo/sigyeol-logo.svg) from Noto Serif KR outlines,
calibrated by overlay on the original hand-made logo.

Not part of the site build; run by hand only when the logo changes.
  1. Font (SIL OFL 1.1): https://github.com/google/fonts/tree/main/ofl/notoserifkr
     NotoSerifKR[wght].ttf, instanced at wght 500 (the weight the logo used as text):
       python3 -c "from fontTools.ttLib import TTFont; from fontTools.varLib.instancer import instantiateVariableFont as i; i(TTFont('NotoSerifKR[wght].ttf'),{'wght':500}).save('NotoSerifKR-500.ttf')"
  2. python3 scripts/logo/compose-logo.py '{}' static/logo/sigyeol-logo.svg   (run next to NotoSerifKR-500.ttf)
  3. Paste the path into index.html (.site-logo) and update the viewBox / width / height there.

Calibration (original 138x170 px crop; 결 fitted at k = 0.099 px per font unit, X = 51 + k*x, Y = 156 - k*y):
  ㅅ box x 2..58, y 23..76  → 시 scale 1.01 x 결 (ㅅ box size), ㅅ centre at (-212, 1076) in 결 units
  시's ㅣ stem centre x 76 px → 252.5 u; its bottom sits `gap` above 결's ㄱ (orig: 4 px)
  결's ㅣ top y 55 px → 1020 u (Noto: 854)
All values below are in 결 font units (1000/em), y-up; the SVG is written y-down."""
import json,sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
P=dict(
  si_scale=1.01,          # 시 : 결 size ratio (measured on the original)
  si_stem_x=252.5,        # centre of 시's ㅣ stem
  gap=40,                 # 시ㅣ bottom above 결's ㄱ top
  si_i_raise=0,           # extra length on top of 시's ㅣ (시 units); Noto's ㅣ already reaches past the crop top
  s_cx=-222,              # ㅅ centre (x)   (box centre -212 u, nudged by overlay)
  s_cy_above_gap=1060,    # ㅅ centre (y)   (box centre 1076 u, nudged by overlay); moves with 시 via `lift`
  gy_i_top=1020.2,        # top of 결's ㅣ
)
P.update(json.loads(sys.argv[1]) if len(sys.argv)>1 and sys.argv[1] else {})
F=TTFont('NotoSerifKR-500.ttf');GS=F.getGlyphSet();CM=F.getBestCmap()
def contours(ch):
    rp=RecordingPen();GS[CM[ord(ch)]].draw(rp);out=[];cur=[]
    for op,a in rp.value:
        cur.append((op,a))
        if op in('closePath','endPath'):out.append(cur);cur=[]
    return out
def tf(con,a,dx,dy,ycut=None,raise_=0):
    out=[]
    for op,args in con:
        pts=[]
        for x,y in args:
            if ycut is not None and y>ycut: y+=raise_
            pts.append((a*x+dx,a*y+dy))
        out.append((op,tuple(pts)))
    return out
def bounds(cons):
    bp=BoundsPen(GS)
    for c in cons:
        for op,a in c: getattr(bp,op)(*a)
    return bp.bounds
si=contours('시');gy=contours('결')
G_TOP=bounds([gy[9]])[3]                         # top of 결's ㄱ
gy_i=tf(gy[0],1,0,0,600,P['gy_i_top']-854.24)     # stretch 결's ㅣ stem up
s=P['si_scale']
stem_c=(729+812)/2                               # 시's ㅣ stem centre (Noto units)
dx_i=P['si_stem_x']-s*stem_c
dy_i=(G_TOP+P['gap'])-s*bounds([si[0]])[1]       # ㅣ bottom = ㄱ top + gap
si_i=tf(si[0],s,dx_i,dy_i,400,P['si_i_raise'])
lift=dy_i-((156-80.5)/0.099+108.44*s)            # how much 시 moved vs the measured ㅣ bottom
sb=bounds(si[1:]);scx=(sb[0]+sb[2])/2;scy=(sb[1]+sb[3])/2
si_s=[tf(c,s,P['s_cx']-s*scx,P['s_cy_above_gap']+lift-s*scy) for c in si[1:]]
parts=[gy_i]+gy[1:]+[si_i]+si_s
x0,y0,x1,y1=bounds(parts);W,H=x1-x0,y1-y0
sp=SVGPathPen(GS,ntos=lambda v:('%.1f'%v).rstrip('0').rstrip('.'))
t=TransformPen(sp,(1,0,0,-1,-x0,y1))
for c in parts:
    for op,a in c: getattr(t,op)(*a)
d=sp.getCommands()
svg=f'<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="시결" viewBox="0 0 {W:.1f} {H:.1f}"><path fill="#2f6b4f" d="{d}"/></svg>'
out=sys.argv[2] if len(sys.argv)>2 else 'logo.svg';open(out,'w').write(svg)
gb=bounds([gy_i]+gy[1:])
meta=dict(W=round(W,1),H=round(H,1),x0=x0,y1=y1,gy_left_svg=gb[0]-x0,gy_bottom_svg=y1-gb[1],lift=round(lift,1),P=P)
json.dump(meta,open(out+'.json','w'));print(json.dumps(meta))
