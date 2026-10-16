"""Render actual Wiki templates without importing the database application."""
from html.parser import HTMLParser
from pathlib import Path
import unittest
from jinja2 import Environment, FileSystemLoader


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(); self.hidden=0; self.text=[]
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'): self.hidden+=1
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.hidden=max(0,self.hidden-1)
    def handle_data(self, data):
        if not self.hidden: self.text.append(data)


class WikiThemeTests(unittest.TestCase):
    def test_active_templates_render_shared_theme_without_orphaned_script_text(self):
        env=Environment(loader=FileSystemLoader(Path(__file__).parents[1]/'templates'))
        for name in ('page.html','edit_page.html'):
            with self.subTest(template=name):
                html=env.get_template(name).render(campaign_name='Campaign',page_title='Main Page',content='<p>Authored content</p>')
                parser=VisibleText(); parser.feed(html)
                self.assertNotIn('console.log', ''.join(parser.text))
                self.assertIn('/wiki-static/kachhapa-theme.css',html)
                self.assertIn('/wiki-static/kachhapa-theme.js',html)
                self.assertEqual(html.count('src="/wiki-static/jodit.min.js"'),1)
                self.assertIn('data-kachhapa-ui="core"',html)
                self.assertIn('<p>Authored content</p>',html)
