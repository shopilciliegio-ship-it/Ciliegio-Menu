# Raddrizza le foto secondo l'orientamento EXIF (il telefono le salva "di traverso"
# con un'etichetta di rotazione che l'API di Anthropic ignora). Gli originali non si toccano.
import sys, os
from PIL import Image, ImageOps

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for name in os.listdir(src):
    p = os.path.join(src, name)
    if not os.path.isfile(p) or os.path.splitext(name)[1].lower() not in ('.jpg', '.jpeg', '.png', '.webp'):
        continue
    im = Image.open(p)
    rot = im.getexif().get(274, 1)
    fixed = ImageOps.exif_transpose(im)
    ext = os.path.splitext(name)[1].lower()
    fixed.save(os.path.join(dst, name), quality=92) if ext in ('.jpg', '.jpeg') else fixed.save(os.path.join(dst, name))
    print(f"{name}: {'raddrizzata (EXIF %s)' % rot if rot != 1 else 'ok'}")
