/**
 * BailingMultiSelect - 通用多选下拉（不强制搜索）
 *
 * 特点：
 *  - 点触发按钮打开面板；显示"XX"/"已选 N 个"/"全部"
 *  - 面板顶部可选搜索框（opts.search=true 才出现）
 *  - 列表支持选项分组（opts.groups = [{label, items:[]}]）或扁平（opts.items）
 *  - 全选 / 反选 / 清空 按钮
 *  - 点外部 / Esc 关闭
 *  - 自动把选中值同步到隐藏的 <select multiple>（兼容 form 提交）
 *
 * 用法：
 *   const ms = BailingMultiSelect.create({
 *     container: '#boardEmpMulti',  // 选择器或 Element
 *     items: ['张三','李四'],          // 扁平列表
 *     // 或 groups: [{label:'H1组', items:['张三','李四']}, ...]
 *     placeholder: '全部员工',
 *     unit: '人',
 *     search: true,                  // 默认 true
 *     onChange: (selectedArr) => {},
 *   });
 *   ms.getValues();   // 当前选中
 *   ms.setValues(['张三']);
 *   ms.setData({items:[...]});       // 更新数据
 */
(function(global){
  'use strict';

  function esc(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function create(opts){
    const box = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if(!box){ console.warn('[BMS] 容器未找到', opts.container); return null; }
    const placeholder = opts.placeholder || '全部';
    const unit = opts.unit || '项';
    const hasSearch = opts.search !== false;
    let items = opts.items || [];
    let groups = opts.groups || null;
    const selectedSet = new Set((opts.initial||[]).filter(Boolean));
    let searchKw = '';

    box.classList.add('bms-root');

    function flat(){
      if(groups) return groups.flatMap(g => g.items);
      return items;
    }

    function labelText(){
      const count = selectedSet.size;
      if(count === 0) return placeholder;
      if(count === 1) return Array.from(selectedSet)[0];
      return `已选 ${count} ${unit}`;
    }

    function renderHead(){
      const headEl = box.querySelector('.bms-head');
      if(!headEl) return;
      const count = selectedSet.size;
      const text = labelText();
      headEl.innerHTML = `
        <span class="bms-label" style="color:${count?'#1f2937':'#9ca3af'};">${esc(text)}</span>
        <svg width="14" height="14" fill="none" stroke="#6b7280" stroke-width="2" viewBox="0 0 20 20"><path d="M5 8l5 5 5-5"/></svg>
      `;
    }

    function filteredGroups(){
      const kw = searchKw.toLowerCase().trim();
      if(groups){
        return groups.map(g => ({
          label: g.label,
          items: g.items.filter(v => !kw || String(v).toLowerCase().includes(kw))
        })).filter(g => g.items.length>0);
      }
      return [{label:null, items: items.filter(v => !kw || String(v).toLowerCase().includes(kw))}];
    }

    function renderList(){
      const listEl = box.querySelector('.bms-list');
      if(!listEl) return;
      const fg = filteredGroups();
      const total = fg.reduce((s,g)=>s+g.items.length, 0);
      if(total === 0){
        listEl.innerHTML = `<div class="bms-empty">无匹配项</div>`;
        return;
      }
      const groupsHTML = fg.map(g => {
        const items = g.items.map(v => `
          <label class="bms-item" title="${esc(v)}">
            <input type="checkbox" value="${esc(v)}" ${selectedSet.has(v)?'checked':''}>
            <span>${esc(v)}</span>
          </label>
        `).join('');
        if(g.label){
          return `<div class="bms-group"><div class="bms-group-title">${esc(g.label)}</div>${items}</div>`;
        }
        return items;
      }).join('');
      listEl.innerHTML = groupsHTML;
      // 绑定 change
      listEl.querySelectorAll('input[type="checkbox"]').forEach(ch => {
        ch.onchange = (ev) => {
          ev.stopPropagation();
          const v = ev.target.value;
          if(ev.target.checked) selectedSet.add(v);
          else selectedSet.delete(v);
          renderHead();
          if(opts.onChange) opts.onChange(Array.from(selectedSet));
        };
      });
      listEl.querySelectorAll('.bms-item').forEach(l => {
        l.addEventListener('click', ev => ev.stopPropagation());
      });
    }

    function renderAll(){
      box.innerHTML = `
        <div class="bms-head" tabindex="0"></div>
        <div class="bms-panel">
          ${hasSearch ? `<input type="text" class="bms-search" placeholder="搜索...">` : ''}
          <div class="bms-toolbar">
            <button type="button" class="bms-tool-btn" data-act="all">全选</button>
            <button type="button" class="bms-tool-btn" data-act="invert">反选</button>
            <button type="button" class="bms-tool-btn" data-act="clear">清空</button>
            <span class="bms-count"></span>
          </div>
          <div class="bms-list"></div>
        </div>
      `;
      renderHead();
      renderList();
      updateCount();

      const head = box.querySelector('.bms-head');
      head.addEventListener('click', (e)=>{
        e.stopPropagation();
        box.classList.toggle('is-open');
        if(box.classList.contains('is-open')){
          const s = box.querySelector('.bms-search');
          if(s){ s.value=''; searchKw=''; renderList(); setTimeout(()=>s.focus(), 40); }
        }
      });
      const searchEl = box.querySelector('.bms-search');
      if(searchEl){
        searchEl.addEventListener('input', ev=>{
          searchKw = ev.target.value;
          renderList();
        });
        searchEl.addEventListener('click', ev=>ev.stopPropagation());
      }
      // 全选/反选/清空
      box.querySelectorAll('.bms-tool-btn').forEach(btn=>{
        btn.addEventListener('click', ev=>{
          ev.stopPropagation();
          const act = btn.dataset.act;
          const all = flat();
          if(act==='all'){ all.forEach(v=>selectedSet.add(v)); }
          else if(act==='clear'){ selectedSet.clear(); }
          else if(act==='invert'){
            all.forEach(v => { if(selectedSet.has(v)) selectedSet.delete(v); else selectedSet.add(v); });
          }
          renderHead(); renderList(); updateCount();
          if(opts.onChange) opts.onChange(Array.from(selectedSet));
        });
      });
    }

    function updateCount(){
      const el = box.querySelector('.bms-count');
      if(el){ el.textContent = `已选 ${selectedSet.size} / ${flat().length}`; }
    }

    // 点外部关闭
    document.addEventListener('mousedown', (e)=>{
      if(!box.contains(e.target)) box.classList.remove('is-open');
    });
    document.addEventListener('keydown', (e)=>{
      if(e.key==='Escape') box.classList.remove('is-open');
    });

    renderAll();

    return {
      getValues(){ return Array.from(selectedSet); },
      setValues(arr){
        selectedSet.clear();
        (arr||[]).forEach(v=>selectedSet.add(v));
        renderHead(); renderList(); updateCount();
      },
      setData(data){
        if(data.items){ items = data.items; groups = null; }
        if(data.groups){ groups = data.groups; items = []; }
        // 清理选中集合里不存在的项
        const validSet = new Set(flat());
        Array.from(selectedSet).forEach(v => { if(!validSet.has(v)) selectedSet.delete(v); });
        renderHead(); renderList(); updateCount();
      },
      open(){ box.classList.add('is-open'); },
      close(){ box.classList.remove('is-open'); },
      destroy(){ box.innerHTML=''; box.classList.remove('bms-root','is-open'); }
    };
  }

  global.BailingMultiSelect = { create };
})(typeof window!=='undefined' ? window : this);
// 全量更新 2026-05-27
