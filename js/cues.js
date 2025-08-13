function fmt(fmt) {
  const d = new Date();
  const pad = (n,w=2)=>String(n).padStart(w,'0');
  return fmt.replace(/%Y/g,String(d.getFullYear()))
            .replace(/%m/g,pad(d.getMonth()+1))
            .replace(/%d/g,pad(d.getDate()))
            .replace(/%H/g,pad(d.getHours()))
            .replace(/%M/g,pad(d.getMinutes()))
            .replace(/%S/g,pad(d.getSeconds()));
}

export function renderTemplate(tpl, vars) {
  return tpl.replace(/\{\{([^}]+)\}\}/g, (m, key) => {
    const [name, param] = String(key).split(':', 2);
    if (name === 'date') return fmt(param || vars?.date?.default || "%Y-%m-%d");
    if (name === 'time') return fmt(param || vars?.time?.default || "%H:%M");
    const v = vars?.[name];
    if (v && typeof v === 'object' && 'value' in v) return String(v.value);
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  });
}
