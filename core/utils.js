/**
 * 百灵仪表盘 - 通用工具函数
 * 包括：DOM选择器、HTML/属性转义、Excel日期转换、字符串处理
 */
(function(global){
  'use strict';

  // DOM shortcut
  function $(sel){ return document.querySelector(sel); }
  function $$(sel){ return Array.from(document.querySelectorAll(sel)); }

  // HTML 转义（防 XSS）
  function escHtml(str){
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escAttr(str){ return escHtml(str); }

  // Excel 序列号日期 → 'YYYY-MM-DD' 字符串
  function excelDateToString(v){
    if (v == null || v === '') return '';
    if (typeof v === 'string'){
      const s = v.trim();
      // yyyy-mm-dd / yyyy/mm/dd
      if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(s)){
        const parts = s.split(/[T\s]/)[0].split(/[-\/]/);
        return parts[0] + '-' + String(parts[1]).padStart(2,'0') + '-' + String(parts[2]).padStart(2,'0');
      }
      // yyyymmdd
      if (/^\d{8}$/.test(s)){
        return s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
      }
      return s;
    }
    if (typeof v === 'number' && isFinite(v)){
      // Excel 序列号：1900-01-01 起算，1900 闰年 bug
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const ms = Math.round(v * 24 * 3600 * 1000);
      const d = new Date(epoch.getTime() + ms);
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
    }
    if (v instanceof Date){
      return v.getFullYear() + '-' + String(v.getMonth()+1).padStart(2,'0') + '-' + String(v.getDate()).padStart(2,'0');
    }
    return String(v);
  }

  // 简化的规范化字符串（trim + lowercase）
  function norm(v){ return String(v == null ? '' : v).trim().toLowerCase(); }

  // 数字安全化
  function toNumber(v, fallback){
    const n = Number(v);
    return isFinite(n) ? n : (fallback == null ? 0 : fallback);
  }

  // 深拷贝（简单版）
  function cloneDeep(obj){ return JSON.parse(JSON.stringify(obj)); }

  // debounce
  function debounce(fn, wait){
    let t; return function(){ const ctx=this, args=arguments;
      clearTimeout(t); t=setTimeout(()=>fn.apply(ctx, args), wait);
    };
  }

  global.BailingUtils = { $, $$, escHtml, escAttr, excelDateToString, norm, toNumber, cloneDeep, debounce };
})(typeof window !== 'undefined' ? window : this);
// 全量更新 2026-05-27
