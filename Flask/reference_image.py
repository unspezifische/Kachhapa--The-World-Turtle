"""Keep reference image dimensions and viewer pixels in EXIF display orientation."""
import io

from PIL import Image, ImageOps


def display_dimensions(image):
    width, height = image.size
    return (height, width) if image.getexif().get(274) in {5, 6, 7, 8} else (width, height)


def viewer_image(original_bytes):
    output = io.BytesIO()
    with Image.open(io.BytesIO(original_bytes)) as original:
        if original.format == 'JPEG':
            original.draft('RGB', (5500, 5500))
        source = ImageOps.exif_transpose(original)
        source.thumbnail((5500, 5500), Image.Resampling.LANCZOS)
        if source.mode != 'RGB':
            flattened = Image.new('RGB', source.size, 'white')
            if 'A' in source.getbands():
                flattened.paste(source, mask=source.getchannel('A'))
            else:
                flattened.paste(source)
            source = flattened
        dimensions = source.size
        source.save(output, 'JPEG', quality=90, optimize=True)
    return output.getvalue(), dimensions
