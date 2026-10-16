import {parseHex,rgbHex,rgbHsv,hsvRgb,companion,contrast} from './themeColors';
import tokens from './styles/themeTokens.json';
test('literal conversions include alpha and reject CSS',()=>{
 expect(rgbHex(parseHex('#f00'))).toBe('#ff0000');expect(rgbHex(parseHex('#12345680'))).toBe('#12345680');expect(parseHex('url(x)')).toBeNull();
 for(const hex of ['#ff0000','#00ff00','#0000ff','#000000','#ffffff','#3163b8','#12345680'])expect(rgbHex(hsvRgb({...rgbHsv(parseHex(hex)),a:parseHex(hex).a}))).toBe(hex);
 expect(contrast('#121212','#121212')).toBe(1);
});
test('companion is a draft with all roles and does not mutate the source',()=>{
 for(const mode of ['dark','light']){const before=JSON.stringify(tokens[mode]),result=companion(tokens[mode],mode==='dark'?'light':'dark');expect(Object.keys(result)).toEqual(Object.keys(tokens[mode]));expect(Object.values(result).every(c=>parseHex(c))).toBe(true);expect(JSON.stringify(tokens[mode])).toBe(before);}
});
