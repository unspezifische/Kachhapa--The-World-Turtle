import io
import unittest

from PIL import Image

from reference_image import display_dimensions, viewer_image


class ReferenceImageTest(unittest.TestCase):
    def test_exif_rotated_jpeg_keeps_displayed_dimensions_and_pixels(self):
        source = Image.new('RGB', (10, 20), 'white')
        source.paste((255, 0, 0), (0, 0, 10, 5))
        exif = Image.Exif()
        exif[274] = 6
        original = io.BytesIO()
        source.save(original, 'JPEG', exif=exif, quality=100)

        with Image.open(io.BytesIO(original.getvalue())) as image:
            self.assertEqual(display_dimensions(image), (20, 10))
        preview_bytes, dimensions = viewer_image(original.getvalue())
        with Image.open(io.BytesIO(preview_bytes)) as preview:
            self.assertEqual(dimensions, (20, 10))
            self.assertEqual(preview.size, (20, 10))
            self.assertIsNone(preview.getexif().get(274))
            self.assertLess(preview.getpixel((16, 2))[1], preview.getpixel((2, 2))[1])


if __name__ == '__main__':
    unittest.main()
