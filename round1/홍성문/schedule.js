(function(root) {
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const validTime = t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const groupOf = t => !validTime(t.time) ? 'unscheduled' : t.time < '12:00' ? 'morning' : 'afternoon';
  const normalize = (items, today) => (Array.isArray(items) ? items : []).filter(t => t && typeof t.text === 'string').map(t => ({...t,id:t.id || crypto.randomUUID(),date:t.date || today,time:validTime(t.time)?t.time:'',completed:Boolean(t.completed)}));
  function mergeEvents(todos, events, today) {
    const old = new Map(todos.map(t => [t.id,t]));
    const incoming = events.filter(e => e.id && e.status !== 'cancelled').map(e => {
      const id = `google:${e.id}:${today}`;
      const start = e.start?.dateTime ? new Date(e.start.dateTime) : null;
      return {id,source:'google',text:e.summary || '제목 없는 일정',date:today,time:start && localDate(start)===today ? `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`:'',completed:old.get(id)?.completed || false,dismissed:old.get(id)?.dismissed || false};
    });
    return [...todos.filter(t => t.source !== 'google' || t.date !== today),...incoming];
  }
  const api = {localDate,validTime,groupOf,normalize,mergeEvents};
  if(typeof module !== 'undefined') module.exports=api; else root.Schedule=api;
})(globalThis);
