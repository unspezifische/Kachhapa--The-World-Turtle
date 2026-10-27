import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NpcImageFramer from './NpcImageFramer';

function Harness() {
  const [crop,setCrop]=useState({x:.5,y:.5,zoom:1,shape:'circle',border:''});
  return <><NpcImageFramer crop={crop} onChange={setCrop} renderImage={style=><img alt="Subject" style={style}/>} /><output aria-label="Crop state">{JSON.stringify(crop)}</output></>;
}

test('positions by dragging and exposes no range sliders', () => {
  render(<Harness/>);
  const stage=screen.getByRole('application',{name:'Image framing preview'});
  fireEvent.pointerDown(stage,{pointerId:1,clientX:100,clientY:100});
  fireEvent.pointerMove(stage,{pointerId:1,clientX:122,clientY:78});
  fireEvent.pointerUp(stage,{pointerId:1});
  expect(screen.getByLabelText('Crop state')).not.toHaveTextContent('"x":0.5,"y":0.5');
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
});

test('decorative border is an overlay and never changes zoom', () => {
  render(<Harness/>);
  fireEvent.click(screen.getByRole('button',{name:'Zoom in'}));
  fireEvent.click(screen.getByLabelText('Decorative border'));
  expect(screen.getByLabelText('Crop state')).toHaveTextContent('"zoom":1.25');
  expect(document.querySelectorAll('.npc-framer-border')).toHaveLength(1);
  fireEvent.click(screen.getByLabelText('Decorative border'));
  expect(screen.getByLabelText('Crop state')).toHaveTextContent('"zoom":1.25');
  expect(document.querySelectorAll('.npc-framer-border')).toHaveLength(0);
});
