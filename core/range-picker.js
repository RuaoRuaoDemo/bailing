/**
 * BailingRangePicker - 轻量双月日期范围选择器
 *
 * 用法：
 *   BailingRangePicker.bind('#myTrigger', {
 *     onChange: (from, to) => { ... }  // from/to 都是 'YYYY-MM-DD' 字符串
 *   });
 *   // 也可以用来绑定两个隐藏的 input，实现与现有代码兼容：
 *   BailingRangePicker.attach({
 *     fromInput: '#boardDateFrom',
 *     toInput:   '#boardDateTo',
 *     triggerHTML: '...',      // 可选：自定义触发按钮 HTML
 *     onChange: (from,to)=>{}
 *   });
 */
(function(global){
  'use strict';

  const DOW = ['一','二','三','四','五','六','日'];

  function pad(n){ return n<10?'0'+n:String(n); }
  function fmt(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function fmtDisp(d){ if(!d) return ''; const [y,m,day]=d.split('-'); return y+m+day; }
  function parse(s){
    if(!s) return null;
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if(!m) return null;
    return new Date(+m[1], +m[2]-1, +m[3]);
  }
  function sameDay(a,b){ return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  function addMonths(d, n){ const x=new Date(d.getTime()); x.setDate(1); x.setMonth(x.getMonth()+n); return x; }
  function startOfWeek(d){
    const x=new Date(d.getTime());
    const day=(x.getDay()+6)%7; // 周一=0
    x.setDate(x.getDate()-day); x.setHours(0,0,0,0);
    return x;
  }

  function buildMonthGrid(year, month, minDate, maxDate){
    const first = new Date(year, month, 1);
    const gridStart = startOfWeek(first);
    const days=[];
    for(let i=0;i<42;i++){
      const d=new Date(gridStart.getTime()); d.setDate(d.getDate()+i);
      days.push({
        date: d,
        str: fmt(d),
        otherMonth: d.getMonth()!==month,
        disabled: (minDate && d<minDate) || (maxDate && d>maxDate),
      });
    }
    return days;
  }

  // 预置快捷选项
  function shortcutDates(key){
    const today = new Date(); today.setHours(0,0,0,0);
    const endOfYesterday = new Date(today); endOfYesterday.setDate(endOfYesterday.getDate()-1);
    switch(key){
      case 'today':     return [today, today];
      case 'yesterday': return [endOfYesterday, endOfYesterday];
      case 'last3':     { const a=new Date(today); a.setDate(a.getDate()-2); return [a, today]; }
      case 'last7':     { const a=new Date(today); a.setDate(a.getDate()-6); return [a, today]; }
      case 'last30':    { const a=new Date(today); a.setDate(a.getDate()-29); return [a, today]; }
      case 'thisWeek':  { const a=startOfWeek(today); const b=new Date(a); b.setDate(b.getDate()+6); return [a,b]; }
      case 'thisMonth': { const a=new Date(today.getFullYear(), today.getMonth(), 1); const b=new Date(today.getFullYear(), today.getMonth()+1, 0); return [a,b]; }
      case 'lastMonth': { const a=new Date(today.getFullYear(), today.getMonth()-1, 1); const b=new Date(today.getFullYear(), today.getMonth(), 0); return [a,b]; }
    }
    return [null,null];
  }

  const SHORTCUTS = [
    {key:'today',     label:'今天'},
    {key:'yesterday', label:'昨天'},
    {key:'last3',     label:'最近3天'},
    {key:'last7',     label:'最近7天'},
    {key:'last30',    label:'最近30天'},
    {key:'thisWeek',  label:'本周'},
    {key:'thisMonth', label:'本月'},
    {key:'lastMonth', label:'上月'},
  ];

  function createPopup(){
    let popup = document.getElementById('__brpPopup');
    if(popup) return popup;
    popup = document.createElement('div');
    popup.id = '__brpPopup';
    popup.className = 'brp-popup';
    document.body.appendChild(popup);
    return popup;
  }

  let activeTrigger = null;
  let popupState = null; // {from, to, viewDate, hover, onApply, onClear}

  function hidePopup(){
    const popup=document.getElementById('__brpPopup');
    if(popup) popup.classList.remove('show');
    if(activeTrigger) activeTrigger.classList.remove('active');
    activeTrigger = null;
    popupState = null;
  }

  function renderPopup(){
    if(!popupState) return;
    const popup = createPopup();
    const s = popupState;
    const leftMonth = s.viewDate;
    const rightMonth = addMonths(leftMonth, 1);

    // 确定的 range（从小到大）
    let rangeA = s.from, rangeB = s.to;
    if(rangeA && !rangeB && s.hover){
      // 正在拖选：用 hover 模拟 to
      if(s.hover < rangeA){ rangeB = rangeA; rangeA = s.hover; }
      else rangeB = s.hover;
    }
    if(rangeA && rangeB && rangeA > rangeB){ const t=rangeA; rangeA=rangeB; rangeB=t; }

    function renderMonth(base){
      const y = base.getFullYear(), m = base.getMonth();
      const grid = buildMonthGrid(y, m, s.minDate, s.maxDate);
      const today = new Date(); today.setHours(0,0,0,0);
      return `
        <div class="brp-cal">
          <div class="brp-cal-header">
            <span class="brp-cal-title">${y}年 ${m+1}月</span>
          </div>
          <div class="brp-grid">
            ${DOW.map(d=>`<div class="brp-dow">${d}</div>`).join('')}
            ${grid.map(c=>{
              let cls = 'brp-day';
              if(c.otherMonth) cls += ' other-month';
              if(c.disabled)   cls += ' disabled';
              if(sameDay(c.date, today)) cls += ' today';
              if(rangeA && rangeB){
                if(c.date >= rangeA && c.date <= rangeB) cls += ' in-range';
                if(sameDay(c.date, rangeA)) cls += ' range-start';
                if(sameDay(c.date, rangeB)) cls += ' range-end';
              } else if(rangeA && sameDay(c.date, rangeA)){
                cls += ' range-start range-end';
              }
              return `<div class="${cls}" data-d="${c.str}">${c.date.getDate()}</div>`;
            }).join('')}
          </div>
        </div>`;
    }

    const shortcutsHTML = SHORTCUTS.map(sc=>{
      const active = s.activeShortcut===sc.key ? 'active' : '';
      return `<button class="brp-shortcut ${active}" data-sc="${sc.key}">${sc.label}</button>`;
    }).join('');

    const fromStr = s.from ? fmtDisp(fmt(s.from)) : '选择开始';
    const toStr   = s.to   ? fmtDisp(fmt(s.to))   : '选择结束';
    
    // 状态提示：引导用户
    let statusHint = '';
    if(!s.from && !s.to){
      statusHint = '<span style="color:#2563eb;font-size:11px;">👉 请点击日期选择开始时间</span>';
    } else if(s.from && !s.to){
      statusHint = '<span style="color:#f59e0b;font-size:11px;font-weight:500;">👉 请再点击一次选择结束时间，然后点"确定"</span>';
    } else if(s.from && s.to){
      statusHint = '<span style="color:#10b981;font-size:11px;font-weight:500;">✓ 范围已选，请点"确定"应用</span>';
    }

    popup.innerHTML = `
      <div class="brp-shortcuts">${shortcutsHTML}</div>
      <div class="brp-cal-nav" style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <button class="brp-nav" data-nav="prevY">« 上一年</button>
        <button class="brp-nav" data-nav="prev">‹ 上月</button>
        <span style="flex:1"></span>
        <button class="brp-nav" data-nav="next">下月 ›</button>
        <button class="brp-nav" data-nav="nextY">下一年 »</button>
      </div>
      <div class="brp-calendars">
        ${renderMonth(leftMonth)}
        ${renderMonth(rightMonth)}
      </div>
      <div class="brp-footer">
        <div class="brp-footer-info">
          <div><strong>${fromStr}</strong> ~ <strong>${toStr}</strong>
          ${(s.from && s.to) ? `<span style="margin-left:8px;color:#9ca3af">共 ${Math.round((s.to-s.from)/86400000)+1} 天</span>` : ''}</div>
          <div style="margin-top:4px;">${statusHint}</div>
        </div>
        <div class="brp-footer-btns">
          <button class="brp-btn brp-btn-cancel" data-act="clear">清空</button>
          <button class="brp-btn brp-btn-cancel" data-act="cancel">取消</button>
          <button class="brp-btn brp-btn-ok" data-act="ok" ${(!s.from || !s.to)?'disabled':''}>确定</button>
        </div>
      </div>
    `;

    // 绑定事件（事件委托）
    popup.onclick = function(e){
      // 支持点到内部文本节点的情况：用 closest 向上找
      let t = e.target;
      const dayEl = t.closest ? t.closest('.brp-day') : null;
      const scEl = t.closest ? t.closest('.brp-shortcut') : null;
      const navEl = t.closest ? t.closest('.brp-nav') : null;
      const actEl = t.closest ? t.closest('[data-act]') : null;
      
      if(dayEl && !dayEl.classList.contains('disabled')){
        const d = parse(dayEl.dataset.d);
        // 允许点击"其他月"格子，但切换 viewDate
        if(dayEl.classList.contains('other-month')){
          const diffL = (d.getFullYear()-leftMonth.getFullYear())*12 + (d.getMonth()-leftMonth.getMonth());
          const diffR = (d.getFullYear()-rightMonth.getFullYear())*12 + (d.getMonth()-rightMonth.getMonth());
          if(diffL < 0) s.viewDate = addMonths(s.viewDate, -1);
          else if(diffR > 0) s.viewDate = addMonths(s.viewDate, 1);
        }
        if(!s.from || (s.from && s.to)){
          // 还没有 from，或已经选完一对：开始新一轮
          s.from = d; s.to = null; s.hover = null; s.activeShortcut = null;
        }else{
          // 已有 from 无 to → 本次作为 to
          if(d < s.from){ s.to = s.from; s.from = d; }
          else s.to = d;
          s.hover = null; s.activeShortcut = null;
        }
        renderPopup();
        return;
      }
      if(scEl){
        const [a,b] = shortcutDates(scEl.dataset.sc);
        s.from = a; s.to = b; s.hover = null;
        s.activeShortcut = scEl.dataset.sc;
        s.viewDate = new Date(a.getFullYear(), a.getMonth(), 1);
        renderPopup();
        // 移除自动应用逻辑 - 改为只填充日期，需要点击"确定"才应用
        return;
      }
      if(navEl){
        switch(navEl.dataset.nav){
          case 'prev':  s.viewDate = addMonths(s.viewDate,-1); break;
          case 'next':  s.viewDate = addMonths(s.viewDate, 1); break;
          case 'prevY': s.viewDate = addMonths(s.viewDate,-12); break;
          case 'nextY': s.viewDate = addMonths(s.viewDate, 12); break;
        }
        renderPopup();
        return;
      }
      if(actEl){
        if(actEl.dataset.act==='ok'){
          // 若只选了 from，视为当天（from=to）
          if(s.from && !s.to) s.to = s.from;
          if(s.from && s.to){
            s.onApply(fmt(s.from), fmt(s.to));
            hidePopup();
          }
        }else if(actEl.dataset.act==='cancel'){
          hidePopup();
        }else if(actEl.dataset.act==='clear'){
          s.from = null; s.to = null; s.hover = null; s.activeShortcut = null;
          if(s.onClear) s.onClear();
          renderPopup();
        }
      }
    };
    popup.onmouseover = function(e){
      const dayEl = e.target.closest ? e.target.closest('.brp-day') : null;
      if(dayEl && !dayEl.classList.contains('disabled') && s.from && !s.to){
        const newHover = parse(dayEl.dataset.d);
        // V8.17 修复：只有当hover日期真的变了才重绘，避免每次mouseover都重绘popup
        // 之前每次重绘会重建所有cell元素，导致用户正在点击的cell被替换
        // 从而击中"新"cell的事件也会被打断，看起来就是"点不到"
        if(!s.hover || !sameDay(s.hover, newHover)){
          s.hover = newHover;
          // 使用局部更新而不是完整renderPopup()，避免打断click
          updateHoverHighlight();
        }
      }
    };
    
    // V8.17 新增：只更新hover高亮，不重建DOM
    function updateHoverHighlight(){
      let rA = s.from, rB = s.to;
      if(rA && !rB && s.hover){
        if(s.hover < rA){ rB = rA; rA = s.hover; }
        else rB = s.hover;
      }
      if(rA && rB && rA > rB){ const t=rA; rA=rB; rB=t; }
      // 遍历所有cell，更新class
      popup.querySelectorAll('.brp-day').forEach(cell => {
        const d = parse(cell.dataset.d);
        if(!d) return;
        cell.classList.remove('in-range','range-start','range-end');
        if(rA && rB){
          if(d >= rA && d <= rB) cell.classList.add('in-range');
          if(sameDay(d, rA)) cell.classList.add('range-start');
          if(sameDay(d, rB)) cell.classList.add('range-end');
        } else if(rA && sameDay(d, rA)){
          cell.classList.add('range-start','range-end');
        }
      });
    }
  }

  // 显示弹窗（定位到 trigger 下方）
  function showPopup(trigger, state){
    const popup = createPopup();
    activeTrigger = trigger;
    trigger.classList.add('active');
    popupState = state;
    renderPopup();
    popup.classList.add('show');
    // 定位
    const rect = trigger.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const top = rect.bottom + scrollY + 6;
    let left = rect.left + scrollX;
    // 防溢出（右边距 16）
    const popupW = popup.offsetWidth;
    const vpRight = window.innerWidth - 16;
    if(left + popupW > vpRight + scrollX) left = Math.max(16+scrollX, vpRight + scrollX - popupW);
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  }

  // 点外部关闭
  document.addEventListener('mousedown', function(e){
    const popup = document.getElementById('__brpPopup');
    if(!popup || !popup.classList.contains('show')) return;
    // 检查点击目标是否在 popup 或 trigger 内
    // 注意：用 closest 而不是 contains，因为 contains 对文本节点和已脱离DOM的元素可能失败
    if(e.target && e.target.closest){
      if(e.target.closest('#__brpPopup')) return;
      if(activeTrigger && e.target.closest) {
        let n = e.target;
        while(n){
          if(n === activeTrigger) return;
          n = n.parentNode;
        }
      }
    }
    if(popup.contains(e.target)) return;
    if(activeTrigger && activeTrigger.contains(e.target)) return;
    hidePopup();
  });
  // Esc 关闭
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape') hidePopup();
  });

  // 格式化触发按钮显示
  function renderTrigger(trigger, from, to){
    const text = (from && to)
      ? `<span>${fmtDisp(from)}</span><span class="brp-range-sep">~</span><span>${fmtDisp(to)}</span>`
      : `<span style="color:#9ca3af">选择日期范围</span>`;
    trigger.innerHTML = `
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 7V3M16 7V3M3 11h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/></svg>
      <span class="brp-range-text">${text}</span>
      ${(from||to)?'<span class="brp-clear" data-clear="1">✕</span>':''}
    `;
  }

  // ---- Public API ----
  // attach(opts): 绑定两个 input + 自动插入触发按钮
  // opts:
  //   fromInput: selector for 起始 input（类型 date 或 text）
  //   toInput:   selector for 结束 input
  //   container: 可选，triggerEl 插入容器；默认插在 fromInput 前面
  //   onChange(from,to) 可选回调（from/to 是 'YYYY-MM-DD'）
  function attach(opts){
    const fromInput = typeof opts.fromInput==='string' ? document.querySelector(opts.fromInput) : opts.fromInput;
    const toInput   = typeof opts.toInput==='string'   ? document.querySelector(opts.toInput)   : opts.toInput;
    if(!fromInput || !toInput){ console.warn('[BRP] input 未找到', opts); return null; }

    // 创建触发按钮
    const trigger = document.createElement('div');
    trigger.className = 'brp-trigger';
    trigger.tabIndex = 0;

    // 初始值从 input 拿
    renderTrigger(trigger, fromInput.value||'', toInput.value||'');

    // 把原 input 隐藏（保留其值参与筛选逻辑）
    fromInput.style.display = 'none';
    toInput.style.display = 'none';
    // V8.38：同时隐藏 input 之间的 separator（"~"），避免孤立显示
    const parent = fromInput.parentElement;
    if(parent){
      parent.querySelectorAll('.date-range-separator, .brp-native-sep').forEach(s => { s.style.display = 'none'; });
    }
    // 把触发按钮插到 fromInput 前
    fromInput.parentElement.insertBefore(trigger, fromInput);

    trigger.addEventListener('click', function(e){
      if(e.target && e.target.dataset && e.target.dataset.clear){
        // 清空
        fromInput.value = ''; toInput.value = '';
        renderTrigger(trigger, '', '');
        fromInput.dispatchEvent(new Event('change', {bubbles:true}));
        toInput.dispatchEvent(new Event('change', {bubbles:true}));
        if(opts.onChange) opts.onChange('', '');
        e.stopPropagation();
        return;
      }
      // 打开弹窗
      const from = parse(fromInput.value);
      const to   = parse(toInput.value);
      const today = new Date();
      showPopup(trigger, {
        from, to, hover:null, activeShortcut:null,
        viewDate: from ? new Date(from.getFullYear(), from.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth()-1, 1),
        minDate: opts.minDate ? parse(opts.minDate) : null,
        maxDate: opts.maxDate ? parse(opts.maxDate) : null,
        onApply: function(a,b){
          fromInput.value = a; toInput.value = b;
          renderTrigger(trigger, a, b);
          fromInput.dispatchEvent(new Event('change', {bubbles:true}));
          toInput.dispatchEvent(new Event('change', {bubbles:true}));
          if(opts.onChange) opts.onChange(a,b);
        },
        onClear: function(){
          // 仅视觉清空，OK 后才真正生效
        }
      });
    });
    return {
      trigger,
      refresh(){ renderTrigger(trigger, fromInput.value||'', toInput.value||''); }
    };
  }

  // 保存所有已创建的 picker，供外部批量刷新
  const _pickers = [];
  function syncAll(){
    for(const p of _pickers){ try{ p.refresh(); }catch(_){} }
  }
  // 包装一下 attach：把返回值收集起来
  const _rawAttach = attach;
  function attachTracked(opts){
    const ret = _rawAttach(opts);
    if(ret) _pickers.push(ret);
    return ret;
  }

  global.BailingRangePicker = { attach: attachTracked, syncAll };
})(typeof window!=='undefined' ? window : this);
// 全量更新 2026-05-27
