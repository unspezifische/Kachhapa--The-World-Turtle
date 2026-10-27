import React from 'react';
import { render,screen,fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VoiceRuleForm } from './NpcVoiceTriggerEditor';
const value={event_type:'npc.damage.received',conditions:{},priority:40,probability:1,cooldown_ms:15000,enabled:true,interrupt:false,randomized:false};
test('damage fields are declarative and changing event clears irrelevant conditions',()=>{
 const save=jest.fn();render(<VoiceRuleForm value={value} onSave={save}/>);
 fireEvent.change(screen.getByLabelText('Minimum damage'),{target:{value:'10'}});
 fireEvent.click(screen.getByText('Add trigger'));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({conditions:{minDamage:10}}));
 fireEvent.change(screen.getByLabelText('When'),{target:{value:'npc.spell.cast'}});
 expect(screen.queryByLabelText('Minimum damage')).not.toBeInTheDocument();
 expect(screen.getByLabelText('Spell')).toBeInTheDocument();
 fireEvent.click(screen.getByText('Add trigger'));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({event_type:'npc.spell.cast',conditions:{}}));
});
