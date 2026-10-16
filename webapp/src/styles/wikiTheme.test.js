import fs from 'fs';
import path from 'path';
const source=fs.readFileSync(path.resolve(process.cwd(),'../Flask/static/kachhapa-theme.js'),'utf8');
test('Wiki initializes saved mode and toggles without touching authored content',()=>{
 document.head.innerHTML='<meta name="theme-color" content="#000">';
 document.body.innerHTML='<button id="wiki-theme-toggle"></button><article style="color: purple">Authored text</article>';
 localStorage.setItem('theme','light');
 // Execute the actual standalone adapter, as the Flask page does before its stylesheet loads.
 new Function(source)();
 document.dispatchEvent(new Event('DOMContentLoaded'));
 expect(document.documentElement.dataset.theme).toBe('light');
 document.getElementById('wiki-theme-toggle').click();
 expect(localStorage.getItem('theme')).toBe('dark');
 expect(document.documentElement.dataset.theme).toBe('dark');
 expect(document.querySelector('article').style.color).toBe('purple');
 window.dispatchEvent(new StorageEvent('storage',{key:'theme',newValue:'light'}));
 expect(document.documentElement.dataset.theme).toBe('light');
});
