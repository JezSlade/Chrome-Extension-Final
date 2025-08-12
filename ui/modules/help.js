// ui/modules/help.js
import { el } from '../utils.js';
export const id = 'help';
export const label = 'Help';
export function render(){
  return el('div', { class:'card' },
    el('h3', {}, 'Help'),
    el('p', {}, 'Triggers: use :date or :sig. Variables as {{date}}. Build forms with the palette and drag to canvas. Right click for actions. Configure the context menu under Settings.')
  );
}
