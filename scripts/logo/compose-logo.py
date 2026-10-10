"""Compose the 시결 logo (static/logo/sigyeol-logo.svg) from Noto Serif KR outlines,
calibrated by overlay on the original hand-made logo.

Not part of the site build; run by hand only when the logo changes.
  1. Font (SIL OFL 1.1): https://github.com/google/fonts/tree/main/ofl/notoserifkr
     NotoSerifKR[wght].ttf, instanced at wght 500 (the weight the logo used as text):
       python3 -c "from fontTools.ttLib import TTFont; from fontTools.varLib.instancer import instantiateVariableFont as i; i(TTFont('NotoSerifKR[wght].ttf'),{'wght':500}).save('NotoSerifKR-500.ttf')"
  2. python3 scripts/logo/compose-logo.py '{}' static/logo/sigyeol-logo.svg   (run next to NotoSerifKR-500.ttf)
  3. Paste the path into index.html (.site-logo) and update the viewBox / width / height there.

결 widening (v2): 결 is split into ㄱ (contours 8-10), ㅕ+ㅣ (0, 11-14) and ㄹ (1-7) and widened per component,
so stroke widths are unchanged: ㄱ's tail is pulled left (tapering to its corner), ㅣ/ㅕ shift right, ㄹ's two halves
move apart (its bars lengthen) and its bottom bar runs further right. Amounts were fitted by overlay: 결's IoU with
the original stays ≥ the unwidened glyph's (0.712 vs 0.710); pushing wider or squashing ㄹ lowers it sharply
(the original's ㄹ bars sit at y 128/144/163 px, ours at 128/144/161 — it is not shorter, only longer-barred).
Calibration (original 138x170 px crop; 결 fitted at K px per font unit, X = DX + K*x, Y = DY - K*y):
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
  si_stem_px=76,          # centre of 시's ㅣ stem in the original (px)
  gap=40,                 # 시ㅣ bottom above 결's ㄱ top
  si_i_raise=0,           # extra length on top of 시's ㅣ (시 units); Noto's ㅣ already reaches past the crop top
  s_cx_px=29.0,           # ㅅ centre in the original (px): box x 2..58 → 30, nudged 1 px left by overlay
  s_cy_px=51.1,           # ㅅ centre (px): box y 23..76 → 49.5, nudged 1.6 px down; moves with 시 via `lift`
  gy_i_top_px=55,         # top of 결's ㅣ in the original (px)
  # 결 widening (per component, strokes keep their width): the original 결 is wider, with a longer, flatter ㄹ
  # (amounts fitted by overlay on the original, see header; IoU of 결 ≥ the unwidened glyph)
  g_tail=30,              # ㄱ: its left end (diagonal tail) moves left by this much, tapering to 0 at its corner
  i_shift=15,             # ㅣ + ㅕ bars move right
  r_left=15,              # ㄹ: left half (left stem + left ends of the bars) moves left
  r_right=15,             # ㄹ: right half moves right (with the ㅣ)
  r_bot_ext=40,           # ㄹ: its bottom bar alone runs further right (flatter, steadier ㄹ; as in the original)
  r_flat=0,               # ㄹ: reduce its height (0: the original's ㄹ is not shorter, see header)
  # calibration mapping of the original crop: X_px = DX + K*x, Y_px = DY - K*y (fitted on 결)
  K=0.0993, DX=51.75, DY=156.375,
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
def mapc(con,fn): return [(op,tuple(fn(x,y) for x,y in a)) for op,a in con]
# 결 contours (Noto Serif KR 500): 0 ㅣ upper stem · 11-14 ㅕ bars · 8-10 ㄱ · 1-7 ㄹ (5,6 = its right stem)
GX0,GXC=62.3,564.6                                # ㄱ left end and corner (right end of its top bar)
def g_fn(x,y):
    t=min(1,max(0,(GXC-x)/(GXC-GX0)));return (x-P['g_tail']*t,y)
R_MID,R_BOT,R_TOP=570,-83.3,306.6
def r_fn(x,y):
    x=x-P['r_left'] if x<R_MID else x+P['r_right']
    if P['r_flat']: y=R_BOT+(y-R_BOT)*(1-P['r_flat']/(R_TOP-R_BOT))
    return (x,y)
def rb_fn(x,y):
    x,y=r_fn(x,y);return (x+P['r_bot_ext'] if x>R_MID+P['r_right']+150 else x,y)
gy=[mapc(c,(lambda x,y:(x+P['i_shift'],y)) if i in (0,11,12,13,14) else g_fn if i in (8,9,10) else rb_fn if i==2 else r_fn) for i,c in enumerate(gy)]
G_TOP=bounds([gy[9]])[3]                         # top of 결's ㄱ
gy_i=tf(gy[0],1,0,0,600,(P['DY']-P['gy_i_top_px'])/P['K']-854.24)     # stretch 결's ㅣ stem up
s=P['si_scale']
stem_c=(729+812)/2                               # 시's ㅣ stem centre (Noto units)
K,DX,DY=P['K'],P['DX'],P['DY']
u=lambda X:(X-DX)/K; v=lambda Y:(DY-Y)/K
dx_i=u(P['si_stem_px'])-s*stem_c
dy_i=(G_TOP+P['gap'])-s*bounds([si[0]])[1]       # ㅣ bottom = ㄱ top + gap
si_i=tf(si[0],s,dx_i,dy_i,400,P['si_i_raise'])
lift=dy_i-(v(80.5)+108.44*s)            # how much 시 moved vs the measured ㅣ bottom
sb=bounds(si[1:]);scx=(sb[0]+sb[2])/2;scy=(sb[1]+sb[3])/2
si_s=[tf(c,s,u(P['s_cx_px'])-s*scx,v(P['s_cy_px'])+lift-s*scy) for c in si[1:]]
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
