/* 이 앱의 성장 규칙: 완료 +10 XP, 50 XP마다 레벨 업, Lv.5 / Lv.10 진화. */
globalThis.PokemonGame = (() => {
  const partners = {
    pikachu: { label: '피카츄', color: '#fff3c4', forms: [{id:'025',name:'피카츄',level:1},{id:'026',name:'라이츄',level:10}] },
    charmander: { label: '파이리', color: '#ffe4d1', forms: [{id:'004',name:'파이리',level:1},{id:'005',name:'리자드',level:5},{id:'006',name:'리자몽',level:10}] },
    squirtle: { label: '꼬부기', color: '#d9f4ff', forms: [{id:'007',name:'꼬부기',level:1},{id:'008',name:'어니부기',level:5},{id:'009',name:'거북왕',level:10}] }
  };
  const valid = key => Object.hasOwn(partners, key);
  function normalize(raw, legacy = []) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const xp = Object.fromEntries(Object.keys(partners).map(key => [key,
      Number.isSafeInteger(source.xp?.[key]) && source.xp[key] >= 0 ? source.xp[key] : 0]));
    const items = Array.isArray(source.todos) ? source.todos : legacy;
    return { selected: valid(source.selected) ? source.selected : 'pikachu', xp,
      todos: Array.isArray(items) ? items.filter(t => t && typeof t.text === 'string').map(t => ({
        id: t.id, text: t.text, done: !!t.done,
        ...(valid(t.rewardPartner) ? {rewardPartner: t.rewardPartner} : {})
      })) : [] };
  }
  function info(state, key = state.selected) {
    const xp = state.xp[key], level = 1 + Math.floor(xp / 50);
    const forms = partners[key].forms;
    const form = [...forms].reverse().find(f => level >= f.level);
    return { xp, level, form, next: forms.find(f => f.level > level), progress: xp % 50 };
  }
  function complete(state, todo) {
    if (todo.done) return false;
    todo.rewardPartner ||= state.selected;
    state.xp[todo.rewardPartner] += 10;
    todo.done = true;
    return true;
  }
  function undo(state, todo) {
    if (!todo.done) return false;
    if (valid(todo.rewardPartner)) state.xp[todo.rewardPartner] = Math.max(0, state.xp[todo.rewardPartner] - 10);
    todo.done = false;
    return true;
  }
  return { partners, normalize, info, complete, undo, valid, image: form => form.id === '009' ? 'img/blastoise-unite.png' : 'img/pokemon-' + form.id + '.png' };
})();
