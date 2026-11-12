"""Regenerate committed native artwork from the installed Onest font.

Development helper only; normal prepare/build copies the committed outputs and
does not need Python, Pillow or FontTools.
"""
from pathlib import Path
import hashlib, io, json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from PIL import Image, ImageDraw, ImageFont

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
FONT=ROOT/'node_modules/@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2'
GRAPHITE='#15171c';WHITE='#ffffff';LETTERS='СК'
font=instantiateVariableFont(TTFont(FONT),{'wght':650},inplace=False)
glyphs=font.getGlyphSet();cmap=font.getBestCmap();names=[cmap[ord(letter)] for letter in LETTERS]
bounds=[];positions=[];advance=0
for name in names:
    pen=BoundsPen(glyphs);glyphs[name].draw(pen)
    x0,y0,x1,y1=pen.bounds
    bounds.append((x0+advance,y0,x1+advance,y1));positions.append(advance)
    advance+=font['hmtx'][name][0]
minimum=(min(b[0] for b in bounds),min(b[1] for b in bounds));maximum=(max(b[2] for b in bounds),max(b[3] for b in bounds))

def geometry(size):
    scale=size*.52/(maximum[0]-minimum[0])
    x=(size-scale*(maximum[0]+minimum[0]))/2
    y=(size+scale*(maximum[1]+minimum[1]))/2
    return scale,x,y

def outlines(size):
    scale,x,y=geometry(size);paths=[]
    for name,position in zip(names,positions):
        pen=SVGPathPen(glyphs,ntos=lambda n:format(n,'.4f').rstrip('0').rstrip('.') if n else '0')
        glyphs[name].draw(TransformPen(pen,(scale,0,0,-scale,x+position*scale,y)))
        paths.append(pen.getCommands())
    return paths

def write(path,text):
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text,encoding='utf-8',newline='\n')

paths=outlines(512)
write(HERE/'app-icon.svg','<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">\n  <rect width="512" height="512" fill="'+GRAPHITE+'"/>\n'+''.join('  <path fill="'+WHITE+'" d="'+p+'"/>\n' for p in paths)+'</svg>\n')
font.flavor=None;ttf=io.BytesIO();font.save(ttf);ttf_data=ttf.getvalue()

def raster(size,shape='square'):
    factor=4;large=size*factor
    image=Image.new('RGBA',(large,large),(0,0,0,0));draw=ImageDraw.Draw(image)
    if shape=='circle':draw.ellipse((0,0,large-1,large-1),fill=GRAPHITE)
    elif shape=='rounded':draw.rounded_rectangle((0,0,large-1,large-1),radius=large*.20,fill=GRAPHITE)
    else:draw.rectangle((0,0,large-1,large-1),fill=GRAPHITE)
    scale,x,y=geometry(large);upm=font['head'].unitsPerEm
    pilfont=ImageFont.truetype(io.BytesIO(ttf_data),round(scale*upm))
    for letter,position in zip(LETTERS,positions):draw.text((x+position*scale,y),letter,font=pilfont,anchor='ls',fill=WHITE)
    return image.resize((size,size),Image.Resampling.LANCZOS)

raster(512).convert('RGB').save(HERE/'app-icon.png',optimize=True)
ios=HERE/'ios/AppIcon.appiconset';ios.mkdir(parents=True,exist_ok=True)
raster(1024).convert('RGB').save(ios/'AppIcon-1024.png',optimize=True)
write(ios/'Contents.json',json.dumps({'images':[{'filename':'AppIcon-1024.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}},indent=2)+'\n')

res=HERE/'android/res'
for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    target=res/('mipmap-'+density);target.mkdir(parents=True,exist_ok=True)
    raster(size,'rounded').save(target/'ic_launcher.png',optimize=True)
    raster(size,'circle').save(target/'ic_launcher_round.png',optimize=True)

def vector(color):
    return '<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n'+''.join('    <path android:fillColor="'+color+'" android:pathData="'+p+'"/>\n' for p in outlines(108))+'</vector>\n'
write(res/'drawable/ic_launcher_foreground.xml',vector(WHITE))
write(res/'drawable/splash_icon.xml',vector(GRAPHITE))
write(res/'drawable/splash.xml','''<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@android:color/white" />
    <item android:gravity="center" android:drawable="@drawable/splash_icon" />
</layer-list>
''')
adaptive='''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
'''
for name in ['ic_launcher.xml','ic_launcher_round.xml']:write(res/'mipmap-anydpi-v26'/name,adaptive)
write(res/'values/ic_launcher_background.xml','''<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#15171c</color></resources>
''')
write(res/'values/colors.xml','''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#15171c</color>
    <color name="colorPrimaryDark">#15171c</color>
    <color name="colorAccent">#15171c</color>
</resources>
''')
write(res/'values/styles.xml','''<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools">
    <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:windowBackground">@android:color/white</item>
        <item name="android:statusBarColor">@android:color/white</item>
        <item name="android:navigationBarColor">@android:color/white</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowLightNavigationBar" tools:targetApi="27">true</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@android:color/white</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowBackground">@drawable/splash</item>
    </style>
</resources>
''')
write(res/'values-v31/styles.xml','''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:windowSplashScreenBackground">@android:color/white</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>
        <item name="android:windowSplashScreenIconBackgroundColor">@android:color/white</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
''')
shutil_license=ROOT/'node_modules/@fontsource-variable/onest/LICENSE'
write(HERE/'ONEST-LICENSE.txt',shutil_license.read_text(encoding='utf-8'))
manifest={'glyphs':LETTERS,'font':'Onest','weight':650,'fontSource':'@fontsource-variable/onest 5.3.1; cyrillic wght normal','fontSha256':hashlib.sha256(FONT.read_bytes()).hexdigest(),'foreground':WHITE,'background':GRAPHITE,'adaptiveViewport':108,'adaptiveInkWidth':108*.52,'files':{str(p.relative_to(HERE)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(HERE.rglob('*')) if p.is_file() and p.name not in ['manifest.json','generate-icons.py','README.md']}}
write(HERE/'manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'files':len(manifest['files']),'font':manifest['font'],'weight':650,'fontSha256':manifest['fontSha256']}))
