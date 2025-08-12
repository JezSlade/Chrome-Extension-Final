// ui/modules/settings.js
import { el, rpc, getState, setState, showToast } from '../utils.js';

export const id = 'settings';
export const label = 'Settings';

let STATUS = null; // cached sync status for this session

async function toggleEnabled(){
  const res = await rpc('TOGGLE_ENABLED');
  if (res && res.ok){ showToast('Toggled'); const st = await rpc('GET_STATE'); setState({ data: st.data }); }
}

async function setArea(area){
  const res = await rpc('SET_STORAGE_AREA', { area });
  if (res && res.ok){ showToast('Storage area set'); setState({ data: res.data }); }
}

async function setMenu(patch){
  const current = getState().data.menu || {};
  const next = Object.assign({}, current, patch);
  await rpc('SET_MENU', { menu: next });
  const st = await rpc('GET_STATE');
  setState({ data: st.data });
  showToast('Menu updated');
}

/* Sync status, backup, restore */
async function refreshStatus(){
  const res = await rpc('SYNC_STATUS');
  if (res && res.ok){ STATUS = res.status; setState({}); } else { showToast('Status error'); }
}
async function backupSync(){
  const res = await rpc('SYNC_BACKUP');
  if (res && res.ok){ showToast('Backup created'); await refreshStatus(); }
}
async function restoreSync(){
  const sel = document.getElementById('tf-restore-select');
  if (!sel) return;
  const id = sel.value;
  if (!id){ showToast('Select a backup'); return; }
  const res = await rpc('SYNC_RESTORE', { id });
  if (res && res.ok){ showToast('Restored to Sync'); await refreshStatus(); }
}

function countsView(c){
  const cnt = c && c.counts ? c.counts : {};
  const b = c && c.bytes ? c.bytes : {};
  return el('div', {},
    el('div', {}, `Area: ${c.area}`),
    el('div', {}, `Counts - expansions: ${cnt.expansions||0}, variables: ${cnt.variables||0}, forms: ${cnt.forms||0}, prompts: ${cnt.prompts||0}, menu: ${cnt.menu||0}`),
    el('div', {}, `Bytes - state: ${b['toolforge_state_v1']||0}, prompt: ${b['toolforge_prompt_data_v1']||0}`)
  );
}

function backupsView(){
  const list = (STATUS && STATUS.backups) || [];
  if (!list.length) return el('div', { class:'small' }, 'No backups exist in Sync.');
  const sel = el('select', { id:'tf-restore-select' },
    el('option', { value:'' }, 'Select backup...'),
    ...list.map(b => el('option', { value:b.id }, b.id))
  );
  return el('div', { class:'row' }, sel, el('button', { class:'btn', onclick: restoreSync }, 'Restore'));
}

function generalCard(){
  const st = getState();
  const cfg = st.data?.config || { enabled: true, storageArea: 'sync' };
  const menu = st.data?.menu || { enableContextMenu: true, items: { openManager: true, insertExpansion: true, promptEngineer: true } };

  return el('div', { class:'card' },
    el('h3', {}, 'General'),
    el('div', { class:'row' },
      el('label', {}, el('input', { type:'checkbox', checked: !!cfg.enabled, onchange: toggleEnabled }), ' Enabled'),
      el('div', { style:'width:16px' }),
      el('label', {}, 'Storage'),
      el('select', { onchange:(e)=> setArea(e.target.value) },
        el('option', { value:'local', selected: cfg.storageArea==='local' }, 'local'),
        el('option', { value:'sync', selected: cfg.storageArea!=='local' }, 'sync')
      )
    ),
    el('div', { class:'divider' }),
    el('h3', {}, 'Context menu'),
    el('div', { class:'row' },
      el('label', {}, el('input', { type:'checkbox', checked: !!menu.enableContextMenu, onchange:(e)=> setMenu({ enableContextMenu: !!e.target.checked }) }), ' Enable')
    ),
    el('div', { class:'row' },
      el('label', {}, el('input', { type:'checkbox', checked: !!menu.items?.openManager, onchange:(e)=> setMenu({ items: Object.assign({}, menu.items, { openManager: !!e.target.checked }) }) }), ' Open Manager'),
      el('label', {}, el('input', { type:'checkbox', checked: !!menu.items?.promptEngineer, onchange:(e)=> setMenu({ items: Object.assign({}, menu.items, { promptEngineer: !!e.target.checked }) }) }), ' Prompt Engineer'),
      el('label', {}, el('input', { type:'checkbox', checked: !!menu.items?.insertExpansion, onchange:(e)=> setMenu({ items: Object.assign({}, menu.items, { insertExpansion: !!e.target.checked }) }) }), ' Insert Expansion')
    )
  );
}

function syncCard(){
  return el('div', { class:'card' },
    el('h3', {}, 'Sync Status'),
    el('div', { class:'row' },
      el('button', { class:'btn', onclick: refreshStatus }, 'Refresh status'),
      el('button', { class:'btn secondary', onclick: backupSync }, 'Backup Sync')
    ),
    STATUS ? el('div', {},
      el('div', { class:'small' }, `Active area: ${STATUS.activeArea}`),
      el('div', { class:'small' }, `Last Push: ${STATUS.lastPushAt || 'n/a'}`),
      el('div', { class:'small' }, `Last Pull: ${STATUS.lastPullAt || 'n/a'}`),
      el('div', { class:'divider' }),
      el('h4', {}, 'Local'),
      countsView(STATUS.local),
      el('div', { class:'divider' }),
      el('h4', {}, 'Sync'),
      countsView(STATUS.sync),
      el('div', { class:'divider' }),
      el('h4', {}, 'Restore from backup'),
      backupsView()
    ) : el('div', { class:'small' }, 'Click Refresh status to load details')
  );
}

export function render(){
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class:'card' }, el('h3', {}, 'Settings')));
  wrap.appendChild(generalCard());
  wrap.appendChild(syncCard());
  return wrap;
}
