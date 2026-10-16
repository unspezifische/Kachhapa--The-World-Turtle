import React,{useState} from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import ThemeColorPicker from './ThemeColorPicker';
function Picker({initial='#000000'}){const [color,setColor]=useState(initial);return <><ThemeColorPicker value={color} onChange={setColor} label="Color"/><output data-testid="color">{color}</output></>;}
test('hue and saturation survive editing black, numeric inputs synchronize',()=>{
 render(<Picker/>);fireEvent.change(screen.getByLabelText('HSV Hue'),{target:{value:'120'}});fireEvent.change(screen.getByLabelText('HSV Saturation'),{target:{value:'100'}});fireEvent.change(screen.getByLabelText('HSV Value'),{target:{value:'100'}});expect(screen.getByTestId('color')).toHaveTextContent('#00ff00');
 fireEvent.change(screen.getByLabelText('HEX color'),{target:{value:'#ff0000'}});expect(screen.getByLabelText('R channel')).toHaveValue(255);expect(screen.getByLabelText('HSV Hue')).toHaveValue(0);
});
test('keyboard wheel and white hue memory',()=>{
 render(<Picker initial="#ffffff"/>);fireEvent.keyDown(screen.getByRole('slider',{name:'Hue wheel'}),{key:'ArrowRight',shiftKey:true});expect(screen.getByLabelText('HSV Hue')).toHaveValue(10);fireEvent.change(screen.getByLabelText('HSV Saturation'),{target:{value:'100'}});expect(screen.getByTestId('color')).toHaveTextContent('#ff2b00');
});
